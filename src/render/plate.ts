// Pen-and-watercolour renderer, in the manner of hand-painted background art.
// Passes per frame:
//   1. pigment: albedo (rgb) + direct light × shadow (a), with depth  -> colour, light, mask
//   2. normals: view-space normals                                     -> lines, hatching, highlights
//   3. ground: objects on GROUND_LAYER, albedo + shadow (a), with depth -> the field
//   4. composite: a cerulean sky with outlined cumulus, the field, then the plant. Every
//      surface is split into warm, clear sunlight and a cool teal shadow along a slightly
//      wobbly terminator. Thin sepia lines outline the plant, hatching follows its form in
//      shadow, and white strokes catch the edges that face the sun.
import * as THREE from 'three';

const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tColor, tNormal, tDepth, tGround, tGroundDepth;
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
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 sat(vec3 c, float k) { return mix(vec3(lum(c)), c, k); }

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

void main() {
  vec2 frag = gl_FragCoord.xy / px;           // CSS pixels
  vec2 texel = 1.0 / res;                     // one device pixel in uv

  // noise shared by several effects below, computed once
  vec2 drift = vec2(fbm(frag / 60.0 + 4.0), fbm(frag / 60.0 + 8.5)) - 0.5;   // large, slow offsets
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
    // ---- sky: cerulean paling to the horizon, puffy cumulus with lit tops and blue-grey bases ----
    vec3 dir = rayAt(vUv);
    float up = clamp(dir.y, 0.0, 1.0);
    bg = mix(vec3(0.74, 0.87, 0.93), vec3(0.22, 0.52, 0.84), smoothstep(0.0, 0.5, up));
    float f = cloudAt(dir), th = 0.6;
    float fw = max(fwidth(f), 1e-4);
    float show = smoothstep(0.08, 0.22, up);   // the deck thins out toward the horizon
    float cloud = smoothstep(th - fw, th + fw, f) * show;
    if (cloud > 0.0) {
      float base = smoothstep(0.0, 0.07, cloudAt(rayAt(vUv + vec2(0.0, 16.0 * px * texel.y))) - f);
      bg = mix(bg, mix(vec3(1.0, 0.99, 0.95), vec3(0.68, 0.75, 0.88), base * 0.9), cloud);
    }
    bg = mix(bg, vec3(0.42, 0.52, 0.68), (1.0 - smoothstep(0.5, 1.5, abs(f - th) / fw)) * show * 0.75);
  } else if (isT < 0.5) {
    // ---- the field: one clean, sunlit green, with gentle broad variations fixed to the ground ----
    vec3 dG = rayAt(uvG);
    vec2 P = camPos.xz + dG.xz * (camPos.y / max(-dG.y, 1e-4));   // where this pixel meets the ground
    vec3 field = mix(vec3(0.66, 0.82, 0.25), vec3(0.54, 0.77, 0.38), smoothstep(4.0, 120.0, gD));
    field *= 1.0 + 0.07 * (noise(P / 18.0) - 0.5) + 0.03 * (noise(P / 3.5) - 0.5);
    // fine grass strokes around the plant. A blade standing at B covers the pixels above it on
    // screen, which look at ground just beyond B, so only cells toward the camera can reach here.
    if (dot(P, P) < 20.0) {
      vec2 toCam = normalize(camPos.xz - P + vec2(1e-4)), prev = vec2(1e9);
      for (int k = 0; k < 5; k++) {
        vec2 c = floor((P + toCam * float(k) * 0.06) / 0.07);
        if (c == prev) continue;
        prev = c;
        vec2 B = (c + vec2(hash(c + 3.1), hash(c + 7.7))) * 0.07;
        if (hash(c * 0.37 + 11.0) > 0.8 * (1.0 - smoothstep(0.4, 4.3, length(B)))) continue;
        float h = 0.035 + 0.05 * hash(c + 1.3);
        vec4 b0 = viewProj * vec4(B.x, 0.0, B.y, 1.0);
        vec4 b1 = viewProj * vec4(B.x + (hash(c + 5.0) - 0.5) * 0.04, h, B.y + (hash(c + 6.0) - 0.5) * 0.04, 1.0);
        vec2 s0 = (b0.xy / b0.w * 0.5 + 0.5) * res / px, s1 = (b1.xy / b1.w * 0.5 + 0.5) * res / px;
        vec2 pa = frag - s0, ba = s1 - s0;
        float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
        float w = mix(0.8, 0.25, t);         // tapers to the tip
        float blade = (1.0 - smoothstep(w, w + 0.8, length(pa - ba * t))) * smoothstep(2.0, 5.0, length(ba));
        vec3 tone = hash(c + 9.0) < 0.75 ? field * vec3(0.84, 0.9, 0.8) : min(field * 1.1 + vec3(0.05, 0.04, 0.0), vec3(1.0));
        field = mix(field, tone, blade * 0.55 * (1.0 - smoothstep(1.5, 4.3, length(B))));
      }
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
    bg = mix(bg, vec3(0.74, 0.87, 0.9), (1.0 - exp(-gD / 600.0)) * 0.85);
  } else {
    // ---- trees: flat washes in three tones (yellow-green light, green middle, turquoise
    //      shade) with crisp, wandering boundaries, pigment collected where tones meet, a little
    //      granulation in the shade, and line only where near and shaded ----
    float far = 1.0 - exp(-gD / 600.0);      // aerial perspective
    vec3 ta = pow(max(gC.rgb, 0.0), vec3(1.0 / 2.2));
    float tw = (noise(frag / 26.0 + 2.0) - 0.5) * 0.22;   // boundaries wander in broad shapes
    float L = gC.a + tw;
    float lz = smoothstep(0.655, 0.685, L), sz = 1.0 - smoothstep(0.385, 0.415, L);
    vec3 light = clamp(ta * vec3(1.18, 1.12, 0.62) + vec3(0.14, 0.12, 0.0), 0.0, 1.0);
    vec3 shade = ta * vec3(0.42, 0.72, 0.9) + vec3(0.0, 0.12, 0.2);
    bg = mix(mix(ta, light, lz), shade, sz);
    // within each tone the wash still varies softly with the light, as it does when it dries
    bg *= mix(0.92, 1.05, smoothstep(0.2, 0.95, gC.a)) * (1.0 + 0.06 * (noise(frag / 40.0) - 0.5)) - 0.06 * sz * noise(frag / 1.6);
    // neighbours: which tone they are in, and whether they are still tree
    vec2 o1 = 1.5 * px * texel;
    vec2 nb[4];
    nb[0] = vec2(o1.x, 0.0); nb[1] = -nb[0]; nb[2] = vec2(0.0, o1.y); nb[3] = -nb[2];
    // an outer edge is where the neighbour is sky or something well behind; where a hill runs
    // into the field at the same distance there is no edge
    float zone = step(0.67, L) + step(0.4, L), toneEdge = 0.0, sil = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = texture2D(tGround, uvG + nb[i]).a + tw;
      toneEdge = max(toneEdge, abs(step(0.67, a) + step(0.4, a) - zone));
      sil += step(gD * 1.04, groundDist(groundRaw(uvG + nb[i]))) * 0.25;
    }
    bg *= 1.0 - 0.12 * min(toneEdge, 1.0) - 0.22 * sil * (1.0 - lz);
    bg = mix(bg, vec3(0.74, 0.87, 0.9), far * 0.85);
    bg = mix(bg, vec3(0.36, 0.3, 0.24), sil * (1.0 - lz) * (1.0 - far) * smoothstep(0.3, 0.55, noise(frag / 6.0)) * 0.5);
    bg = mix(bg, vec3(1.0, 0.98, 0.9), step(gD * 1.04, groundDist(groundRaw(uvG + sd * 2.0 * px * texel))) * lz * (1.0 - far) * 0.6);
  }
  vec3 col = bg;

  // ---- the plant: only where it is, or close enough for its outline to reach ----
  vec2 r3 = 3.0 * px * texel;
  float m = mask(vUv);
  float nearPlant = max(m, max(max(mask(vUv + vec2(r3.x, 0.0)), mask(vUv - vec2(r3.x, 0.0))),
                               max(mask(vUv + vec2(0.0, r3.y)), mask(vUv - vec2(0.0, r3.y)))));
  if (nearPlant > 0.0) {
    // colour laid a little off the line, with darker drying edges
    vec2 uvW = vUv + drift * 5.0 * px * texel;
    float mW = mask(uvW);
    if (mW > 0.0) {
      vec4 cW = texture2D(tColor, uvW);
      vec3 alb = pow(max(cW.rgb, 0.0), vec3(1.0 / 2.2));
      vec3 pig = mix(inShade(alb), inSun(alb, 1.15), sunSide(cW.a, wob));
      float rim = 0.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        rim += mask(uvW + vec2(cos(a), sin(a)) * 3.0 * px * texel);
      }
      col = mix(bg, pig, 0.9 + 0.1 * noise(frag / 2.4 + 1.7));
      col *= 1.0 - 0.22 * (1.0 - rim / 8.0);
    }

    // pen: thin sepia lines, lighter in the sun
    float sC = sunSide(texture2D(tColor, vUv).a, wob);
    vec3 sepia = mix(ink, vec3(0.42, 0.26, 0.16), 0.5);
    vec2 pw = (vec2(noise(frag / 9.0), noise(frag / 9.0 + 19.1)) - 0.5) * 1.4 * px * texel;
    float line = edges(vUv + pw, (0.6 + 0.5 * (1.0 - sC)) * px * texel);
    line *= (0.7 + 0.3 * smoothstep(0.2, 0.55, noise(frag / 5.0))) * mix(0.95, 0.6, sC * m);
    float hatch = 0.0, glint = 0.0;
    if (m > 0.0) {
      // hatching in shadow only, laid along the surface in one of a few directions per patch
      vec3 n = nrm(vUv);
      if (sC < 1.0) {
        vec2 hd = length(n.xy) > 0.15 ? normalize(vec2(-n.y, n.x)) : vec2(0.7071);
        float ang = floor(atan(hd.y, hd.x) / 0.5236 + 0.5) * 0.5236;
        hd = vec2(cos(ang), sin(ang));
        vec2 q = frag + (drift * 2.0);
        float across = abs(fract(dot(q, vec2(-hd.y, hd.x)) / 4.0) - 0.5);
        hatch = (1.0 - smoothstep(0.08, 0.17, across)) * (1.0 - sC)
              * smoothstep(0.3, 0.5, noise(vec2(dot(q, hd) / 7.0, dot(q, vec2(-hd.y, hd.x)) / 4.0)));  // strokes start and stop
      }
      // white strokes on edges that face the sun
      float toSun = 1.0 - mask(vUv + sd * 2.5 * px * texel);
      glint = toSun * max(smoothstep(0.1, 0.5, dot(n, sunView)), sC) * smoothstep(0.25, 0.5, noise(frag / 6.0));
    }
    col = mix(col, sepia, clamp(max(line, hatch * 0.5), 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.98, 0.9), glint * 0.85);

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

export function createPlate(renderer: THREE.WebGLRenderer) {
  const opts = { type: THREE.UnsignedByteType };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, opts);
  const groundRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });

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
      tGround: { value: groundRT.texture }, tGroundDepth: { value: groundRT.depthTexture }, gNear: { value: 0.05 }, gFar: { value: 20000 },
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
      if (colorRT.width !== w || colorRT.height !== h) { colorRT.setSize(w, h); normalRT.setSize(w, h); groundRT.setSize(w, h); }
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
