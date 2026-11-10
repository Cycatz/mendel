// Pen-and-watercolour renderer, in the manner of hand-painted background art.
// Passes per frame:
//   1. pigment: albedo (rgb) + direct light × shadow (a), with depth  -> colour, light, mask
//   2. normals: view-space normals                                     -> outlines
//   3. ground: objects on GROUND_LAYER, albedo + shadow (a), with depth -> the field
//   4. composite: a cerulean sky with outlined cumulus, the field, then the plant. Every
//      surface is split into warm, clear sunlight and a cool teal shadow along a slightly
//      wobbly terminator. The plant is a yellow-green wash over cream paper with heavy ink
//      outlines.
import * as THREE from 'three';

const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tColor, tNormal, tDepth, tGround, tGroundDepth, tGrass, tGrassDepth;
uniform vec2 res;
uniform float px, near, far, gNear, gFar;
uniform vec3 ink, sunView, sunWorld;
uniform sampler2D tCrownShade;     // shadows of tree crowns on the field, centred on the origin
uniform float crownExtent;         // half the width the crown-shadow texture covers, m
uniform mat4 invProj, camWorld, viewProj;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// two octaves: cheaper, and enough for the soft per-pixel variation
float fbm2(vec2 p) { return 0.667 * noise(p) + 0.333 * noise(p * 2.03 + 11.7); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 sat(vec3 c, float k) { return mix(vec3(lum(c)), c, k); }

const vec3 FIELD_FAR = vec3(0.56, 0.77, 0.4);   // where the ground meets the backdrop
float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
float mask(vec2 uv) { return step(rawDepth(uv), 0.99999); }
float linearize(float raw) { float z = raw * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
float linDepth(vec2 uv) { return linearize(rawDepth(uv)); }
float groundRaw(vec2 uv) { return texture2D(tGroundDepth, uv).x; }
// is there a landscape object (not the field, which writes black) in the ground pass here?
float objAt(vec2 uv) { vec4 c = texture2D(tGround, uv); return step(texture2D(tGroundDepth, uv).x, 0.99999) * step(0.01, max(c.r, max(c.g, c.b))); }
float groundDist(float raw) { float z = raw * 2.0 - 1.0; return 2.0 * gNear * gFar / (gFar + gNear - z * (gFar - gNear)); }
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

// Two-tone light: which side of the terminator a point is on (1 = sun), and the two paints.
// (wob: a per-pixel wobble of the terminator, computed once in main)
float sunSide(float lit, float wob) { return smoothstep(0.34, 0.44, lit + wob); }
vec3 inSun(vec3 c, float k) { return clamp(sat(c, k) * vec3(1.12, 1.08, 0.88) + vec3(0.05, 0.05, 0.0), 0.0, 1.0); }
vec3 inShade(vec3 c) { return sat(c, 1.1) * vec3(0.5, 0.64, 0.8) + vec3(0.02, 0.07, 0.11); }

// world-space view ray through a screen point
vec3 rayAt(vec2 uv) {
  vec4 v = invProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((camWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
// cloud density on a deck overhead, seen in perspective: big soft heaps with scalloped edges
float cloudAt(vec3 d) {
  vec2 p = d.xz / max(d.y, 0.03) * 0.9 + vec2(3.7, 1.2);
  return 0.48 * noise(p * 0.5) + 0.34 * noise(p * 1.7 + 5.0) + 0.18 * noise(p * 4.2 + 9.0);
}

// line strength at uv for a sampling radius r (in uv units)
float edges(vec2 uv, vec2 r) {
  float mC = mask(uv), dC = linDepth(uv);
  vec3 nC = nrm(uv);
  float sil = 0.0, dep = 0.0, cre = 0.0;
  vec2 dirs[4];
  dirs[0] = vec2(1, 0); dirs[1] = vec2(0, 1); dirs[2] = vec2(0.7071, 0.7071); dirs[3] = vec2(0.7071, -0.7071);
  for (int i = 0; i < 4; i++) {
    vec2 o = dirs[i] * r;
    float ma = mask(uv + o), mb = mask(uv - o);
    sil = max(sil, max(abs(mC - ma), abs(mC - mb)));
    if (mC * ma * mb > 0.5) {
      float da = linDepth(uv + o), db = linDepth(uv - o);
      // second difference ignores smoothly receding surfaces, catches overlaps
      dep = max(dep, smoothstep(0.012, 0.03, abs(da + db - 2.0 * dC) / dC));
      dep = max(dep, smoothstep(0.03, 0.08, max(abs(da - dC), abs(db - dC)) / dC));
      cre = max(cre, smoothstep(0.35, 0.8, 1.0 - min(dot(nC, nrm(uv + o)), dot(nC, nrm(uv - o)))));
    }
  }
  return max(sil, max(dep * 0.9, cre * 0.45));
}

// the sky and the painted backdrop, by view direction
vec3 skyCol(vec2 uv) {
  vec2 texel = 1.0 / res;
  vec2 frag = gl_FragCoord.xy / px;
  vec3 bg;
    // ---- sky: cerulean paling to the horizon, puffy cumulus with lit tops and blue-grey bases ----
    vec3 dir = rayAt(uv);
    float up = clamp(dir.y, 0.0, 1.0);
    bg = mix(vec3(0.74, 0.87, 0.93), vec3(0.22, 0.52, 0.84), smoothstep(0.0, 0.5, up));
    float f = cloudAt(dir), th = 0.6;
    float fw = max(fwidth(f), 1e-4);
    float show = smoothstep(0.08, 0.22, up);   // the deck thins out toward the horizon
    float cloud = smoothstep(th - fw, th + fw, f) * show;
    if (cloud > 0.0) {
      float base = smoothstep(0.0, 0.07, cloudAt(rayAt(uv + vec2(0.0, 16.0 * px * texel.y))) - f);
      bg = mix(bg, mix(vec3(1.0, 0.99, 0.95), vec3(0.68, 0.75, 0.88), base * 0.9), cloud);
    }
    bg = mix(bg, vec3(0.42, 0.52, 0.68), (1.0 - smoothstep(0.5, 1.5, abs(f - th) / fw)) * show * 0.75);
    // ---- backdrop: painted ridges, hills and a treeline around the horizon. They are drawn
    //      by direction only (at infinity), so there is nothing far away to render ----
    float az = atan(dir.z, dir.x), t = dir.y / max(length(dir.xz), 1e-4);
    float aaT = max(fwidth(t), 1e-4);
    vec3 hz = vec3(0.74, 0.87, 0.9);
    float w1 = 0.5 + 0.5 * (0.5 * sin(3.0 * az + 1.0) + 0.3 * sin(7.0 * az + 4.0) + 0.2 * sin(13.0 * az + 2.0));
    float w2 = 0.5 + 0.5 * (0.5 * sin(5.0 * az + 2.5) + 0.3 * sin(11.0 * az + 0.4) + 0.2 * sin(19.0 * az + 3.3));
    float hFar = 0.05 + 0.07 * w1 * w1;
    float hMid = 0.028 + 0.04 * w2;
    float cells = 140.0, cu = az / 6.2832 * cells, cid = mod(floor(cu), cells), cf = fract(cu);
    float hTree = 0.012 + 0.014 * w1 + (0.006 + 0.012 * hash(vec2(cid, 3.0))) * sqrt(max(1.0 - pow(2.0 * cf - 1.0, 2.0), 0.0));
    float mF = 1.0 - smoothstep(-aaT, aaT, t - hFar);
    float mM = 1.0 - smoothstep(-aaT, aaT, t - hMid);
    float mT = (1.0 - smoothstep(-aaT, aaT, t - hTree)) * smoothstep(-aaT, aaT, t);
    vec3 cFar = mix(vec3(0.5, 0.66, 0.62), hz, 0.45);
    vec3 cMid = mix(vec3(0.5, 0.74, 0.4), hz, 0.3);
    vec3 cTree = mix(vec3(0.55, 0.74, 0.28), vec3(0.3, 0.52, 0.42), smoothstep(hTree * 0.7, 0.0, t) * 0.7);
    vec3 sepiaB = vec3(0.32, 0.27, 0.22);
    float lF = (1.0 - smoothstep(0.0, 1.6 * aaT, abs(t - hFar))) * 0.3;
    float lM = (1.0 - smoothstep(0.0, 1.6 * aaT, abs(t - hMid))) * 0.4;
    float lT = (1.0 - smoothstep(0.0, 1.6 * aaT, abs(t - hTree))) * 0.6 * step(0.0, t);
    bg = mix(bg, cFar, mF);       bg = mix(bg, sepiaB, lF * mF * step(0.0, t - hFar + 3.0 * aaT));
    bg = mix(bg, cMid, mM);       bg = mix(bg, sepiaB, lM * mM);
    bg = mix(bg, cTree, mT);      bg = mix(bg, ink, lT);
    // below the horizon, past the end of the ground, is just more field
    bg = mix(bg, FIELD_FAR, 1.0 - smoothstep(-aaT, aaT, t));
  return bg;
}

// the yellow-green wash a foliage albedo is painted with, in warm sun and teal shade
vec3 wash(vec3 linAlb, float lit, float wob) {
  vec3 alb = pow(max(linAlb, 0.0), vec3(1.0 / 2.2));
  alb = mix(vec3(lum(alb)), alb, 0.95);
  alb = alb * vec3(1.18, 1.1, 0.62) + vec3(0.08, 0.07, 0.0);
  alb = mix(alb, vec3(0.96, 0.93, 0.7), 0.15);
  return mix(inShade(alb), inSun(alb, 1.15), sunSide(lit, wob));
}

// One scale of painted grass strokes. A blade standing at B covers the pixels above it on
// screen, which look at ground just beyond B, so only cells toward the camera can reach here.
// "cell" is the grid size in metres (0.07 near the plant); a blade's height scales with it, but
// is capped so that its reach stays within the cells scanned. Blades are dense near the plant
// and thin smoothly to a sparser population by 5 m, which then fades out toward 65 m.
vec3 bladeLayer(vec3 field, vec2 P, vec2 frag, vec3 camPos, float cell, float weight) {
  vec2 toCam = normalize(camPos.xz - P + vec2(1e-4)), prev = vec2(1e9);
  float sc = cell / 0.07;
  for (int k = 0; k < 6; k++) {
    vec2 c = floor((P + toCam * float(k) * 0.06 * sc) / cell);
    if (c == prev) continue;
    prev = c;
    vec2 B = (c + vec2(hash(c + 3.1), hash(c + 7.7))) * cell;
    float lB = length(B), dB = length(B - camPos.xz);
    float farK = 1.0 - smoothstep(30.0, 65.0, dB);
    if (hash(c * 0.37 + 11.0) > mix(0.65, 0.3, smoothstep(0.4, 5.0, lB)) * farK) continue;
    float h = min((0.035 + 0.05 * hash(c + 1.3)) * sc, 5.0 * cell * max(camPos.y, 0.2) / max(dB, 1.0));
    float jit = 0.04 * sc;
    vec4 b0 = viewProj * vec4(B.x, 0.0, B.y, 1.0);
    vec4 b1 = viewProj * vec4(B.x + (hash(c + 5.0) - 0.5) * jit, h, B.y + (hash(c + 6.0) - 0.5) * jit, 1.0);
    vec2 s0 = (b0.xy / b0.w * 0.5 + 0.5) * res / px, s1 = (b1.xy / b1.w * 0.5 + 0.5) * res / px;
    vec2 pa = frag - s0, ba = s1 - s0;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    float w = mix(0.8, 0.25, t);         // tapers to the tip
    float blade = (1.0 - smoothstep(w, w + 0.8, length(pa - ba * t))) * smoothstep(2.0, 5.0, length(ba));
    vec3 tone = hash(c + 9.0) < 0.75 ? field * vec3(0.84, 0.9, 0.8) : min(field * 1.1 + vec3(0.05, 0.04, 0.0), vec3(1.0));
    field = mix(field, tone, blade * 0.55 * weight);
  }
  return field;
}

// a landscape object (tree) seen at uvG: wash, light and outline
vec3 treeCol(vec2 uvG, vec2 frag, float wob) {
  vec2 texel = 1.0 / res;
  float gRaw = groundRaw(uvG);
  float gD = groundDist(gRaw);
  vec4 gC = texture2D(tGround, uvG);
  vec3 bg;
    // ---- trees: painted like the plant, a yellow-green wash in warm sun and teal shade over
    //      cream paper, with heavy ink outlines where near ----
    float far = 1.0 - exp(-gD / 600.0);      // aerial perspective
    vec3 pig = wash(gC.rgb, gC.a, wob);
    float gran = fbm2(frag / 2.4 + 1.7);
    bg = mix(vec3(0.949, 0.914, 0.831), pig * 0.97, clamp(0.72 + 0.35 * gran, 0.0, 1.0));
    // outer edges: the neighbour is sky or something well behind
    float sil = 0.0;
    for (int i = 0; i < 8; i++) {   // a ring, so the line varies smoothly instead of in steps
      float an = float(i) * 0.7854 + 0.39;
      sil += step(gD * 1.04, groundDist(groundRaw(uvG + vec2(cos(an), sin(an)) * 1.4 * px * texel))) * 0.125;
    }
    sil = smoothstep(0.0, 0.7, sil);
    bg = mix(bg, vec3(0.74, 0.87, 0.9), far * 0.85);
    bg = mix(bg, ink, sil * (1.0 - far) * (0.7 + 0.3 * smoothstep(0.2, 0.55, noise(frag / 5.0))));
  return bg;
}

void main() {
  vec2 frag = gl_FragCoord.xy / px;           // CSS pixels
  vec2 texel = 1.0 / res;                     // one device pixel in uv

  // noise shared by several effects below, computed once
  vec2 drift = vec2(fbm2(frag / 60.0 + 4.0), fbm2(frag / 60.0 + 8.5)) - 0.5;   // large, slow offsets
  float wob = (noise(frag / 22.0) - 0.5) * 0.16;                            // terminator wobble
  vec2 sd = normalize(sunView.xy + vec2(1e-4));
  vec3 camPos = camWorld[3].xyz;

  // ---- the ground pass: the field (black) and landscape objects standing on it ----
  vec2 uvG = vUv + drift * 4.0 * px * texel;
  float gRaw = groundRaw(uvG);
  float gM = step(gRaw, 0.99999);
  float gD = groundDist(gRaw);
  vec4 gC = texture2D(tGround, uvG);
  float isT = objAt(uvG);
  vec3 bg;

  if (gM < 0.5) {
    bg = skyCol(vUv);
  } else if (isT < 0.5) {
    // ---- the field: one clean, sunlit green, with gentle broad variations fixed to the ground ----
    vec3 dG = rayAt(uvG);
    vec2 P = camPos.xz + dG.xz * (camPos.y / max(-dG.y, 1e-4));   // where this pixel meets the ground
    vec3 field = mix(vec3(0.66, 0.82, 0.25), vec3(0.54, 0.77, 0.38), smoothstep(4.0, 120.0, gD));
    field *= 1.0 + 0.07 * (noise(P / 18.0) - 0.5) + 0.03 * (noise(P / 3.5) - 0.5);
    // mid-range interest, fading out before the backdrop: pooled washes of yellow and blue-green,
    // and wide mown bands that foreshorten with distance
    float midK = 1.0 - smoothstep(35.0, 75.0, gD);
    field = mix(field, vec3(0.8, 0.83, 0.27), smoothstep(0.55, 0.75, noise(P / 11.0 + 4.0)) * 0.5 * midK);
    field = mix(field, vec3(0.34, 0.66, 0.4), smoothstep(0.58, 0.78, noise(P / 27.0 + 9.0)) * 0.4 * midK);
    float band = smoothstep(-0.35, 0.35, sin((mat2(0.9, -0.44, 0.44, 0.9) * P).x / 3.0 + (noise(P / 16.0) - 0.5) * 2.4 + (noise(P / 6.0) - 0.5) * 0.8));
    field *= mix(vec3(1.0), mix(vec3(0.92, 0.96, 0.9), vec3(1.06, 1.05, 1.0), band), midK);
    field = sat(field, 0.95);
    // fine grass strokes, from the plant out to the mid-range. The grid grows with distance from
    // the camera (relative to the plant's distance), so a stroke keeps about the same size on
    // screen; two scales crossfade, and near the plant it is the original fine grid.
    if (gD < 70.0) {
      float dC = max(length(camPos), 0.5), lv = log2(max(length(P - camPos.xz) / dC, 1.0));
      float k = floor(lv), f = lv - k;
      field = bladeLayer(field, P, frag, camPos, 0.07 * exp2(k), 1.0 - f);
      if (f > 0.01) field = bladeLayer(field, P, frag, camPos, 0.07 * exp2(k + 1.0), f);
    }
    // soft shadows of tree crowns, with a little jag in their edges
    float crownShade = 0.0;
    if (max(abs(P.x), abs(P.y)) < crownExtent) {
      vec2 jag = (vec2(noise(P * 0.6), noise(P * 0.6 + 3.0)) - 0.5) * 1.5;
      crownShade = texture2D(tCrownShade, (P + jag) / (2.0 * crownExtent) + 0.5).r;
    }
    bg = mix(inShade(field), field, sunSide(gC.a * (1.0 - crownShade), wob));
    // pigment collects along the edge of a cast shadow
    vec2 o2 = 2.5 * px * texel;
    float shN = (texture2D(tGround, uvG + vec2(o2.x, 0.0)).a + texture2D(tGround, uvG - vec2(o2.x, 0.0)).a
               + texture2D(tGround, uvG + vec2(0.0, o2.y)).a + texture2D(tGround, uvG - vec2(0.0, o2.y)).a) * 0.25;
    bg *= 1.0 - 0.15 * smoothstep(0.08, 0.3, abs(shN - gC.a));
    bg = mix(bg, FIELD_FAR, smoothstep(45.0, 88.0, gD));   // melts into the backdrop
  } else {
    bg = treeCol(uvG, frag, wob);
  }

  // soften the edge between the sky and a tree: the ground layer is drawn at twice the
  // resolution, so four sub-samples say how much of this pixel is sky
  {
    vec2 e = 0.25 * texel;
    float nSky = 0.0, nSolid = 0.0;
    vec2 solid = uvG;
    for (int i = 0; i < 4; i++) {
      vec2 u = uvG + vec2(i < 2 ? -e.x : e.x, (i == 0 || i == 2) ? -e.y : e.y);
      if (groundRaw(u) >= 0.99999) nSky += 1.0;
      else if (objAt(u) > 0.5) { solid = u; nSolid += 1.0; }
    }
    if (nSky > 0.5 && nSolid > 0.5 && (gM < 0.5 || isT > 0.5)) {
      vec3 sk = gM < 0.5 ? bg : skyCol(vUv);
      vec3 tr = gM < 0.5 ? treeCol(solid, frag, wob) : bg;
      bg = mix(tr, sk, nSky / (nSky + nSolid));
    }
  }
  // grass: painted like the trees and the plant (a wash over cream paper with granulation,
  // pigment pooled at the drying edge, and a fine broken ink line), wherever a blade is nearer
  // than the ground pass. The grass target has plain coverage in its alpha, so averaging a few
  // taps gives clean anti-aliased coverage and the edge strength for the line.
  {
    vec2 ob = 2.0 * px * texel;
    vec3 gA = vec3(0.0);
    float gN = 0.0, gMin = 1.0;
    for (int i = 0; i < 5; i++) {
      vec2 d = i == 0 ? vec2(0.0) : (i < 3 ? vec2(i == 1 ? -1.0 : 1.0, 0.0) : vec2(0.0, i == 3 ? -1.0 : 1.0));
      vec2 u = uvG + d * ob;
      vec4 c = texture2D(tGrass, u);
      gA += c.rgb; gN += c.a;
      gMin = min(gMin, texture2D(tGrassDepth, u).x);
    }
    float g = gN / 5.0, dist = groundDist(gMin), seen = step(gMin, gRaw);
    if (g > 0.0 && seen > 0.5) {
      float gran = fbm2(frag / 2.4 + 1.7);
      vec3 pig = wash(gA / max(gN, 1e-3), 1.0, wob);
      vec3 pl = mix(vec3(0.949, 0.914, 0.831), pig * 0.97, clamp(0.72 + 0.35 * gran, 0.0, 1.0));
      pl *= 1.0 - 0.3 * clamp((1.0 - g) * 1.6, 0.0, 1.0);           // pigment pools at the edge
      pl = mix(pl, FIELD_FAR, smoothstep(40.0, 75.0, dist) * 0.9);   // dissolves into the backdrop
      float line = smoothstep(0.12, 0.4, g) * (1.0 - smoothstep(0.6, 0.95, g));
      line *= (0.7 + 0.3 * smoothstep(0.2, 0.55, noise(frag / 5.0))) * (1.0 - smoothstep(6.0, 28.0, dist)) * 0.25;
      bg = mix(bg, pl, smoothstep(0.1, 0.5, g));
      bg = mix(bg, ink, line);
    }
  }
  vec3 col = bg;

  // ---- the plant: a hand-coloured engraving. A wash over cream paper that bleeds a little past
  //      heavy ink outlines ----
  vec2 r3 = 4.0 * px * texel;
  float m = mask(vUv);
  float nearPlant = max(m, max(max(mask(vUv + vec2(r3.x, 0.0)), mask(vUv - vec2(r3.x, 0.0))),
                               max(mask(vUv + vec2(0.0, r3.y)), mask(vUv - vec2(0.0, r3.y)))));
  if (nearPlant > 0.0) {
    vec3 pap = vec3(0.949, 0.914, 0.831);
    pap *= 0.965 + 0.05 * fbm2(frag / 1.6);                      // fibres
    pap *= 0.975 + 0.035 * fbm2(frag / 260.0 + 3.1);             // mottling

    // watercolour wash, misregistered a little from the engraved line
    vec2 bleed = (vec2(fbm2(frag / 55.0), fbm2(frag / 55.0 + 7.3)) - 0.5) * 5.0 * px * texel;
    vec2 uvW = vUv + bleed;
    vec4 cW = texture2D(tColor, uvW);
    float mW = mask(uvW);
    vec3 alb = pow(max(cW.rgb, 0.0), vec3(1.0 / 2.2));
    alb = mix(vec3(lum(alb)), alb, 0.95);                       // lively body colour
    alb = alb * vec3(1.18, 1.1, 0.62) + vec3(0.08, 0.07, 0.0);  // yellow, like gamboge-mixed greens
    alb = mix(alb, vec3(0.96, 0.93, 0.7), 0.15);                // transparent washes over cream paper
    vec3 pig = mix(inShade(alb), inSun(alb, 1.15), sunSide(cW.a, wob));   // warm sun, cool teal shadow
    float gran = fbm2(frag / 2.4 + 1.7);
    float density = mW * (0.62 + 0.4 * gran) * (1.0 - 0.45 * smoothstep(0.75, 1.0, 0.3 + 0.7 * cW.a));
    float rim = 0.0;                                            // pigment pools at the drying edge
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.5708 + 0.7854;
      rim += mask(uvW + vec2(cos(a), sin(a)) * 3.5 * px * texel);
    }
    float pool = mW * (1.0 - rim / 4.0);
    vec3 pl = mix(pap, pig * (0.92 + 0.08 * pap), clamp(density, 0.0, 1.0));
    pl *= 1.0 - 0.3 * pool;
    col = mix(bg, pl, mW);   // the landscape is left alone outside the wash

    // ink
    float shC = 0.3 + 0.7 * texture2D(tColor, vUv).a;
    vec2 wob2 = (vec2(noise(frag / 9.0), noise(frag / 9.0 + 19.1)) - 0.5) * 1.4 * px * texel;
    float weight = 0.75 + 0.9 * (1.0 - shC) * m;                // heavier line on the shadow side
    float line = edges(vUv + wob2, weight * px * texel);
    line *= 0.75 + 0.25 * smoothstep(0.2, 0.55, noise(frag / 5.0));

    col = mix(col, ink, clamp(line, 0.0, 1.0));

    // whatever the ground pass has in front of the plant: the field over its roots (thinly, so
    // they show through), or a tree
    float behind = mW * gM * step(gD + 0.002, linDepth(uvW));
    col = mix(col, bg, behind * mix(0.6, 1.0, isT));
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export type Plate = ReturnType<typeof createPlate>;

// Objects on this layer (and only this layer) are the ground and the landscape on it. Their
// material writes albedo (rgb) and light × shadow (a); the field writes black albedo, so the
// composite can tell it from trees. Lights must be enabled on this layer too.
export const GROUND_LAYER = 1;
// Grass tufts are drawn on their own layer into their own target (colour, coverage, depth).
export const GRASS_LAYER = 2;

export function createPlate(renderer: THREE.WebGLRenderer) {
  const opts = { type: THREE.UnsignedByteType };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, opts);
  const groundRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  // grass: colour with plain coverage in alpha (so filtering blends it cleanly), and its own depth
  const grassRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });

  // Lambert lighting, but write albedo and the direct-light factor separately.
  // With the light at intensity π, directDiffuse / albedo = N·L × shadow in [0, 1].
  const pigmentMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  pigmentMat.onBeforeCompile = (s) => {
    // a thin blade is drawn by whichever face is shown, so turn every normal toward the viewer
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      if (dot(normal, vViewPosition) < 0.0) normal = -normal;`);
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      float alb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
      float lit = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114)) / alb;
      gl_FragColor = vec4(diffuseColor.rgb, clamp(lit, 0.0, 1.0));`);
  };
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const groundCam = new THREE.PerspectiveCamera();

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tNormal: { value: normalRT.texture }, tDepth: { value: colorRT.depthTexture },
      tGround: { value: groundRT.texture }, tGroundDepth: { value: groundRT.depthTexture }, tGrass: { value: grassRT.texture }, tGrassDepth: { value: grassRT.depthTexture }, gNear: { value: 0.05 }, gFar: { value: 400 },
      res: { value: new THREE.Vector2() }, px: { value: 1 }, near: { value: 0.05 }, far: { value: 400 },
      ink: { value: new THREE.Color() }, sunView: { value: new THREE.Vector3(0, 1, 0) }, sunWorld: { value: new THREE.Vector3(0, 1, 0) },
      tCrownShade: { value: null }, crownExtent: { value: 1 },
      invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, viewProj: { value: new THREE.Matrix4() },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMPOSITE,
    depthTest: false, depthWrite: false,
  }));
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = quad.material.uniforms;
  const sunWorld = new THREE.Vector3(0, 1, 0);

  return {
    pigmentMat,
    // the colour is given as a CSS hex string in sRGB and used as-is by the composite
    setInk(inkCss: string) {
      U.ink.value.setStyle(inkCss, THREE.SRGBColorSpace).convertLinearToSRGB();
    },
    // world-space direction toward the sun, for the white edge strokes
    setSun(dir: THREE.Vector3) { sunWorld.copy(dir).normalize(); U.sunWorld.value.copy(sunWorld); },
    // a texture of tree-crown shadows on the field, covering ±extent metres around the origin
    setCrownShade(shade: { texture: THREE.Texture; extent: number }) {
      U.tCrownShade.value = shade.texture; U.crownExtent.value = shade.extent;
    },
    // draw(scene, camera, swap): swap(true) puts plants on pigmentMat and hides decor; swap(false) restores
    render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, swap: (on: boolean) => void) {
      const w = renderer.domElement.width, h = renderer.domElement.height;
      if (colorRT.width !== w || colorRT.height !== h) { colorRT.setSize(w, h); normalRT.setSize(w, h); groundRT.setSize(w * 2, h * 2); grassRT.setSize(w * 2, h * 2); }
      U.res.value.set(w, h);
      U.px.value = renderer.getPixelRatio();
      U.near.value = camera.near; U.far.value = camera.far;
      const bg = scene.background, fog = scene.fog;
      scene.background = null; scene.fog = null;
      const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
      swap(true);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(colorRT);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.shadowMap.autoUpdate = false;  // shadows from the pass above are reused
      scene.overrideMaterial = normalMat;
      renderer.setClearColor(0x8080ff, 1);
      renderer.setRenderTarget(normalRT);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      // the ground runs to the horizon, so it gets a camera that sees much farther
      groundCam.copy(camera);
      groundCam.far = U.gFar.value;
      groundCam.updateProjectionMatrix();
      groundCam.layers.set(GROUND_LAYER);
      U.gNear.value = groundCam.near;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(groundRT);
      renderer.clear();
      renderer.render(scene, groundCam);
      groundCam.layers.set(GRASS_LAYER);
      renderer.setRenderTarget(grassRT);
      renderer.clear();
      renderer.render(scene, groundCam);
      renderer.shadowMap.autoUpdate = true;
      swap(false);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, clearA);
      scene.background = bg; scene.fog = fog;
      U.invProj.value.copy(camera.projectionMatrixInverse);
      U.camWorld.value.copy(camera.matrixWorld);
      U.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      U.sunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
      renderer.render(quadScene, quadCam);
    },
  };
}
