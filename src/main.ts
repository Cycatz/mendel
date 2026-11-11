// Plate viewer: a PODL genome grown and drawn as a hand-coloured botanical plate.
// Keys 1–8 (or ?plant=N) pick the starter, R regrows with a new seed, T toggles the roots.
// For exported pictures: ?seed=N, ?bg=scene|paper|clear (&paper=%23rrggbb), ?ui=0 hides the caption and
// button, ?turn=DEG and ?lift=DEG orbit the opening view, ?zoom=K moves in, ?focus=head frames the top,
// ?pan=F slides the plant across the frame (F of the view's half-width; + puts it on the left),
// ?set=GENE:VALUE,GENE:VALUE replaces those num genes of the ?plant shown (e.g. set=PETAL_HUE:0.8).
// The Look panel (top left) sets PETAL_HUE and INK, with presets, and writes them back as ?set=.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { develop, parseGenome, plantMesh, STARTERS, type Genome } from './podl';
import { createPlate, GROUND_LAYER } from './render/plate';
import { createGround } from './render/ground';
import { plantGeometry } from './render/plantMesh';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const rootsButton = document.querySelector<HTMLButtonElement>('#roots')!;
const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) && Number.isFinite(+Q.get(k)!) ? +Q.get(k)! : d);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
// the wheel handler moves the camera itself (inside controls.update), so the loop never sees it
controls.addEventListener('change', () => { dirty = true; });
controls.maxPolarAngle = Math.PI * 0.495;

// The sun is fixed in the world (upper left of the opening view), so shadows turn as you orbit.
const SUN_DIR = new THREE.Vector3(-0.23, 0.57, 0.83).normalize();
const sun = new THREE.DirectionalLight(0xfff3dc, Math.PI);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.layers.enable(GROUND_LAYER); // the ground is lit (and takes the plant's shadow) too
scene.add(sun, sun.target);

const plate = createPlate(renderer);
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// Frames are drawn only when something changes: the camera moves, the plant or theme changes.
let dirty = true;
const redraw = () => { dirty = true; };
const applyTheme = () => { plate.setInk(cssVar('--plate-ink')); redraw(); };
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
plate.setSun(SUN_DIR);
const ground = createGround(SUN_DIR);
scene.add(ground.group);
plate.setCrownShade(ground.shade);

const genomes = STARTERS.map(s => parseGenome(s));
// Replace a num gene's alleles with one value, adding the gene if the genome lacks it.
function setGene(g: Genome, name: string, value: string) {
  const l = g.loci.find(l => l.name === name);
  if (l) { if (l.kind === 'num') l.alleles.forEach(a => { a.src = value; a.dom = 1; }); return; }
  const a = { id: 'set', dom: 1, src: value };
  g.loci.push({ name, kind: 'num', chrom: '99', pos: 0, alleles: [a, { ...a }] });
}
// ?plant=1..8 picks the starter shown first (handy for screenshots); ?set= changes only that plant
const first = Math.max(0, Math.min(genomes.length - 1, (Number(Q.get('plant')) || 1) - 1));
for (const kv of (Q.get('set') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  if (k && v && Number.isFinite(+v)) setGene(genomes[first], k, v);
}
let mesh: THREE.Group | null = null;
let rootMesh: THREE.Mesh | null = null;
let current = 0, seed = num('seed', 1), showRoots = false;
const bgKind = (['scene', 'paper', 'clear'] as const).find(k => k === Q.get('bg')) ?? 'scene';
plate.setBackdrop(bgKind, Q.get('paper') ?? '#f2e9d4');
if (bgKind === 'clear') document.documentElement.style.background = document.body.style.background = 'transparent';
if (Q.get('ui') === '0') { caption.hidden = true; rootsButton.hidden = true; }

// The Look panel: the flower's colour (PETAL_HUE) and the outline's strength (INK), with presets.
const look = document.querySelector<HTMLFormElement>('#look')!;
const hueInput = document.querySelector<HTMLInputElement>('#hue')!, inkInput = document.querySelector<HTMLInputElement>('#ink')!;
const hueOut = document.querySelector<HTMLOutputElement>('#hue-out')!, inkOut = document.querySelector<HTMLOutputElement>('#ink-out')!;
const HUES: [string, number][] = [['Lavender', 0.8], ['Mauve', 0.87], ['Rose', 0.95]];
const INKS: [string, number][] = [['Strong', 0.7], ['Light', 0.45], ['Faint', 0.25]];
if (Q.get('ui') === '0') look.hidden = true;
let curDev: ReturnType<typeof develop> | null = null, touched = false;
function presetButtons(box: string, list: [string, number][], pick: (v: number) => void, swatch: boolean) {
  const el = document.querySelector<HTMLElement>(box)!;
  for (const [label, v] of list) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.v = String(v);
    if (swatch) { const s = document.createElement('span'); s.className = 'swatch'; s.style.background = `hsl(${v * 360} 45% 70%)`; b.append(s); }
    b.append(label);
    b.addEventListener('click', () => pick(v));
    el.append(b);
  }
}
function syncLook() {
  if (!curDev) return;
  const hue = curDev.gene('PETAL_HUE'), ink = curDev.gene('INK');
  hueInput.value = String(hue); inkInput.value = String(ink);
  const name = (list: [string, number][], v: number) => list.find(([, p]) => Math.abs(p - v) < 0.003)?.[0];
  hueOut.innerHTML = `<span class="swatch" style="background:hsl(${hue * 360} 45% 70%)"></span>${name(HUES, hue) ?? 'Custom'}`;
  inkOut.textContent = `${name(INKS, ink) ?? 'Custom'}, ${Math.round(ink * 100)}%`;
  for (const [box, v] of [['#hue-presets', hue], ['#ink-presets', ink]] as const)
    document.querySelectorAll<HTMLButtonElement>(`${box} button`).forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.v! - v) < 0.003)));
  // once changed, keep the pick in the URL, so a reload or an export (?set=) shows it again
  if (!touched) return;
  const u = new URL(location.href);
  u.searchParams.set('plant', String(current + 1));
  u.searchParams.set('set', `PETAL_HUE:${+hue.toFixed(3)},INK:${+ink.toFixed(2)}`);
  history.replaceState(null, '', u);
}
let regrow = 0;
function setHue(v: number) {
  touched = true;
  setGene(genomes[current], 'PETAL_HUE', String(v));
  cancelAnimationFrame(regrow);
  regrow = requestAnimationFrame(() => show(current, true));   // colours are baked into the mesh
}
function setInk(v: number) {
  touched = true;
  setGene(genomes[current], 'INK', String(v));
  if (curDev) curDev = develop(genomes[current], { seed });
  plate.setInkWeight(v); syncLook(); redraw();
}
presetButtons('#hue-presets', HUES, setHue, true);
presetButtons('#ink-presets', INKS, setInk, false);
hueInput.addEventListener('input', () => setHue(+hueInput.value));
inkInput.addEventListener('input', () => setInk(+inkInput.value));

function setRoots(on: boolean) {
  showRoots = on;
  if (rootMesh) rootMesh.visible = on;
  rootsButton.textContent = on ? 'Hide roots' : 'Show roots';
  rootsButton.setAttribute('aria-pressed', String(on));
  redraw();
}
rootsButton.addEventListener('click', () => setRoots(!showRoots));

// keepView: regrow in place (a Look change) without moving the camera
function show(i: number, keepView = false) {
  current = i;
  const dev = develop(genomes[i], { seed });
  curDev = dev;
  const grown = plantMesh(dev);
  plate.setInkWeight(dev.gene('INK'));
  plate.setInkTint(dev.gene('INK_TINT'));
  plate.setYellowWash(dev.gene('YELLOW_WASH'));
  plate.setSoftShade(dev.gene('SOFT_SHADE'));
  if (mesh) { scene.remove(mesh); mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
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
  syncLook();
  if (keepView) { setRoots(showRoots); return; }
  // frame the whole specimen, roots included, so toggling them doesn't move the camera
  // (exports, ?ui=0, frame the shoot alone: the roots are hidden there)
  const box = Q.get('ui') === '0' ? new THREE.Box3().setFromObject(mesh.children[0]) : new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.y, size.x, size.z) * 0.62 + 0.2;
  controls.target.copy(mid);
  // look down on low, spreading plants (a melon patch) so they don't read as a thin strip
  const flat = size.y < 0.3 * Math.max(size.x, size.z);
  camera.position.copy(mid).add(new THREE.Vector3(0.55, flat ? 0.5 : 0.14, 1).normalize().multiplyScalar((flat ? 0.8 : 1) * r / Math.tan((camera.fov * Math.PI) / 360)));
  // export options: frame the top of the plant, orbit, move in, slide the plant sideways
  if (Q.get('focus') === 'head') {
    const top = new THREE.Box3(), v = new THREE.Vector3(), cut = box.max.y - Math.min(0.5, size.y * 0.25);   // the head: the top of the shoot
    mesh.traverse(o => {
      const p = (o as THREE.Mesh).geometry?.getAttribute('position');
      if (p) for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); if (v.y > cut) top.expandByPoint(v); }
    });
    const head = top.getCenter(new THREE.Vector3()), hs = top.getSize(new THREE.Vector3());
    const hr = Math.max(hs.x, hs.y, hs.z) * 0.75;
    camera.position.sub(controls.target).normalize().multiplyScalar(hr / Math.tan((camera.fov * Math.PI) / 360)).add(head);
    controls.target.copy(head);
  }
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  sph.theta += num('turn', 0) * Math.PI / 180;
  sph.phi = THREE.MathUtils.clamp(sph.phi - num('lift', 0) * Math.PI / 180, 0.05, Math.PI * 0.495);
  sph.radius /= Math.max(0.05, num('zoom', 1));
  camera.position.copy(controls.target).add(off.setFromSpherical(sph));
  camera.lookAt(controls.target);
  if (Q.has('pan')) {   // slide target and camera together along the view's right vector
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const half = sph.radius * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    const d = right.multiplyScalar(num('pan', 0) * half);
    camera.position.add(d); controls.target.add(d);
  }
  setRoots(showRoots); // also redraws
  caption.textContent = `Tab. ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i] ?? i + 1}.  ${genomes[i].name}`;
}

// Keep the sun's shadow camera on the plant, sized to the view.
function placeSun() {
  sun.position.copy(controls.target).addScaledVector(SUN_DIR, 30);
  sun.target.position.copy(controls.target);
  sun.target.updateMatrixWorld();
  const ext = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), 1.5, 16);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = ext * 0.002; // acne would read as stray hatching
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  redraw();
}
new ResizeObserver(resize).observe(canvas);

function tick() {
  requestAnimationFrame(tick);
  if (!controls.update() && !dirty) return;
  dirty = false;
  const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.01, 0.002, 0.05);
  if (near !== camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
  plate.render(scene, camera, (on) => { if (on) placeSun(); });
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest?.('#look') && e.key.startsWith('Arrow')) return;
  if (e.key >= '1' && e.key <= String(genomes.length)) { touched = false; history.replaceState(null, '', location.pathname); show(+e.key - 1); }
  if (e.key === 'r') { seed++; show(current); }
  if (e.key === 't') setRoots(!showRoots);
});

resize();
show(first);
tick();
