// Skeleton -> triangle mesh: stems become tapered tubes, organ templates are instanced by
// turtle frame. Shoot and roots are separate meshes so a renderer can show or hide the roots.
import type { Development, Segment, OrganPlacement } from './develop';
import { applyMat, type Mat, type Mesh } from './organs';

export const MAX_TRIS = 250000;

const emptyMesh = (): Mesh => ({ pos: [], nrm: [], col: [], idx: [] });

function pushInto(out: Mesh, m: Mesh, mat: Mat) {
  const { pos, nrm, col, idx } = out;
  const base = pos.length / 3;
  for (let i = 0; i < m.pos.length; i += 3) {
    pos.push(...applyMat(mat, m.pos[i], m.pos[i + 1], m.pos[i + 2], 1));
    const n = applyMat(mat, m.nrm[i], m.nrm[i + 1], m.nrm[i + 2], 0), l = Math.hypot(...n) || 1;
    nrm.push(n[0] / l, n[1] / l, n[2] / l);
  }
  for (let i = 0; i < m.col.length; i++) col.push(m.col[i]);
  for (let i = 0; i < m.idx.length; i++) idx.push(base + m.idx[i]);
}

function axes(out: Mesh, segments: Segment[], colour: (order: number) => number[]) {
  for (const s of segments) {
    const d = [s.p1[0] - s.p0[0], s.p1[1] - s.p0[1], s.p1[2] - s.p0[2]];
    const l = Math.hypot(...d);
    if (l < 1e-5) continue;
    const H = d.map(x => x / l);
    const ref = Math.abs(H[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let X = [H[1] * ref[2] - H[2] * ref[1], H[2] * ref[0] - H[0] * ref[2], H[0] * ref[1] - H[1] * ref[0]];
    const xl = Math.hypot(...X); X = X.map(v => v / xl);
    const Z = [X[1] * H[2] - X[2] * H[1], X[2] * H[0] - X[0] * H[2], X[0] * H[1] - X[1] * H[0]];
    pushInto(out, tube(l, s.r0, s.r1, colour(s.order)), [X[0], H[0], Z[0], s.p0[0], X[1], H[1], Z[1], s.p0[1], X[2], H[2], Z[2], s.p0[2]]);
  }
}

function instance(out: Mesh, organs: OrganPlacement[], dev: Development, counts: Record<string, number>) {
  for (const o of organs) {
    const t = dev.templates[o.name]?.mesh;
    if (!t || !t.pos.length || o.s <= 0) continue;
    counts[o.name] = (counts[o.name] || 0) + 1;
    const s = o.s;
    pushInto(out, t, [o.L[0] * s, o.H[0] * s, o.U[0] * s, o.p[0], o.L[1] * s, o.H[1] * s, o.U[1] * s, o.p[1], o.L[2] * s, o.H[2] * s, o.U[2] * s, o.p[2]]);
    if (out.idx.length > 3 * MAX_TRIS) break;
  }
}

const stemCol = (o: number) => [0.32 - 0.04 * Math.min(o, 3), 0.27 + 0.06 * Math.min(o, 3), 0.16];
const rootCol = (o: number) => [0.55 - 0.03 * Math.min(o, 3), 0.45 - 0.02 * Math.min(o, 3), 0.33];

export function plantMesh(dev: Development) {
  const shoot = emptyMesh(), roots = emptyMesh();
  const counts: Record<string, number> = {};
  axes(shoot, dev.segments, stemCol);
  instance(shoot, dev.organs, dev, counts);
  axes(roots, dev.roots.segments, rootCol);
  instance(roots, dev.roots.organs, dev, counts);

  let maxy = 0, minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  const p = shoot.pos;
  for (let i = 0; i < p.length; i += 3) {
    minx = Math.min(minx, p[i]); maxx = Math.max(maxx, p[i]);
    minz = Math.min(minz, p[i + 2]); maxz = Math.max(maxz, p[i + 2]); maxy = Math.max(maxy, p[i + 1]);
  }
  const stats = {
    height: maxy, width: p.length ? Math.max(maxx - minx, maxz - minz) : 0,
    rootDepth: roots.pos.reduce((d, v, i) => (i % 3 === 1 ? Math.max(d, -v) : d), 0),
    organs: counts, triangles: (shoot.idx.length + roots.idx.length) / 3,
    modules: dev.modules.length + dev.rootModules.length, truncated: dev.truncated,
  };
  return { ...shoot, roots, stats };
}

export type PlantMesh = ReturnType<typeof plantMesh>;

function tube(l: number, r0: number, r1: number, c: number[]): Mesh {
  const S = 6, pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= 1; i++) for (let j = 0; j <= S; j++) {
    const a = (j / S) * Math.PI * 2, r = i ? r1 : r0;
    pos.push(Math.cos(a) * r, i * l, Math.sin(a) * r);
    nrm.push(Math.cos(a), 0, Math.sin(a));
    col.push(...c);
  }
  for (let j = 0; j < S; j++) { const a = j, b = j + 1, cc = j + S + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  return { pos, nrm, col, idx };
}
