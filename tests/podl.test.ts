import { describe, expect, it } from 'vitest';
import { develop, parseGenome, printGenome, plantMesh, STARTERS } from '../src/podl';

const starters = () => STARTERS.map(s => parseGenome(s));

describe('PODL language', () => {
  it('parses every starter', () => {
    for (const g of starters()) expect(g.loci.length).toBeGreaterThan(10);
  });

  it('round-trips through printGenome', () => {
    for (const g of starters()) expect(parseGenome(printGenome(g))).toEqual(g);
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseGenome('plant "X"\nchromosome 1\n  num A @1 : a/a\n    a = 1 +')).toThrow(/Line 4/);
  });
});

describe('development', () => {
  it('grows shoot, organs and roots for every starter', () => {
    for (const g of starters()) {
      const m = plantMesh(develop(g, { seed: 1 }));
      expect(m.stats.height, g.name).toBeGreaterThan(0.2);
      expect(m.stats.rootDepth, g.name).toBeGreaterThan(0.05);
      expect(Object.keys(m.stats.organs).length, g.name).toBeGreaterThan(1);
      expect(m.stats.truncated, g.name).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    const g = starters()[0];
    const a = plantMesh(develop(g, { seed: 7 })), b = plantMesh(develop(g, { seed: 7 }));
    expect(a.pos).toEqual(b.pos);
    expect(a.roots.pos).toEqual(b.roots.pos);
  });

  it('dominance decides the expressed allele', () => {
    // Fernwort leaf C/s: C (dom 2) is a compound chain of leaflets, s is a single scaled leaflet
    const g = starters()[0];
    const leaf = g.loci.find(l => l.name === 'leaf')!;
    const tris = () => develop(g, { seed: 1 }).templates.leaf!.mesh.idx.length;
    const het = tris();
    leaf.alleles = [leaf.alleles[1], leaf.alleles[1]];
    expect(tris()).toBeLessThan(het);
  });
});
