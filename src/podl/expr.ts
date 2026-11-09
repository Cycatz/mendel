// Shared expression language used by num genes, rule conditions/arguments and organ programs.
//   expr   := or
//   or     := and ('or' and)*
//   and    := cmp ('and' cmp)*
//   cmp    := add (('<'|'<='|'>'|'>='|'=='|'!=') add)?
//   add    := mul (('+'|'-') mul)*
//   mul    := unary (('*'|'/'|'%') unary)*
//   unary  := '-' unary | 'not' unary | primary
//   primary:= number | $GENE | ident | ident '(' args ')' | '(' expr ')'
//   args   := [ident '='] expr (',' [ident '='] expr)*

export type Token = { t: 'num'; v: number } | { t: 'gene' | 'id' | 'op'; v: string };

export interface NumNode { t: 'num'; v: number }
export interface Arg { name: string | null; value: Node }
export type Node =
  | NumNode
  | { t: 'gene'; name: string }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'not'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; name: string; args: Arg[] };

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(e[-+]?[0-9]+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number near "${src.slice(i, i + 8)}"`);
      toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
      if (!m) throw new Error('Expected gene name after $');
      toks.push({ t: 'gene', v: m[1] }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      toks.push({ t: 'op', v: two === '&&' ? 'and' : two === '||' ? 'or' : two }); i += 2; continue;
    }
    if ('+-*/%<>(),='.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return toks;
}

export function parseExpr(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek() && (peek().t === 'op' || peek().t === 'id') && peek().v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}" in: ${src}`); p++; };

  function or(): Node { let a = and(); while (isOp('or')) { p++; a = { t: 'bin', op: 'or', a, b: and() }; } return a; }
  function and(): Node { let a = cmp(); while (isOp('and')) { p++; a = { t: 'bin', op: 'and', a, b: cmp() }; } return a; }
  function cmp(): Node {
    const a = add();
    for (const op of ['<=', '>=', '==', '!=', '<', '>']) if (isOp(op)) { p++; return { t: 'bin', op, a, b: add() }; }
    return a;
  }
  function add(): Node {
    let a = mul();
    while (isOp('+') || isOp('-')) { const op = toks[p++].v as string; a = { t: 'bin', op, a, b: mul() }; }
    return a;
  }
  function mul(): Node {
    let a = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[p++].v as string; a = { t: 'bin', op, a, b: unary() }; }
    return a;
  }
  function unary(): Node {
    if (isOp('-')) { p++; const a = unary(); return a.t === 'num' ? { t: 'num', v: -a.v } : { t: 'neg', a }; }
    if (isOp('not')) { p++; return { t: 'not', a: unary() }; }
    return primary();
  }
  function primary(): Node {
    const tk = peek();
    if (!tk) throw new Error(`Unexpected end of: ${src}`);
    if (tk.t === 'num') { p++; return { t: 'num', v: tk.v }; }
    if (tk.t === 'gene') { p++; return { t: 'gene', name: tk.v }; }
    if (tk.t === 'op' && tk.v === '(') { p++; const e = or(); eat(')'); return e; }
    if (tk.t === 'id') {
      p++;
      if (isOp('(')) {
        p++;
        const args: Arg[] = [];
        if (!isOp(')')) {
          do {
            const t0 = toks[p], t1 = toks[p + 1];
            if (t0?.t === 'id' && t1?.t === 'op' && t1.v === '=') {
              const name = t0.v; p += 2; args.push({ name, value: or() });
            } else args.push({ name: null, value: or() });
          } while (isOp(',') && ++p);
        }
        eat(')');
        return { t: 'call', name: tk.v, args };
      }
      return { t: 'var', name: tk.v };
    }
    throw new Error(`Unexpected "${tk.v}" in: ${src}`);
  }
  const e = or();
  if (p < toks.length) throw new Error(`Trailing "${toks[p].v}" in: ${src}`);
  return e;
}

const PREC: Record<string, number> = { or: 1, and: 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '%': 5 };

export function printExpr(n: Node, parentPrec = 0): string {
  switch (n.t) {
    case 'num': return fmtNum(n.v);
    case 'gene': return '$' + n.name;
    case 'var': return n.name;
    case 'neg': return '-' + printExpr(n.a, 9);
    case 'not': return 'not ' + printExpr(n.a, 9);
    case 'call': return `${n.name}(${n.args.map(a => (a.name ? a.name + '=' : '') + printExpr(a.value)).join(', ')})`;
    case 'bin': {
      const pr = PREC[n.op];
      const s = `${printExpr(n.a, pr)} ${n.op} ${printExpr(n.b, pr + 1)}`;
      return pr < parentPrec ? `(${s})` : s;
    }
  }
  throw new Error('bad node ' + (n as Node).t);
}

export function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1000) / 1000);
}

const MATH: Record<string, (...x: number[]) => number> = {
  min: Math.min, max: Math.max, abs: Math.abs, sin: Math.sin, cos: Math.cos,
  sqrt: Math.sqrt, pow: Math.pow, floor: Math.floor, exp: Math.exp,
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  mix: (a, b, t) => a + (b - a) * t,
};

// Expressions evaluate to numbers, except organ programs, whose calls return shape specs.
export type Value = unknown;

export interface EvalCtx {
  vars?: Record<string, number>;
  gene: (name: string) => number;
  rand: () => number;
  ref?: (name: string) => Value;
  call?: (name: string, args: Arg[], ctx: EvalCtx) => Value;
}

export function evalExpr(n: Node, ctx: EvalCtx): Value {
  switch (n.t) {
    case 'num': return n.v;
    case 'gene': return ctx.gene(n.name);
    case 'var':
      if (ctx.vars && n.name in ctx.vars) return ctx.vars[n.name];
      if (ctx.ref) { const r = ctx.ref(n.name); if (r !== undefined) return r; }
      throw new Error(`Unknown name "${n.name}"`);
    case 'neg': return -(evalExpr(n.a, ctx) as number);
    case 'not': return evalExpr(n.a, ctx) ? 0 : 1;
    case 'bin': {
      const a = evalExpr(n.a, ctx) as number;
      if (n.op === 'and') return a ? evalExpr(n.b, ctx) : 0;
      if (n.op === 'or') return a ? a : evalExpr(n.b, ctx);
      const b = evalExpr(n.b, ctx) as number;
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b;
        case '<': return +(a < b); case '<=': return +(a <= b); case '>': return +(a > b);
        case '>=': return +(a >= b); case '==': return +(a === b); case '!=': return +(a !== b);
      }
      break;
    }
    case 'call': {
      if (n.name === 'rand') return ctx.rand();
      if (MATH[n.name]) return MATH[n.name](...n.args.map(a => evalExpr(a.value, ctx) as number));
      if (ctx.call) return ctx.call(n.name, n.args, ctx);
      throw new Error(`Unknown function "${n.name}"`);
    }
  }
  throw new Error('bad node');
}
