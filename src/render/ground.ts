// The ground: a flat disc at y = 0 (the horizon beyond is a painted backdrop in the composite) and
// the landscape standing on it, all on
// GROUND_LAYER. The plane only tells the composite where the field is and where shadows fall
// (it writes black albedo); the field itself is painted there. Trees write their albedo.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../podl';
import { GROUND_LAYER } from './plate';

// Albedo (rgb) and sunlight reaching the surface (a): N·L × shadow.
function landMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      float alb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
      float lit = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114)) / alb;
      gl_FragColor = vec4(diffuseColor.rgb, clamp(lit, 0.0, 1.0));`);
  };
  return m;
}

// The field: black albedo, and sunlight divided by N·L, so 1 in the open and 0 in shadow.
function shadowCatcher() {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      float lit = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114)) / dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      #if NUM_DIR_LIGHTS > 0
        lit /= max(dot(normal, directionalLights[0].direction), 0.05) * 0.9;
      #endif
      gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(lit, 0.0, 1.0));`);
  };
  return m;
}

const lin = (c: number[]) => c.map(x => x ** 2.2);
function paint(g: THREE.BufferGeometry, c: number[]) {
  const n = g.getAttribute('position').count, l = lin(c);
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => l).flat(), 3));
  g.deleteAttribute('uv');
  return g;
}

// Crowns, for the soft shadows painted under them: x, z, radius, crown height.
type Crown = [number, number, number, number];

// A crown of lumpy clumps on an optional trunk. Clump normals lean toward the crown's centre, so
// the crown lights as one mass and each clump still has its own lit top and shaded underside.
function crown(rand: () => number, x: number, z: number, trunkH: number, R: number, clumps: number, crowns: Crown[], parts: THREE.BufferGeometry[]) {
  const dist = Math.hypot(x, z);
  if (trunkH > 0) {
    const h = trunkH + R * 0.5, w = 0.07 * R;
    parts.push(paint(new THREE.CylinderGeometry(w * 0.55, w, h, 7).translate(x, h / 2, z), [0.45, 0.38, 0.3]));
  }
  const centre = new THREE.Vector3(x, trunkH + R * 0.6, z);
  crowns.push([x, z, R * 0.95, centre.y]);
  const green = [0.4 + 0.08 * rand(), 0.64 + 0.06 * rand(), 0.26 + 0.06 * rand()];
  for (let i = 0; i < clumps; i++) {
    const a = rand() * Math.PI * 2, u = rand();
    const off = new THREE.Vector3(Math.cos(a) * R * 0.8 * Math.cbrt(u), (rand() - 0.4) * R, Math.sin(a) * R * 0.8 * Math.cbrt(u));
    const r = R * (0.3 + 0.18 * rand());
    // facets show in the silhouette, so detail follows the clump's size on screen
    const size = r / Math.max(dist, 1), detail = size > 0.04 ? 4 : size > 0.022 ? 3 : 2;
    const g = mergeVertices(new THREE.IcosahedronGeometry(r, detail).deleteAttribute('normal').deleteAttribute('uv'));
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { // lumpy, so the silhouette breaks into smaller masses
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      const bump = 1 + 0.18 * Math.sin(v.x * 3.1 / r + i) * Math.sin(v.y * 2.7 / r) * Math.sin(v.z * 3.3 / r + 1);
      p.setXYZ(k, v.x * bump, v.y * bump * 0.85, v.z * bump);
    }
    g.translate(centre.x + off.x, Math.max(centre.y + off.y, r * 0.6), centre.z + off.z);
    g.computeVertexNormals();
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const out = new THREE.Vector3().fromBufferAttribute(p, k).sub(centre).normalize();
      const nn = new THREE.Vector3().fromBufferAttribute(n, k).multiplyScalar(0.45).addScaledVector(out, 0.55).normalize();
      n.setXYZ(k, nn.x, nn.y, nn.z);
    }
    const tint = 0.92 + 0.16 * rand();
    parts.push(paint(g, green.map(c => c * tint)));
  }
}

const tree = (rand: () => number, x: number, z: number, s: number, crowns: Crown[], parts: THREE.BufferGeometry[]) =>
  crown(rand, x, z, (1.2 + rand()) * s, (3 + 1.6 * rand()) * s, 12 + Math.floor(rand() * 5), crowns, parts);
const bush = (rand: () => number, x: number, z: number, crowns: Crown[], parts: THREE.BufferGeometry[]) =>
  crown(rand, x, z, 0, 1.1 + 0.6 * rand(), 4 + Math.floor(rand() * 2), crowns, parts);

// Copses and hedgerows around the field, 28–65 m out. Copses are spread evenly round the
// compass (with jitter), so every view has some; the first lands left of the opening view.
const OPENING = -1.75; // compass angle the opening view looks toward (radians, atan2(z, x))
function woods(crowns: Crown[]) {
  const rand = mulberry32(11), parts: THREE.BufferGeometry[] = [];
  const at = (a: number, d: number): [number, number] => [Math.cos(a) * d, Math.sin(a) * d];
  for (let c = 0; c < 9; c++) {
    const a = OPENING - 0.35 + (c + (c ? (rand() - 0.5) * 0.5 : 0)) * (Math.PI * 2) / 9;
    const [cx, cz] = at(a, c ? 28 + 30 * rand() : 45), n = 3 + Math.floor(rand() * 6), spread = 4 + n;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = spread * Math.sqrt(rand());
      tree(rand, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.8 + 0.5 * rand(), crowns, parts);
    }
  }
  for (let h = 0; h < 5; h++) {
    const [cx, cz] = at(OPENING + 0.35 + (h + (rand() - 0.5) * 0.4) * (Math.PI * 2) / 5, 35 + 30 * rand()), len = 15 + 25 * rand();
    const tangent = Math.atan2(cz, cx) + Math.PI / 2 + (rand() - 0.5) * 0.8;
    const dx = Math.cos(tangent), dz = Math.sin(tangent);
    for (let t = -len / 2; t < len / 2; t += 1.5 + rand()) {
      const x = cx + dx * t + (rand() - 0.5), z = cz + dz * t + (rand() - 0.5);
      if (rand() < 0.15) tree(rand, x, z, 0.7 + 0.4 * rand(), crowns, parts);
      else bush(rand, x, z, crowns, parts);
    }
  }
  for (const g of parts) if (g.index === null) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
  return mergeGeometries(parts);
}

// The crowns' shadows on the field, drawn once into a small texture centred on the plant.
// (They are far beyond the plant's shadow map.) Each shadow sits under its crown, pushed away
// from the sun by the crown's height.
const SHADE_EXTENT = 200, SHADE_RES = 512;
function crownShadows(crowns: Crown[], sun: THREE.Vector3) {
  const data = new Uint8Array(SHADE_RES * SHADE_RES), m = SHADE_RES / (2 * SHADE_EXTENT);
  const lean = 1 / Math.max(sun.y, 0.1);
  for (const [x, z, r, h] of crowns) {
    const cx = (x - sun.x * lean * h + SHADE_EXTENT) * m, cz = (z - sun.z * lean * h + SHADE_EXTENT) * m, rr = r * m;
    for (let j = Math.max(0, Math.floor(cz - rr)); j <= Math.min(SHADE_RES - 1, Math.ceil(cz + rr)); j++)
      for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(SHADE_RES - 1, Math.ceil(cx + rr)); i++) {
        const v = 1 - THREE.MathUtils.smoothstep(Math.hypot(i - cx, j - cz) / rr, 0.7, 1);
        data[j * SHADE_RES + i] = Math.max(data[j * SHADE_RES + i], Math.round(v * 255));
      }
  }
  const tex = new THREE.DataTexture(data, SHADE_RES, SHADE_RES, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex, extent: SHADE_EXTENT };
}

export function createGround(sun: THREE.Vector3) {
  const group = new THREE.Group(), crowns: Crown[] = [];
  const plane = new THREE.Mesh(new THREE.CircleGeometry(90, 64).rotateX(-Math.PI / 2), shadowCatcher());
  plane.receiveShadow = true;
  const mat = landMaterial();
  const land = [plane, new THREE.Mesh(woods(crowns), mat)];
  for (const m of land) { m.layers.set(GROUND_LAYER); m.frustumCulled = false; group.add(m); }
  return { group, shade: crownShadows(crowns, sun.clone().normalize()) };
}
