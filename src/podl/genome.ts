// PODL: Plant & Organ Description Language.
// A genome is a diploid set of loci on chromosomes. Every locus carries two alleles,
// and an allele is a small program whose meaning depends on the gene kind:
//   num   – an expression yielding a number ($NAME elsewhere)
//   rule  – a developmental production "A when cond -> successor"
//   organ – a shape program built from geometry primitives and other organs
//
//   plant "Fernwort"
//   axiom A
//   chromosome 1
//     rule APEX @20 : M/m
//       M dom 2 = A when age < 8 -> F [ &($ANGLE) B ] /($PHYLLO) A
//       m dom 1 = none
//     num ANGLE @60 : w/w
//       w = 40
import { parseExpr, printExpr, type Node } from './expr';

export const KINDS = ['num', 'rule', 'organ'] as const;
export type GeneKind = (typeof KINDS)[number];
export const NONE = 'none';

export interface Allele { id: string; dom: number; src: string }
export interface Locus { name: string; kind: GeneKind; chrom: string; pos: number; alleles: [Allele, Allele] }
// `rootAxiom` starts the underground L-system; a genome without one grows no roots.
export interface Genome { name: string; axiom: string; rootAxiom?: string; loci: Locus[]; mutations?: string[] }

// Successor token: a module or turtle symbol, an organ placement (s = '@'), or a bracket.
export interface Tok { s: string; organ?: string; arg?: Node }
export interface Rule { pred: string; cond: Node | null; succ: Tok[] }

interface DraftLocus { name: string; kind: GeneKind; chrom: string; pos: number; geno: [string, string]; defs: Record<string, Allele> }

export function parseGenome(text: string): Genome {
  const g: Genome = { name: 'Unnamed', axiom: 'A', loci: [] };
  const drafts: DraftLocus[] = [];
  const lines = text.split('\n');
  let chrom = '1', locus: DraftLocus | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    const ln = i + 1;
    let m: RegExpExecArray | null;
    try {
      if ((m = /^plant\s+"([^"]*)"$/.exec(line))) { g.name = m[1]; continue; }
      if ((m = /^axiom\s+(.+)$/.exec(line))) { g.axiom = m[1]; parseSuccessor(m[1]); continue; }
      if ((m = /^root\s+(.+)$/.exec(line))) { g.rootAxiom = m[1]; parseSuccessor(m[1]); continue; }
      if ((m = /^chromosome\s+(\S+)$/.exec(line))) { chrom = m[1]; locus = null; continue; }
      if ((m = /^(num|rule|organ)\s+([A-Za-z_][A-Za-z0-9_]*)\s+@(\d+(?:\.\d+)?)\s*:\s*([^\s/]+)\s*\/\s*(\S+)$/.exec(line))) {
        locus = { name: m[2], kind: m[1] as GeneKind, chrom, pos: parseFloat(m[3]), geno: [m[4], m[5]], defs: {} };
        if (m[1] === 'organ' && !/^[a-z_][a-z0-9_]*$/.test(m[2])) throw new Error('Organ gene names must be lowercase');
        if (m[1] !== 'organ' && !/^[A-Z_][A-Z0-9_]*$/.test(m[2])) throw new Error('num/rule gene names must be UPPERCASE');
        const name = m[2];
        if (drafts.some(l => l.name === name)) throw new Error(`Duplicate gene ${name}`);
        drafts.push(locus);
        continue;
      }
      if ((m = /^([^\s=]+)\s+(?:dom\s+(-?\d+)\s*)?=\s*(.*)$/.exec(line)) || (m = /^([^\s=]+)\s*()=\s*(.*)$/.exec(line))) {
        if (!locus) throw new Error('Allele outside of a gene');
        let src = m[3];
        while (depth(src) > 0 && i + 1 < lines.length) src += ' ' + lines[++i].replace(/#.*$/, '').trim();
        src = src.replace(/\s+/g, ' ').trim();
        compileAllele(locus.kind, src); // validate early
        locus.defs[m[1]] = { id: m[1], dom: m[2] ? parseInt(m[2], 10) : 1, src };
        continue;
      }
      throw new Error(`Cannot read "${line}"`);
    } catch (e) {
      throw new Error(`Line ${ln}: ${(e as Error).message}`);
    }
  }
  for (const l of drafts) {
    const alleles = l.geno.map(id => {
      if (id === NONE || id === '0') return noneAllele();
      if (!l.defs[id]) throw new Error(`Gene ${l.name}: allele "${id}" is not defined`);
      return { ...l.defs[id] };
    }) as [Allele, Allele];
    g.loci.push({ name: l.name, kind: l.kind, chrom: l.chrom, pos: l.pos, alleles });
  }
  sortLoci(g);
  return g;
}

export const noneAllele = (): Allele => ({ id: '0', dom: 0, src: NONE });

function depth(s: string) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') d--; } return d; }

export function sortLoci(g: Genome) {
  g.loci.sort((a, b) => String(a.chrom).localeCompare(String(b.chrom), undefined, { numeric: true }) || a.pos - b.pos);
}

export function printGenome(g: Genome): string {
  const out = [`plant "${g.name}"`, `axiom ${g.axiom}`];
  if (g.rootAxiom) out.push(`root ${g.rootAxiom}`);
  let chrom: string | null = null;
  for (const l of g.loci) {
    if (l.chrom !== chrom) { chrom = l.chrom; out.push('', `chromosome ${chrom}`); }
    out.push(`  ${l.kind} ${l.name} @${+l.pos.toFixed(1)} : ${l.alleles[0].id}/${l.alleles[1].id}`);
    const seen = new Set<string>();
    for (const a of l.alleles) {
      if (seen.has(a.id) || (a.src === NONE && a.id === '0')) continue;
      seen.add(a.id);
      out.push(`    ${a.id}${a.dom !== 1 ? ' dom ' + a.dom : ''} = ${a.src}`);
    }
  }
  return out.join('\n') + '\n';
}

export const cloneGenome = (g: Genome): Genome => JSON.parse(JSON.stringify(g));

// ---------- allele compilation (cached by source text) ----------
const cache = new Map<string, Node | Rule | null>();
export function compileAllele(kind: 'rule', src: string): Rule | null;
export function compileAllele(kind: 'num' | 'organ', src: string): Node | null;
export function compileAllele(kind: GeneKind, src: string): Node | Rule | null;
export function compileAllele(kind: GeneKind, src: string): Node | Rule | null {
  const key = kind + '\u0000' + src;
  if (cache.has(key)) return cache.get(key)!;
  let v: Node | Rule | null;
  if (src === NONE) v = null;
  else if (kind === 'rule') v = parseRule(src);
  else v = parseExpr(src);
  cache.set(key, v);
  return v;
}

// rule := PRED [when COND] -> SUCCESSOR
export function parseRule(src: string): Rule {
  const m = /^([A-Z])\s*(?:when\s+(.+?))?\s*->\s*(.*)$/.exec(src);
  if (!m) throw new Error(`Rule must look like "A when cond -> F A": ${src}`);
  return { pred: m[1], cond: m[2] ? parseExpr(m[2]) : null, succ: parseSuccessor(m[3]) };
}

export function printRule(r: Rule): string {
  return `${r.pred}${r.cond ? ' when ' + printExpr(r.cond) : ''} -> ${printSuccessor(r.succ)}`;
}

// Successor symbols: A–Z modules (F = internode), turtle ops + - & ^ / \ ! ~, brackets, @organ.
export const TURTLE = '+-&^/\\!~';
export function parseSuccessor(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    let tok: Tok;
    if (c === '[' || c === ']') { out.push({ s: c }); i++; continue; }
    if (c === '@') {
      const m = /^@([a-z_][a-z0-9_]*)/.exec(s.slice(i));
      if (!m) throw new Error('Expected organ name after @');
      tok = { s: '@', organ: m[1] }; i += m[0].length;
    } else if (/[A-Z]/.test(c) || TURTLE.includes(c)) { tok = { s: c }; i++; }
    else throw new Error(`Unknown symbol "${c}"`);
    if (s[i] === '(') {
      let d = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; }
      if (d !== 0) throw new Error('Unbalanced parentheses');
      tok.arg = parseExpr(s.slice(i + 1, j)); i = j + 1;
    }
    out.push(tok);
  }
  let d = 0;
  for (const t of out) { if (t.s === '[') d++; if (t.s === ']' && --d < 0) throw new Error('Unbalanced brackets'); }
  if (d) throw new Error('Unbalanced brackets');
  return out;
}

export function printSuccessor(succ: Tok[]): string {
  return succ.map(t => (t.s === '@' ? '@' + t.organ : t.s) + (t.arg ? `(${printExpr(t.arg)})` : '')).join(' ');
}

// ---------- genotype → expressed phenotype program ----------
// Classic Mendelian dominance on discrete alleles: the higher `dom` wins outright.
// Equal dominance with different alleles = codominance: numbers and organ shapes blend,
// rules are expressed as a mosaic (each module picks one at random).
export interface Resolution { mode: 'off' | 'homo' | 'dominant' | 'dosage' | 'co'; use: Allele[]; half?: boolean }

export function resolveLocus(l: Locus): Resolution {
  const [a, b] = l.alleles;
  if (a.src === b.src) return { mode: a.src === NONE ? 'off' : 'homo', use: [a] };
  if (a.dom !== b.dom) {
    const w = a.dom > b.dom ? a : b;
    return { mode: w.src === NONE ? 'off' : 'dominant', use: [w] };
  }
  if (a.src === NONE || b.src === NONE) return { mode: 'dosage', use: [a.src === NONE ? b : a], half: true };
  return { mode: 'co', use: [a, b] };
}

// Defaults for the num genes the turtle reads. Any other $GENE that a genome doesn't define reads 0.
export const GENE_DEFAULTS: Record<string, number> = {
  // the plate's outline round the plant (weight; 0 black to 1 the plant's own dark colour); read by the viewer, not the turtle
  INK: 1, INK_TINT: 0,
  SOFT_SHADE: 0, // the plate's shadow on the plant: 0 the full cool shadow, toward 1 close to the sunlit colour
  YELLOW_WASH: 1, // the plate's gamboge tint: 1 on every colour, 0 only on greens and yellows
  ANGLE: 30, PHYLLO: 137.5, INTERNODE: 0.5, STEM_W: 0.05, TROPISM: 0.15, TAPER: 0.7,
  // roots: starting thickness, pull toward gravity, how deep the starters' root rules grow
  ROOT_W: 0.012, ROOT_GRAV: 0.25, ROOT_DEPTH: 0.5,
};

export interface ExpressedRule { gene: string; pred: string; progs: Rule[] }
export interface Expressed {
  genome: Genome;
  nums: Record<string, { progs: Node[]; half?: boolean }>;
  rules: ExpressedRule[];
  organs: Record<string, { progs: Node[] }>;
  info: Record<string, Resolution>;
}

export function express(genome: Genome): Expressed {
  const ph: Expressed = { genome, nums: {}, rules: [], organs: {}, info: {} };
  for (const l of genome.loci) {
    const r = resolveLocus(l);
    ph.info[l.name] = r;
    if (r.mode === 'off') continue;
    const progs = r.use.map(a => compileAllele(l.kind, a.src));
    if (l.kind === 'num') ph.nums[l.name] = { progs: progs as Node[], half: r.half };
    else if (l.kind === 'organ') ph.organs[l.name] = { progs: progs as Node[] };
    else ph.rules.push({ gene: l.name, pred: (progs[0] as Rule).pred, progs: progs as Rule[] });
  }
  return ph;
}
