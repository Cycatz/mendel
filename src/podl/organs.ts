// Organ programs: an open-ended, composable shape grammar.
// An organ gene's allele is an expression like
//   whorl(petal, n=$PETALS, tilt=55)
// Evaluating it yields a plain "spec" tree, which is then built into a mesh in organ space
// (origin = attachment point, +Y = heading, Z = surface normal of the parent turtle).
// Because organs can reference other organs, gene duplication + mutation can grow new ones.
import { evalExpr, type EvalCtx, type Node } from './expr';
import type { Expressed } from './genome';
import type { Rand } from './rng';

type ArgKind = 'num' | 'organ' | 'profile' | 'color';
type ArgSig = [name: string, kind: ArgKind, def: number | null];
export interface Sig { kind: 'profile' | 'color' | 'organ'; args: ArgSig[] | 'variadic' }

// Signatures: positional order, kinds and defaults. 'organ' / 'profile' / 'color' args take specs.
export const SIGS: Record<string, Sig> = {
  // 2D profiles (closed outlines)
  sf:      { kind: 'profile', args: [['m', 'num', 2], ['n1', 'num', 1], ['n2', 'num', 1], ['n3', 'num', 1], ['a', 'num', 1], ['b', 'num', 1]] },
  ellipse: { kind: 'profile', args: [] },
  lobed:   { kind: 'profile', args: [['n', 'num', 5], ['depth', 'num', 0.3]] },
  rose:    { kind: 'profile', args: [['k', 'num', 3]] },
  heart:   { kind: 'profile', args: [] },
  // colours
  hsl:     { kind: 'color', args: [['h', 'num', 0.3], ['s', 'num', 0.5], ['l', 'num', 0.4]] },
  // primitive organs
  // `thick` is the blade's thickness: thin leaves (default) or fleshy, water-storing succulent ones
  blade:   { kind: 'organ', args: [['profile', 'profile', null], ['length', 'num', 1], ['width', 'num', 0.5], ['curl', 'num', 0], ['fold', 'num', 0], ['wave', 'num', 0], ['stalk', 'num', 0], ['color', 'color', null], ['edge', 'color', null], ['thick', 'num', 0.0003]] },
  bulb:    { kind: 'organ', args: [['length', 'num', 0.4], ['radius', 'num', 0.15], ['point', 'num', 1], ['ribs', 'num', 0], ['ribdepth', 'num', 0.1], ['color', 'color', null]] },
  spike:   { kind: 'organ', args: [['length', 'num', 0.3], ['radius', 'num', 0.03], ['bend', 'num', 0], ['color', 'color', null]] },
  // a fine root; `hairs` multiplies its absorbing surface without adding drawn geometry
  rootlet: { kind: 'organ', args: [['length', 'num', 0.06], ['radius', 'num', 0.003], ['hairs', 'num', 1], ['color', 'color', null]] },
  // composition operators
  whorl:   { kind: 'organ', args: [['organ', 'organ', null], ['n', 'num', 5], ['tilt', 'num', 45], ['twist', 'num', 0]] },
  chain:   { kind: 'organ', args: [['organ', 'organ', null], ['n', 'num', 4], ['spacing', 'num', 0.2], ['angle', 'num', 50], ['shrink', 'num', 0.9], ['tip', 'num', 1]] },
  spiral:  { kind: 'organ', args: [['organ', 'organ', null], ['n', 'num', 12], ['height', 'num', 0.5], ['tilt', 'num', 60], ['shrink', 'num', 0.97]] },
  group:   { kind: 'organ', args: 'variadic' },
  scale:   { kind: 'organ', args: [['organ', 'organ', null], ['s', 'num', 1]] },
  tilt:    { kind: 'organ', args: [['organ', 'organ', null], ['deg', 'num', 30]] },
  offset:  { kind: 'organ', args: [['organ', 'organ', null], ['y', 'num', 0.1]] },
};

// A spec is a plain tree: { type, ...args }. Fields are typed per primitive below.
export interface Spec { type: string; [k: string]: unknown }
interface HSL { h: number; s: number; l: number }
interface BladeSpec { type: 'blade'; profile: Spec | null; length: number; width: number; curl: number; fold: number; wave: number; stalk: number; color: HSL | null; edge: HSL | null; thick: number }
interface BulbSpec { type: 'bulb'; length: number; radius: number; point: number; ribs: number; ribdepth: number; color: HSL | null }
interface SpikeSpec { type: 'spike'; length: number; radius: number; bend: number; color: HSL | null }
interface RootletSpec { type: 'rootlet'; length: number; radius: number; hairs: number; color: HSL | null }
interface CompSpec { type: string; organ: Spec; items: Spec[]; n: number; tilt: number; twist: number; height: number; shrink: number; spacing: number; angle: number; tip: number; s: number; deg: number; y: number }

export type Gene = (name: string) => number;
export type { Rand } from './rng';

export function evalOrgan(name: string, ph: Expressed, gene: Gene, rand: Rand, depth = 0): Spec | null {
  const o = ph.organs[name];
  if (!o || depth > 5) return null;
  const specs = o.progs.map(p => {
    try { return evalSpec(p, ph, gene, rand, depth); } catch { return null; }
  });
  if (specs.length === 2 && specs[0] && specs[1]) return blendSpec(specs[0], specs[1]) as Spec;
  return specs[0] ?? specs[1] ?? null;
}

function evalSpec(node: Node, ph: Expressed, gene: Gene, rand: Rand, depth: number): Spec | null {
  const ctx: EvalCtx = {
    gene, rand, vars: {},
    ref: (n) => (ph.organs[n] ? evalOrgan(n, ph, gene, rand, depth + 1) : undefined),
    call: (fname, args) => {
      const sig = SIGS[fname];
      if (!sig) throw new Error(`Unknown organ function ${fname}`);
      if (sig.args === 'variadic') return { type: fname, items: args.map(a => evalExpr(a.value, ctx)).filter(Boolean) };
      const sa = sig.args;
      const spec: Spec = { type: fname };
      sa.forEach(([k, , def]) => (spec[k] = def));
      args.forEach((a, i) => {
        const k = a.name ?? sa[i]?.[0];
        if (k && sa.some(s => s[0] === k)) spec[k] = evalExpr(a.value, ctx);
      });
      return spec;
    },
  };
  return evalExpr(node, ctx) as Spec | null;
}

// Codominant organ alleles: if both specs share structure, interpolate; otherwise keep the first.
export function blendSpec(a: unknown, b: unknown): unknown {
  if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length ? a.map((x, i) => blendSpec(x, b[i])) : a;
  if (a && b && typeof a === 'object' && typeof b === 'object' && (a as Spec).type === (b as Spec).type) {
    const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    for (const k in A) o[k] = k in B && B[k] != null ? blendSpec(A[k], B[k]) : A[k];
    return o;
  }
  return a;
}

export const organKind = (n: Node | null | undefined) => (n?.t === 'call' ? SIGS[n.name]?.kind : null);

// ---------- profiles ----------
function profileFn(p: Spec | null): (t: number) => number {
  if (!p) return () => 1;
  const q = p as Record<string, number> & { type: string };
  switch (p.type) {
    case 'sf': {
      const { m, n1, n2, n3, a, b } = q;
      return (t) => {
        const c = Math.abs(Math.cos(m * t / 4) / (a || 1)) ** n2;
        const s = Math.abs(Math.sin(m * t / 4) / (b || 1)) ** n3;
        const r = (c + s) ** (-1 / (n1 || 1));
        return Number.isFinite(r) ? Math.min(r, 6) : 6;
      };
    }
    case 'lobed': return (t) => 1 + q.depth * Math.cos(Math.round(q.n) * t);
    case 'rose': return (t) => 0.15 + Math.abs(Math.cos(q.k * t / 2));
    case 'heart': return (t) => { const s = Math.sin(t); return 0.6 + 0.4 * Math.abs(Math.cos(t / 2)) - 0.25 * Math.max(0, -s) ** 6; };
    default: return () => 1;
  }
}

// ---------- mesh building in organ space ----------
export type Vec3 = [number, number, number];
// `extra`: surface that exists but is not drawn (root hairs), in the mesh's own units.
// `volGreen` / `volOther`: tissue volume, split by whether it is photosynthetic (green tissue
// stores water, other tissue stores carbohydrate).
// `sheetGreen`: area of the green sheet tissue behind `volGreen` (so thickness = volGreen / sheetGreen).
export interface Mesh {
  pos: number[]; nrm: number[]; col: number[]; idx: number[];
  extra?: number; volGreen?: number; volOther?: number; sheetGreen?: number;
}
// 3x4 affine matrix as [r00,r01,r02,tx, r10,...]
export type Mat = number[];

function hsl2rgb(c: HSL | null | undefined): Vec3 {
  if (!c) return [0.25, 0.55, 0.2];
  const h = ((c.h % 1) + 1) % 1, s = clamp01(c.s), l = clamp01(c.l);
  const f = (n: number) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

class MeshBuilder implements Mesh {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; idx: number[] = [];
  visits = 0;
  extra = 0;
  volGreen = 0;
  volOther = 0;
  sheetGreen = 0;
  // add tissue volume (in organ space) transformed by M, split by the colour's greenness;
  // `sheet` is the area of a sheet-like tissue (a blade), so its thickness can be recovered
  addVolume(v: number, M: Mat, colour: number[], sheet = 0) {
    const d = Math.abs(det3(M));
    const g = chlorophyll(colour[0], colour[1], colour[2]) > 0.5 ? 1 : 0;
    this.volGreen += v * d * g; this.volOther += v * d * (1 - g);
    this.sheetGreen += sheet * d ** (2 / 3) * g;
  }
  area() {
    let a = 0;
    for (let i = 0; i < this.idx.length; i += 3) {
      const [p, q, r] = [this.idx[i] * 3, this.idx[i + 1] * 3, this.idx[i + 2] * 3];
      a += Math.hypot(...triNormal(this.pos.slice(p, p + 3), this.pos.slice(q, q + 3), this.pos.slice(r, r + 3))) / 2;
    }
    return a;
  }
  get count() { return this.pos.length / 3; }
  // Append a grid (rows × cols) of vertices produced by fn(i,j) -> {p, c}
  grid(rows: number, cols: number, fn: (i: number, j: number) => { p: Vec3; c: number[] }) {
    const base = this.count;
    const P: Vec3[] = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const { p, c } = fn(i / rows, j / cols);
      P.push(p); this.pos.push(...p); this.col.push(...c);
    }
    const W = cols + 1;
    const N: Vec3[] = P.map(() => [0, 0, 0]);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      this.idx.push(base + a, base + c, base + b, base + b, base + c, base + d);
      for (const [x, y, z] of [[a, c, b], [b, c, d]]) {
        const n = triNormal(P[x], P[y], P[z]);
        for (const k of [x, y, z]) { N[k][0] += n[0]; N[k][1] += n[1]; N[k][2] += n[2]; }
      }
    }
    for (const n of N) { const l = Math.hypot(...n) || 1; this.nrm.push(n[0] / l, n[1] / l, n[2] / l); }
  }
  append(m: Mesh, mat: Mat) {
    const base = this.count;
    for (let i = 0; i < m.pos.length; i += 3) {
      const p = applyMat(mat, m.pos[i], m.pos[i + 1], m.pos[i + 2], 1);
      const n = applyMat(mat, m.nrm[i], m.nrm[i + 1], m.nrm[i + 2], 0);
      const nl = Math.hypot(...n) || 1;
      this.pos.push(...p); this.nrm.push(n[0] / nl, n[1] / nl, n[2] / nl);
    }
    for (let i = 0; i < m.col.length; i++) this.col.push(m.col[i]);
    for (let i = 0; i < m.idx.length; i++) this.idx.push(base + m.idx[i]);
  }
}
const triNormal = (a: number[], b: number[], c: number[]): Vec3 => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
export const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export function applyMat(m: Mat, x: number, y: number, z: number, w: number): Vec3 {
  return [m[0] * x + m[1] * y + m[2] * z + m[3] * w, m[4] * x + m[5] * y + m[6] * z + m[7] * w, m[8] * x + m[9] * y + m[10] * z + m[11] * w];
}
export function mulMat(a: Mat, b: Mat): Mat {
  const o: Mat = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
    }
  }
  return o;
}
const det3 = (M: Mat) => M[0] * (M[5] * M[10] - M[6] * M[9]) - M[1] * (M[4] * M[10] - M[6] * M[8]) + M[2] * (M[4] * M[9] - M[5] * M[8]);
const rotY = (a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; };
const rotX = (a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
const rotZ = (a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const trans = (x: number, y: number, z: number): Mat => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const scl = (s: number): Mat => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0];
const DEG = Math.PI / 180;

export function buildOrgan(spec: Spec): Mesh {
  const mb = new MeshBuilder();
  mb.visits = 0;
  emit(spec, IDENT, mb, 0);
  return { pos: mb.pos, nrm: mb.nrm, col: mb.col, idx: mb.idx, extra: mb.extra, volGreen: mb.volGreen, volOther: mb.volOther, sheetGreen: mb.sheetGreen };
}

function emit(spec: Spec | null | undefined, M: Mat, mb: MeshBuilder, depth: number): void {
  // visit budget: nested compositions that emit no geometry would otherwise explode combinatorially
  if (!spec || typeof spec !== 'object' || depth > 8 || mb.count > 20000 || ++mb.visits > 5000) return;
  const sub = (s: Spec, m: Mat) => emit(s, mulMat(M, m), mb, depth + 1);
  const c = spec as unknown as CompSpec;
  switch (spec.type) {
    case 'blade': return emitBlade(spec as unknown as BladeSpec, M, mb);
    case 'bulb': return emitBulb(spec as unknown as BulbSpec, M, mb);
    case 'spike': return emitSpike(spec as unknown as SpikeSpec, M, mb);
    case 'rootlet': return emitRootlet(spec as unknown as RootletSpec, M, mb);
    case 'group': c.items.forEach(s => sub(s, IDENT)); return;
    case 'scale': return sub(c.organ, scl(clampN(c.s, 0.05, 5)));
    case 'tilt': return sub(c.organ, rotX(c.deg * DEG));
    case 'offset': return sub(c.organ, trans(0, c.y, 0));
    case 'whorl': {
      const n = Math.round(clampN(c.n, 1, 40));
      for (let i = 0; i < n; i++) sub(c.organ, mulMat(rotY((i / n) * 2 * Math.PI + c.twist * DEG), rotX(c.tilt * DEG)));
      return;
    }
    case 'spiral': {
      const n = Math.round(clampN(c.n, 1, 80));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        sub(c.organ, mulMat(trans(0, t * c.height, 0), mulMat(rotY(i * 137.5 * DEG), mulMat(rotX(c.tilt * DEG * (1 - 0.5 * t)), scl(c.shrink ** i)))));
      }
      return;
    }
    case 'chain': {
      const n = Math.round(clampN(c.n, 1, 30));
      const len = n * c.spacing;
      emitStalk(mb, M, len, 0.012, [0.3, 0.45, 0.2]);
      for (let i = 0; i < n; i++) {
        const y = (i + 0.5) * c.spacing, s = c.shrink ** i;
        for (const side of [-1, 1]) sub(c.organ, mulMat(trans(0, y, 0), mulMat(rotZ(side * c.angle * DEG), scl(s))));
      }
      if (c.tip > 0.5) sub(c.organ, mulMat(trans(0, len, 0), scl(c.shrink ** n)));
      return;
    }
  }
}
const clampN = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));

function emitStalk(mb: MeshBuilder, M: Mat, length: number, r: number, c: number[]) {
  if (length <= 0) return;
  const tmp = new MeshBuilder();
  tmp.grid(1, 5, (i, j) => {
    const a = j * 2 * Math.PI;
    const rr = r * (1 - 0.4 * i);
    return { p: [Math.cos(a) * rr, i * length, Math.sin(a) * rr], c };
  });
  mb.append(tmp, M);
}

function emitBlade(s: BladeSpec, M: Mat, mb: MeshBuilder) {
  const f = profileFn(s.profile);
  const L = clampN(s.length, 0.02, 6), W = clampN(s.width, 0.01, 6);
  if (s.stalk > 0) { emitStalk(mb, M, s.stalk, 0.012, hsl2rgb(s.color).map(x => x * 0.8)); M = mulMat(M, trans(0, s.stalk, 0)); }
  // Sample the polar outline, rotated so the profile's first lobe points along +Y.
  const SEG = 28, pts: [number, number][] = [];
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let j = 0; j <= SEG; j++) {
    const t = (j / SEG) * 2 * Math.PI, r = f(t);
    const x = r * Math.sin(t), y = r * Math.cos(t);
    pts.push([x, y]);
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  const sx = W / (maxx - minx || 1), sy = L / (maxy - miny || 1);
  const c0 = hsl2rgb(s.color), c1 = s.edge ? hsl2rgb(s.edge) : c0.map(x => Math.min(1, x * 1.25 + 0.04));
  const tmp = new MeshBuilder();
  tmp.grid(4, SEG, (ri, j) => {
    const [px, py] = pts[Math.round(j * SEG)];
    const x = px * sx * ri, y = (py * ri - miny) * sy; // origin (polar centre) maps to (0, -miny*sy)
    const v = y / L;
    const z = s.curl * v * v * L + s.fold * Math.abs(x) + s.wave * 0.05 * Math.sin(x * 40) * ri;
    const midrib = Math.exp(-((x / (W * 0.03 + 1e-3)) ** 2)) * 0.25;
    const t = s.edge ? ri ** 6 : ri * ri; // an explicit edge colour is a thin rim
    const c = [0, 1, 2].map(k => (c0[k] + (c1[k] - c0[k]) * t) * (1 - midrib) + midrib * 0.9 * c0[k]);
    return { p: [x, y, z], c };
  });
  mb.append(tmp, M);
  // blade volume = its area × thickness, in organ space; addVolume scales it like any volume
  const sheet = tmp.area();
  mb.addVolume(sheet * clampN(s.thick, 0.0001, 0.05), M, c0, sheet);
}

function emitBulb(s: BulbSpec, M: Mat, mb: MeshBuilder) {
  const L = clampN(s.length, 0.02, 4), R = clampN(s.radius, 0.005, 2);
  const c = hsl2rgb(s.color ?? { h: 0.02, s: 0.7, l: 0.45 });
  const tmp = new MeshBuilder();
  const ribs = Math.round(clampN(s.ribs, 0, 30));
  tmp.grid(10, 14, (i, j) => {
    const a = j * 2 * Math.PI;
    const r = R * Math.sin(Math.PI * i) ** clampN(s.point, 0.1, 4) * (1 + (ribs ? s.ribdepth * Math.cos(ribs * a) : 0));
    const shade = ribs ? 0.85 + 0.15 * Math.cos(ribs * a) : 1;
    return { p: [Math.cos(a) * r, i * L, Math.sin(a) * r], c: c.map(x => x * shade * (0.8 + 0.2 * i)) };
  });
  mb.append(tmp, M);
  // solid of revolution: ∫ π r(y)² dy over the profile (ribs ignored)
  let vol = 0;
  for (let i = 0; i < 20; i++) vol += Math.PI * (R * Math.sin(Math.PI * (i + 0.5) / 20) ** clampN(s.point, 0.1, 4)) ** 2 * (L / 20);
  mb.addVolume(vol, M, c);
}

function emitSpike(s: SpikeSpec, M: Mat, mb: MeshBuilder) {
  const L = clampN(s.length, 0.01, 4), R = clampN(s.radius, 0.002, 1);
  const c = hsl2rgb(s.color ?? { h: 0.1, s: 0.3, l: 0.7 });
  const tmp = new MeshBuilder();
  tmp.grid(6, 6, (i, j) => {
    const a = j * 2 * Math.PI, r = R * (1 - i);
    return { p: [Math.cos(a) * r, i * L, Math.sin(a) * r + s.bend * i * i * L], c };
  });
  mb.append(tmp, M);
  mb.addVolume((Math.PI * R * R * L) / 3, M, c); // a cone
}

function emitRootlet(s: RootletSpec, M: Mat, mb: MeshBuilder) {
  const L = clampN(s.length, 0.005, 2), R = clampN(s.radius, 0.0005, 0.1);
  const c = hsl2rgb(s.color ?? { h: 0.08, s: 0.3, l: 0.62 });
  const tmp = new MeshBuilder();
  tmp.grid(3, 5, (i, j) => {
    const a = j * 2 * Math.PI, r = R * (1 - 0.7 * i);
    return { p: [Math.cos(a) * r, i * L, Math.sin(a) * r], c };
  });
  mb.append(tmp, M);
  // hair area scales with the square of whatever scale the composition applied
  mb.extra += 2 * Math.PI * R * 0.65 * L * clampN(s.hairs, 0, 20) * Math.abs(det3(M)) ** (2 / 3);
}

// Photosynthetic pigment proxy from the colour's hue, independent of its lightness (SPEC S2:
// hue sets efficiency, lightness sets heat). Any leaf green within ±25° of pure green (120°)
// counts fully, fading to nothing by ±70° (yellow, cyan); near-greys don't count.
export const chlorophyll = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  if (chroma <= 0) return 0;
  const hue = max === r ? 60 * (((g - b) / chroma + 6) % 6) : max === g ? 60 * ((b - r) / chroma + 2) : 60 * ((r - g) / chroma + 4);
  const off = Math.abs(hue - 120);
  return Math.max(0, Math.min(1, 1 - (off - 25) / 45)) * Math.min(1, chroma / 0.08);
};
// How much sunlight a surface absorbs as heat: dark tissue warms, pale tissue reflects.
export const darkness = (r: number, g: number, b: number) => 1 - Math.max(0, Math.min(1, 0.299 * r + 0.587 * g + 0.114 * b));

// absorb: surface that takes up water when underground (drawn area + root hairs).
// volGreen / volOther: tissue volume that stores water / carbohydrate.
// thick: mean thickness of the green sheet tissue (leaves), m; 0 if there is none.
// dark: how dark the green tissue is, 0–1 (green-area weighted), which sets how much it heats in sun.
export interface OrganInfo {
  area: number; green: number; absorb: number; volGreen: number; volOther: number; thick: number; dark: number;
  normals: [number, number, number, number][]; centroid: Vec3;
}

// Summary of an organ mesh for the energy model: total area, green (photosynthetic) area,
// and a few area-weighted normals of the green surface to estimate how it faces the light.
export function organInfo(m: Mesh): OrganInfo {
  const { pos, col, idx } = m;
  let area = 0, green = 0, dark = 0;
  const tris: [number, number, number, number][] = [], centroid: Vec3 = [0, 0, 0];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const n = triNormal([pos[a], pos[a + 1], pos[a + 2]], [pos[b], pos[b + 1], pos[b + 2]], [pos[c], pos[c + 1], pos[c + 2]]);
    const l = Math.hypot(...n), ar = l / 2;
    if (!ar) continue;
    const ch = chlorophyll((col[a] + col[b] + col[c]) / 3, (col[a + 1] + col[b + 1] + col[c + 1]) / 3, (col[a + 2] + col[b + 2] + col[c + 2]) / 3);
    area += ar; green += ar * ch;
    dark += ar * ch * darkness((col[a] + col[b] + col[c]) / 3, (col[a + 1] + col[b + 1] + col[c + 1]) / 3, (col[a + 2] + col[b + 2] + col[c + 2]) / 3);
    for (let k = 0; k < 3; k++) centroid[k] += ar * (pos[a + k] + pos[b + k] + pos[c + k]) / 3;
    if (ch > 0) tris.push([n[0] / l, n[1] / l, n[2] / l, ar * ch]);
  }
  const step = Math.max(1, Math.ceil(tris.length / 24));
  const normals: [number, number, number, number][] = [];
  for (let i = 0; i < tris.length; i += step) {
    const bin = tris.slice(i, i + step), w = bin.reduce((s, t) => s + t[3], 0);
    if (w > 0) normals.push([bin[0][0], bin[0][1], bin[0][2], w / (green || 1)]);
  }
  return {
    area, green, absorb: area + (m.extra ?? 0), volGreen: m.volGreen ?? 0, volOther: m.volOther ?? 0,
    thick: m.sheetGreen ? (m.volGreen ?? 0) / m.sheetGreen : 0, dark: green ? dark / green : 0,
    normals, centroid: centroid.map(v => v / (area || 1)) as Vec3,
  };
}
