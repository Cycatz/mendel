// Plate viewer: a PODL genome grown and drawn as a hand-coloured botanical plate.
// Keys 1–3 (or ?plant=N) pick the starter, R regrows with a new seed, T toggles the roots.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { develop, parseGenome, plantMesh, STARTERS } from './podl';
import { createPlate, SOIL_LAYER } from './render/plate';
import { plantGeometry } from './render/plantMesh';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const rootsButton = document.querySelector<HTMLButtonElement>('#roots')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

const sun = new THREE.DirectionalLight(0xfff3dc, Math.PI);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.layers.enable(SOIL_LAYER); // the ground is lit (and takes the plant's shadow) too
scene.add(sun, sun.target);

const plate = createPlate(renderer);
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const applyTheme = () => plate.setInk(cssVar('--paper'), cssVar('--plate-ink'));
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const genomes = STARTERS.map(s => parseGenome(s));
let mesh: THREE.Group | null = null;
let rootMesh: THREE.Mesh | null = null;
let soil: THREE.Mesh | null = null;

// A block of earth cut away under the plant, a little wider and deeper than its roots.
function soilBlock(roots: ArrayLike<number>) {
  let r = 0.3, d = 0.3;
  for (let i = 0; i < roots.length; i += 3) {
    r = Math.max(r, Math.abs(roots[i]) * 1.25, Math.abs(roots[i + 2]) * 1.25);
    d = Math.max(d, -roots[i + 1] + 0.12);
  }
  const g = new THREE.BoxGeometry(2 * r, d, 2 * r).translate(0, -d / 2, 0);
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([0.45, 0.32, 0.2].map(x => x ** 2.2), i * 3); // sRGB earth, as linear
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, plate.pigmentMat);
  m.layers.set(SOIL_LAYER);
  m.receiveShadow = true;
  return m;
}
let current = 0, seed = 1, showRoots = true;

function setRoots(on: boolean) {
  showRoots = on;
  if (rootMesh) rootMesh.visible = on;
  rootsButton.textContent = on ? 'Hide roots' : 'Show roots';
  rootsButton.setAttribute('aria-pressed', String(on));
}
rootsButton.addEventListener('click', () => setRoots(!showRoots));

function show(i: number) {
  current = i;
  const grown = plantMesh(develop(genomes[i], { seed }));
  if (mesh) { scene.remove(mesh); mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
  if (soil) { scene.remove(soil); soil.geometry.dispose(); }
  soil = soilBlock(grown.roots.pos);
  scene.add(soil);
  // shoot and roots together, as a plate shows a specimen lifted from the ground
  mesh = new THREE.Group();
  rootMesh = null;
  for (const part of [grown, grown.roots]) {
    if (!part.idx.length) continue;
    const m = new THREE.Mesh(plantGeometry(part), plate.pigmentMat);
    m.castShadow = m.receiveShadow = true;
    mesh.add(m);
    if (part === grown.roots) rootMesh = m;
  }
  scene.add(mesh);
  // frame the whole specimen, roots included, so toggling them doesn't move the camera
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.y, size.x, size.z) * 0.62 + 0.2;
  controls.target.copy(mid);
  camera.position.copy(mid).add(new THREE.Vector3(0.55, 0.25, 1).normalize().multiplyScalar(r / Math.tan((camera.fov * Math.PI) / 360)));
  setRoots(showRoots);
  caption.textContent = `Tab. ${['I', 'II', 'III'][i] ?? i + 1}.  ${genomes[i].name}`;
}

// Illustrators light from the upper left, so the sun follows the camera.
const basis = { r: new THREE.Vector3(), u: new THREE.Vector3(), b: new THREE.Vector3() };
function lightFromCamera() {
  camera.matrixWorld.extractBasis(basis.r, basis.u, basis.b);
  const dir = basis.r.multiplyScalar(-0.6).addScaledVector(basis.u, 0.5).addScaledVector(basis.b, 0.62).normalize();
  sun.position.copy(controls.target).addScaledVector(dir, 30);
  sun.target.position.copy(controls.target);
  sun.target.updateMatrixWorld();
  const ext = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.7, 1.5, 12);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = ext * 0.002; // acne would read as stray hatching
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

function tick() {
  controls.update();
  const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.01, 0.002, 0.05);
  if (near !== camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
  plate.render(scene, camera, (on) => { if (on) lightFromCamera(); });
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= String(genomes.length)) show(+e.key - 1);
  if (e.key === 'r') { seed++; show(current); }
  if (e.key === 't') setRoots(!showRoots);
});

resize();
// ?plant=1..3 picks the starter shown first (handy for screenshots)
show(Math.max(0, Math.min(genomes.length - 1, (Number(new URLSearchParams(location.search).get('plant')) || 1) - 1)));
tick();
