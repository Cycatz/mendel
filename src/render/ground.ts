// The ground: an endless flat plane at y = 0, and the landscape standing on it, all on
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

// A tree: a trunk and a crown of lumpy clumps. Clump normals lean toward the crown's centre, so
// the crown lights as one mass and each clump still has its own lit top and shaded underside.
// Crowns, for the soft shadows the composite paints under them: x, z, radius, crown height.
export type Crown = [number, number, number, number];

function tree(rand: () => number, x: number, z: number, scale: number, crowns: Crown[]) {
  const trunkH = (1.2 + 1.0 * rand()) * scale, R = (3.0 + 1.6 * rand()) * scale;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.12 * scale, 0.24 * scale, trunkH + R * 0.5, 7).translate(x, (trunkH + R * 0.5) / 2, z), [0.45, 0.38, 0.3]));
  const centre = new THREE.Vector3(x, trunkH + R * 0.6, z);
  crowns.push([x, z, R * 0.95, centre.y]);
  const green = [0.4 + 0.08 * rand(), 0.64 + 0.06 * rand(), 0.26 + 0.06 * rand()];
  const clumps = 20 + Math.floor(rand() * 8);
  for (let i = 0; i < clumps; i++) {
    const a = rand() * Math.PI * 2, u = rand();
    const off = new THREE.Vector3(Math.cos(a) * R * 0.8 * Math.cbrt(u), (rand() - 0.4) * R * 1.0, Math.sin(a) * R * 0.8 * Math.cbrt(u));
    const r = R * (0.24 + 0.16 * rand());
    const g = mergeVertices(new THREE.IcosahedronGeometry(r, 2).deleteAttribute('normal').deleteAttribute('uv'));
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { // lumpy, so the silhouette breaks into smaller masses
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      const bump = 1 + 0.18 * Math.sin(v.x * 3.1 / scale + i) * Math.sin(v.y * 2.7 / scale) * Math.sin(v.z * 3.3 / scale + 1);
      p.setXYZ(k, v.x * bump, v.y * bump * 0.85, v.z * bump);
    }
    g.translate(centre.x + off.x, centre.y + off.y, centre.z + off.z);
    g.computeVertexNormals();
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k), out = v.sub(centre).normalize();
      const nn = new THREE.Vector3().fromBufferAttribute(n, k).multiplyScalar(0.45).addScaledVector(out, 0.55).normalize();
      n.setXYZ(k, nn.x, nn.y, nn.z);
    }
    const tint = 0.92 + 0.16 * rand();
    parts.push(paint(g, green.map(c => c * tint)));
  }
  return parts;
}

// One copse for now, behind the plant and a little to the left of the opening view.
function copse(crowns: Crown[]) {
  const rand = mulberry32(11), parts: THREE.BufferGeometry[] = [];
  const cx = -27, cz = -37;
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2, d = 8 * Math.sqrt(rand());
    parts.push(...tree(rand, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.8 + 0.5 * rand(), crowns));
  }
  for (const g of parts) if (g.index === null) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
  return mergeGeometries(parts);
}

export function createGround() {
  const group = new THREE.Group(), crowns: Crown[] = [];
  const plane = new THREE.Mesh(new THREE.CircleGeometry(20000, 96).rotateX(-Math.PI / 2), shadowCatcher());
  plane.receiveShadow = true;
  plane.frustumCulled = false;
  const trees = new THREE.Mesh(copse(crowns), landMaterial());
  for (const m of [plane, trees]) { m.layers.set(GROUND_LAYER); group.add(m); }
  return { group, crowns };
}
