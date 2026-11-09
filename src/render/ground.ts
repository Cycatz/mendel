// An endless flat grass field at y = 0, drawn on GROUND_LAYER. Its material paints the grass in
// world space (so it stays put as the camera moves) and writes what the plate composite expects:
// albedo (rgb) and how much sun reaches it (a), which is 0 in the plant's shadow.
import * as THREE from 'three';
import { GROUND_LAYER } from './plate';

const GRASS = /* glsl */ `
varying vec3 vWorld;
float ghash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ghash(i), ghash(i + vec2(1, 0)), u.x), mix(ghash(i + vec2(0, 1)), ghash(i + vec2(1, 1)), u.x), u.y);
}
// scattered dabs of a brush, one per cell of size s, faded out once they shrink below a pixel
float dabs(vec2 p, float s, float r, float fw, float seed) {
  vec2 c = floor(p / s), f = p / s - c;
  vec2 at = vec2(ghash(c + seed), ghash(c + seed + 17.0)) * 0.6 + 0.2;
  vec2 d = (f - at) * s * vec2(1.0, 1.8);        // a little elongated, like a flicked stroke
  float size = r * (0.6 + 0.8 * ghash(c + seed + 5.0));
  return (1.0 - smoothstep(size - fw, size + fw, length(d))) * (1.0 - smoothstep(r * 0.4, r * 1.2, fw));
}
`;

function grassMaterial() {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GRASS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vWorld.xz;
        float fw = length(fwidth(p));                 // metres per pixel here
        vec3 grass = vec3(0.4, 0.6, 0.2);
        grass = mix(grass, vec3(0.62, 0.65, 0.3), smoothstep(0.5, 0.85, gnoise(p * 0.07 + 3.0)) * 0.35); // drier patches
        grass = mix(grass, vec3(0.26, 0.47, 0.19), smoothstep(0.55, 0.9, gnoise(p * 0.22 + 11.0)) * 0.25); // lush clumps
        grass *= 0.95 + 0.1 * mix(gnoise(p * 1.3 + 7.0), 0.5, smoothstep(0.03, 0.2, fw));
        grass *= 1.0 - 0.06 * dabs(p, 0.08, 0.018, fw, 1.0);                 // dark tufts
        grass = mix(grass, vec3(0.7, 0.77, 0.36), 0.15 * dabs(p, 0.07, 0.014, fw, 9.0)); // lit blades
        diffuseColor.rgb = pow(grass, vec3(2.2));`)
      .replace('#include <opaque_fragment>', `
        // sunlight reaching the ground, divided by N·L: 1 in the open, 0 in shadow
        float alb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
        float lit = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114)) / alb;
        #if NUM_DIR_LIGHTS > 0
          lit /= max(dot(normal, directionalLights[0].direction), 0.05) * 0.9;
        #endif
        gl_FragColor = vec4(diffuseColor.rgb, clamp(lit, 0.0, 1.0));`);
  };
  return m;
}

export function createGround() {
  const g = new THREE.CircleGeometry(20000, 96).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, grassMaterial());
  ground.layers.set(GROUND_LAYER);
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  return ground;
}
