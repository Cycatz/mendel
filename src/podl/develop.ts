// Development: genotype -> expressed program -> L-system derivation -> turtle -> skeleton.
// The output is renderer-agnostic: stem segments and organ placements with full frames.
//
// This is a pure morphological derivation: every bud with a matching rule is rewritten each
// step. (Viridarium runs the same derivation under an energy/water budget; that physiology is
// not part of this package.) Rule conditions and arguments can read:
//   age, order, step, x (the module's own argument), depth (below ground, m)
import { evalExpr } from './expr';
import { express, parseSuccessor, GENE_DEFAULTS, type Expressed, type Genome, type Rule, type Tok, type ExpressedRule } from './genome';
import { evalOrgan, buildOrgan, organInfo, type Gene, type Mesh, type OrganInfo, type Vec3 } from './organs';
import { mulberry32, type Rand } from './rng';

export const MAX_MODULES = 9000;

// A module in the derivation string: turtle symbol, growing module (capital), organ (@) or bracket.
export interface Module { s: string; organ?: string; age: number; order: number; j: number; j2: number; val?: number }
export interface Segment { p0: Vec3; p1: Vec3; r0: number; r1: number; order: number; i: number }
export interface OrganPlacement { name: string; p: Vec3; H: Vec3; L: Vec3; U: Vec3; s: number; order: number; age: number; i: number }
export interface Template { mesh: Mesh; info: OrganInfo }

// Evaluate num genes lazily so genes can depend on each other (epistasis).
export function makeGeneReader(ph: Expressed, rand: Rand): Gene {
  const memo: Record<string, number> = {}, busy = new Set<string>();
  const read = (name: string): number => {
    if (name in memo) return memo[name];
    const g = ph.nums[name];
    if (!g) return (memo[name] = GENE_DEFAULTS[name] ?? 0);
    if (busy.has(name)) return 0;
    busy.add(name);
    const ctx = { gene: read, rand, vars: {} };
    let v = 0;
    try {
      const vals = g.progs.map(p => evalExpr(p, ctx) as number);
      v = vals.reduce((s, x) => s + x, 0) / vals.length;
      if (g.half) v *= 0.5; // one functional copy: half dosage
    } catch { v = 0; }
    busy.delete(name);
    return (memo[name] = Number.isFinite(v) ? v : 0);
  };
  return read;
}

// ---- tiny vector helpers ----
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3) => { const l = len(a) || 1; return scale(a, 1 / l); };
function rot(v: Vec3, axis: Vec3, ang: number): Vec3 { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), k = axis;
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}
const DEG = Math.PI / 180;

interface TurtleState { p: Vec3; H: Vec3; L: Vec3; U: Vec3; w: number }

// Where a module system starts and what it bends toward: the shoot grows up (leaning toward
// `lean`, e.g. the sun, if given); the root grows down and bends toward gravity.
export interface Frame { H: Vec3; L: Vec3; U: Vec3; w: number; tropTarget: Vec3; tropism: number }
export const shootFrame = (gene: Gene, lean: Vec3 = [0, 0, 0]): Frame => ({
  H: [0, 1, 0], L: [-1, 0, 0], U: [0, 0, 1], w: gene('STEM_W'),
  tropTarget: norm(add([0, 1, 0], lean)), tropism: gene('TROPISM'),
});
export const rootFrame = (gene: Gene): Frame => ({
  H: [0, -1, 0], L: [-1, 0, 0], U: [0, 0, -1], w: gene('ROOT_W'), tropTarget: [0, -1, 0], tropism: gene('ROOT_GRAV'),
});

// Turtle interpretation of a module string. Symbols:
//   F(l)  internode of length l ($INTERNODE)    + - (a)  turn about U ($ANGLE)
//   & ^ (a)  pitch about L ($ANGLE)              / \ (a)  roll about H ($PHYLLO)
//   !(k)  scale width (0.8)                       ~(a)  random jitter (12°)
//   [ ]   push / pop (branches taper by $TAPER)   @organ(s)  place an organ at scale s
export function interpret(mods: Module[], frame: Frame, gene: Gene) {
  const segments: Segment[] = [], organs: OrganPlacement[] = [], stack: TurtleState[] = [];
  const at: { p: Vec3; w: number }[] = new Array(mods.length);
  const { tropTarget, tropism } = frame;
  const angle = gene('ANGLE'), phyllo = gene('PHYLLO'), inter = gene('INTERNODE');
  const taper = gene('TAPER');
  let st: TurtleState = { p: [0, 0, 0], H: frame.H, L: frame.L, U: frame.U, w: frame.w };
  const turn = (axisKey: 'H' | 'L' | 'U', a: number) => {
    const ax = st[axisKey];
    for (const k of ['H', 'L', 'U'] as const) if (k !== axisKey) st[k] = norm(rot(st[k], ax, a * DEG));
  };
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    at[i] = { p: st.p, w: st.w };
    switch (m.s) {
      case 'F': {
        const grow = Math.min(1, 0.45 + 0.3 * m.age);
        const l = Math.max(0, (m.val ?? inter) * grow);
        if (l <= 0) break;
        const w0 = st.w * (1 + Math.min(0.12 * m.age, 1.5));
        const p1 = add(st.p, scale(st.H, l));
        segments.push({ p0: st.p, p1, r0: w0, r1: w0 * 0.93, order: m.order, i });
        st.p = p1;
        st.w *= 0.985;
        const ax = cross(st.H, tropTarget), s = len(ax);
        if (s > 1e-4 && tropism) {
          const a = Math.min(tropism * s * l * 2, Math.asin(Math.min(1, s)));
          const k = norm(ax);
          st.H = norm(rot(st.H, k, a)); st.L = norm(rot(st.L, k, a)); st.U = norm(rot(st.U, k, a));
        }
        break;
      }
      case '+': turn('U', m.val ?? angle); break;
      case '-': turn('U', -(m.val ?? angle)); break;
      case '&': turn('L', m.val ?? angle); break;
      case '^': turn('L', -(m.val ?? angle)); break;
      case '/': turn('H', m.val ?? phyllo); break;
      case '\\': turn('H', -(m.val ?? phyllo)); break;
      case '!': st.w *= m.val ?? 0.8; break;
      case '~': { const a = (m.val ?? 12) * (m.j * 2 - 1); turn(m.j2 < 0.5 ? 'L' : 'U', a); break; }
      case '[': stack.push(st); st = { ...st, w: st.w * taper }; break;
      case ']': if (stack.length) st = stack.pop()!; break;
      case '@': {
        const grow = Math.min(1, (m.age + 1) / 3);
        organs.push({ name: m.organ!, p: st.p, H: st.H, L: st.L, U: st.U, s: (m.val ?? 1) * grow, order: m.order, age: m.age, i });
        break;
      }
    }
    if (segments.length > 20000) break;
  }
  return { segments, organs, at };
}

export type Skeleton = ReturnType<typeof interpret>;

export interface DevelopOptions {
  steps?: number;      // derivation steps (default 12, one viridarium season)
  seed?: number;       // all randomness (jitter, rand(), codominant mosaics) flows from this
  lean?: Vec3;         // direction the shoot's tropism leans toward, added to straight up
  maxModules?: number; // stop deriving once the module strings grow past this
}

export function develop(genome: Genome, opts: DevelopOptions = {}) {
  const { steps = 12, seed = 1, lean, maxModules = MAX_MODULES } = opts;
  const ph = express(genome);
  const rand = mulberry32(seed);
  const gene = makeGeneReader(ph, rand);
  const shootF = shootFrame(gene, lean), rootF = rootFrame(gene);

  const templates: Record<string, Template | null> = {};
  const tpl = (name: string): Template | null => {
    if (!(name in templates)) {
      const spec = evalOrgan(name, ph, gene, rand);
      const mesh = spec ? buildOrgan(spec) : null;
      templates[name] = mesh && mesh.idx.length ? { mesh, info: organInfo(mesh) } : null;
    }
    return templates[name];
  };

  const mk = (tok: Tok, order: number, parentVars: Record<string, number>): Module => {
    const m: Module = { s: tok.s, organ: tok.organ, age: 0, order, j: rand(), j2: rand() };
    if (tok.arg) { try { m.val = evalExpr(tok.arg, { gene, rand, vars: parentVars }) as number; } catch { m.val = 0; } }
    return m;
  };
  const expand = (succ: Tok[], order: number, mv: Record<string, number>) => {
    const out: Module[] = [];
    let d = 0;
    for (const t of succ) {
      if (t.s === '[') d++;
      out.push(mk(t, order + d, mv));
      if (t.s === ']') d--;
    }
    return out;
  };
  const vars0 = { age: 0, order: 0, step: 0, x: 0, depth: 0 };
  let mods = expand(parseSuccessor(genome.axiom), 0, vars0);
  let rmods = genome.rootAxiom ? expand(parseSuccessor(genome.rootAxiom), 0, vars0) : [];

  // Rules are tried in locus order; the first whose condition holds rewrites the module.
  // Codominant rule alleles form a mosaic: each module picks one of the two at random.
  const byPred: Record<string, ExpressedRule[]> = {};
  for (const r of ph.rules) for (const p of r.progs) if (!(byPred[p.pred] ||= []).includes(r)) byPred[p.pred].push(r);
  const pickRule = (m: Module, mv: Record<string, number>): Rule | null => {
    for (const r of byPred[m.s] ?? []) {
      const prog = r.progs.length > 1 ? r.progs[rand() < 0.5 ? 0 : 1] : r.progs[0];
      if (prog.pred !== m.s) continue;
      let ok = true;
      if (prog.cond) { try { ok = !!evalExpr(prog.cond, { gene, rand, vars: mv }); } catch { ok = false; } }
      if (ok) return prog;
    }
    return null;
  };

  // One derivation step: rewrite every bud that has a matching rule, age everything else.
  const derive = (ms: Module[], sk: Skeleton, step: number) => {
    const next: Module[] = [];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const mv = { age: m.age, order: m.order, step, x: m.val ?? 0, depth: -sk.at[i].p[1] };
      const prog = /[A-Z]/.test(m.s) && byPred[m.s] ? pickRule(m, mv) : null;
      if (prog) { next.push(...expand(prog.succ, m.order, mv)); }
      else { m.age++; next.push(m); }
    }
    return next;
  };

  let truncated = false, stepsRun = 0;
  for (let step = 0; step < steps; step++) {
    const shoot = derive(mods, interpret(mods, shootF, gene), step);
    const root = derive(rmods, interpret(rmods, rootF, gene), step);
    mods = shoot; rmods = root; stepsRun = step + 1;
    if (mods.length + rmods.length > maxModules) { truncated = true; break; }
  }

  const skel = interpret(mods, shootF, gene);
  const roots = interpret(rmods, rootF, gene);
  // make sure every placed organ has a template
  for (const o of [...skel.organs, ...roots.organs]) tpl(o.name);
  return { ph, gene, ...skel, roots, templates, modules: mods, rootModules: rmods, steps: stepsRun, truncated };
}

export type Development = ReturnType<typeof develop>;
