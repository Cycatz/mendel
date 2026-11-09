// Botanical-plate renderer: draws the garden as a hand-coloured engraving.
// Three passes per frame:
//   1. pigment: albedo (rgb) + direct light × shadow (a), with depth  -> wash, hatching, mask
//   2. normals: view-space normals                                     -> crease lines
//   3. composite on paper: ink outlines from depth/normal/silhouette edges, tonal hatching
//      in screen space, a watercolour wash that bleeds a little past the lines and pools at
//      its edges, and paper grain. Everything is drawn from the same geometry as the 3D view.
import * as THREE from 'three';

const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tColor, tNormal, tDepth;
uniform vec2 res;
uniform float px, near, far;
uniform vec3 paper, ink;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
float mask(vec2 uv) { return step(rawDepth(uv), 0.99999); }
float linDepth(vec2 uv) { float z = rawDepth(uv) * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

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
  return max(sil, max(dep * 0.9, cre * 0.55));
}

void main() {
  vec2 frag = gl_FragCoord.xy / px;           // CSS pixels
  vec2 texel = 1.0 / res;                     // one device pixel in uv

  // ---- paper ----
  vec3 pap = paper;
  pap *= 0.965 + 0.05 * fbm(frag / 1.6);                      // fibres
  pap *= 0.975 + 0.035 * fbm(frag / 260.0 + 3.1);             // mottling
  float vig = length(vUv - 0.5) * 1.35;
  pap *= 1.0 - 0.09 * pow(vig, 2.6);

  // ---- watercolour wash, misregistered a little from the engraved line ----
  vec2 bleed = (vec2(fbm(frag / 55.0), fbm(frag / 55.0 + 7.3)) - 0.5) * 5.0 * px * texel;
  vec2 uvW = vUv + bleed;
  vec4 cW = texture2D(tColor, uvW);
  float mW = mask(uvW);
  vec3 alb = pow(max(cW.rgb, 0.0), vec3(1.0 / 2.2));
  alb = mix(vec3(lum(alb)), alb, 0.78);                       // body colour, not neon
  alb *= vec3(1.03, 1.0, 0.9);                                // warm, like gamboge-mixed greens
  alb = mix(alb, vec3(0.93, 0.9, 0.78), 0.28);                // transparent washes over cream paper
  float sh = 0.3 + 0.7 * cW.a;                                // sky light keeps shadows from going black
  vec3 pig = alb * mix(0.72, 1.18, smoothstep(0.3, 0.95, sh)); // glazes build up in shadow
  float gran = fbm(frag / 2.4 + 1.7);
  float density = mW * (0.62 + 0.4 * gran) * (1.0 - 0.45 * smoothstep(0.75, 1.0, sh));
  // pigment pools at the drying edge of a wash
  float rim = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    rim += mask(uvW + vec2(cos(a), sin(a)) * 3.5 * px * texel);
  }
  float pool = mW * (1.0 - rim / 8.0);
  vec3 col = mix(pap, pig * (0.92 + 0.08 * pap), clamp(density, 0.0, 1.0));
  col *= 1.0 - 0.3 * pool;

  // ---- ink ----
  float m = mask(vUv);
  float shC = 0.3 + 0.7 * texture2D(tColor, vUv).a;
  vec2 wob = (vec2(noise(frag / 9.0), noise(frag / 9.0 + 19.1)) - 0.5) * 1.4 * px * texel;
  float weight = 0.75 + 0.9 * (1.0 - shC) * m;                 // heavier line on the shadow side
  float line = edges(vUv + wob, weight * px * texel);
  line *= 0.75 + 0.25 * smoothstep(0.2, 0.55, noise(frag / 5.0)); // the burin lifts now and then

  // tonal hatching, laid at the engraver's diagonals with a slight tremor
  float dark = (1.0 - shC) * m;
  vec2 q = frag + (vec2(noise(frag / 14.0), noise(frag / 14.0 + 5.0)) - 0.5) * 2.2;
  float sp = 4.2;
  float aa = 0.55 / sp;
  float d1 = abs(fract(dot(q, vec2(0.7071, 0.7071)) / sp) - 0.5);
  float d2 = abs(fract(dot(q, vec2(0.866, -0.5)) / (sp * 1.1)) - 0.5);
  float w1 = clamp((dark - 0.42) * 0.7, 0.0, 0.26);
  float w2 = clamp((dark - 0.6) * 0.75, 0.0, 0.2);
  float h = max(1.0 - smoothstep(w1 - aa, w1 + aa, d1), 0.85 * (1.0 - smoothstep(w2 - aa, w2 + aa, d2)));
  h *= step(0.001, w1) * (0.7 + 0.3 * noise(frag / 3.0));

  float cover = clamp(max(line, h * 0.6), 0.0, 1.0);
  col = mix(col, ink, cover);
  gl_FragColor = vec4(col, 1.0);
}`;

export type Plate = ReturnType<typeof createPlate>;

export function createPlate(renderer: THREE.WebGLRenderer) {
  const opts = { type: THREE.UnsignedByteType };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, opts);

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

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tNormal: { value: normalRT.texture }, tDepth: { value: colorRT.depthTexture },
      res: { value: new THREE.Vector2() }, px: { value: 1 }, near: { value: 0.05 }, far: { value: 400 },
      paper: { value: new THREE.Color() }, ink: { value: new THREE.Color() },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMPOSITE,
    depthTest: false, depthWrite: false,
  }));
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = quad.material.uniforms;

  return {
    pigmentMat,
    // colours are given as CSS hex strings in sRGB and used as-is by the composite
    setInk(paperCss: string, inkCss: string) {
      U.paper.value.setStyle(paperCss, THREE.SRGBColorSpace).convertLinearToSRGB();
      U.ink.value.setStyle(inkCss, THREE.SRGBColorSpace).convertLinearToSRGB();
    },
    // draw(scene, camera, swap): swap(true) puts plants on pigmentMat and hides decor; swap(false) restores
    render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, swap: (on: boolean) => void) {
      const w = renderer.domElement.width, h = renderer.domElement.height;
      if (colorRT.width !== w || colorRT.height !== h) { colorRT.setSize(w, h); normalRT.setSize(w, h); }
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
      renderer.shadowMap.autoUpdate = true;
      swap(false);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, clearA);
      scene.background = bg; scene.fog = fog;
      renderer.render(quadScene, quadCam);
    },
  };
}
