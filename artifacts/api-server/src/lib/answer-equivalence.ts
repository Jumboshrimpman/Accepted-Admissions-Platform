/**
 * Forgiving free-response grading.
 *
 * A typed answer matches when it is the same number or the same polynomial
 * as an accepted form. Factored keys stay strict: the student must submit a
 * product whose factors match (order, spacing, and sign flips that cancel
 * may vary). An expanded polynomial does not match a factored key.
 */

type Q = { n: bigint; d: bigint };

type Expr =
  | { t: "num"; v: Q }
  | { t: "var"; name: string }
  | { t: "neg"; x: Expr }
  | { t: "add"; xs: Expr[] }
  | { t: "mul"; xs: Expr[] }
  | { t: "pow"; base: Expr; exp: number }
  | { t: "div"; n: Expr; d: Expr };

type Term = { coeff: Q; vars: Array<[string, number]> };
type Poly = Term[];

const MAX_TERMS = 64;
const MAX_EXP = 12;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1n;
}

function q(n: bigint, d = 1n): Q {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  if (d === 0n) return { n: 0n, d: 1n };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function qAdd(a: Q, b: Q): Q {
  return q(a.n * b.d + b.n * a.d, a.d * b.d);
}

function qMul(a: Q, b: Q): Q {
  return q(a.n * b.n, a.d * b.d);
}

function qNeg(a: Q): Q {
  return q(-a.n, a.d);
}

function qEq(a: Q, b: Q): boolean {
  return a.n === b.n && a.d === b.d;
}

function parseDecimal(raw: string): Q {
  const [whole, frac = ""] = raw.split(".");
  const digits = `${whole || "0"}${frac}`.replace(/^0+(?=\d)/, "") || "0";
  return q(BigInt(digits), 10n ** BigInt(frac.length));
}

type Tok =
  | { t: "num"; v: Q }
  | { t: "id"; name: string }
  | { t: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { t: "lp" }
  | { t: "rp" };

function tokenize(input: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\n" || c === "\t") {
      i += 1;
      continue;
    }
    if (c === "(" || c === "[") {
      toks.push({ t: "lp" });
      i += 1;
      continue;
    }
    if (c === ")" || c === "]") {
      toks.push({ t: "rp" });
      i += 1;
      continue;
    }
    if (c === "|") return null;
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      toks.push({ t: "op", op: c });
      i += 1;
      continue;
    }
    if (c === "." || (c >= "0" && c <= "9")) {
      const match = /^(?:\d+\.\d+|\.\d+|\d+)/.exec(input.slice(i));
      if (!match) return null;
      toks.push({ t: "num", v: parseDecimal(match[0]) });
      i += match[0].length;
      continue;
    }
    if (c >= "a" && c <= "z") {
      toks.push({ t: "id", name: c });
      i += 1;
      continue;
    }
    return null;
  }
  return toks;
}

function parseExpression(toks: Tok[]): Expr | null {
  let i = 0;
  const peek = () => toks[i];
  const parseSum = (): Expr | null => {
    let left = parseProduct();
    if (!left) return null;
    const terms: Expr[] = [left];
    while (peek()?.t === "op" && ((peek() as { op: string }).op === "+" || (peek() as { op: string }).op === "-")) {
      const op = (peek() as { op: "+" | "-" }).op;
      i += 1;
      const right = parseProduct();
      if (!right) return null;
      terms.push(op === "-" ? { t: "neg", x: right } : right);
    }
    return terms.length === 1 ? left : { t: "add", xs: terms };
  };
  const parseProduct = (): Expr | null => {
    const first = parsePow();
    if (!first) return null;
    const factors: Expr[] = [first];
    while (true) {
      const tok = peek();
      if (tok?.t === "op" && tok.op === "*") {
        i += 1;
        const right = parsePow();
        if (!right) return null;
        factors.push(right);
        continue;
      }
      if (tok?.t === "op" && tok.op === "/") {
        i += 1;
        const den = parsePow();
        if (!den) return null;
        const num = factors.pop()!;
        factors.push({ t: "div", n: num, d: den });
        continue;
      }
      if (tok?.t === "num" || tok?.t === "id" || tok?.t === "lp") {
        const right = parsePow();
        if (!right) return null;
        factors.push(right);
        continue;
      }
      break;
    }
    return factors.length === 1 ? factors[0]! : { t: "mul", xs: factors };
  };
  const parsePow = (): Expr | null => {
    const base = parseUnary();
    if (!base) return null;
    const tok = peek();
    if (tok?.t === "op" && tok.op === "^") {
      i += 1;
      const expTok = peek();
      if (expTok?.t === "num" && expTok.v.d === 1n && expTok.v.n >= 0n && expTok.v.n <= BigInt(MAX_EXP)) {
        i += 1;
        return { t: "pow", base, exp: Number(expTok.v.n) };
      }
      if (expTok?.t === "lp") {
        const inside = parseUnary();
        if (!inside || inside.t !== "num" || inside.v.d !== 1n || inside.v.n < 0n || inside.v.n > BigInt(MAX_EXP)) {
          return null;
        }
        return { t: "pow", base, exp: Number(inside.v.n) };
      }
      return null;
    }
    return base;
  };
  const parseUnary = (): Expr | null => {
    const tok = peek();
    if (tok?.t === "op" && (tok.op === "+" || tok.op === "-")) {
      i += 1;
      const inner = parseUnary();
      if (!inner) return null;
      return tok.op === "-" ? { t: "neg", x: inner } : inner;
    }
    return parsePrimary();
  };
  const parsePrimary = (): Expr | null => {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === "num") {
      i += 1;
      return { t: "num", v: tok.v };
    }
    if (tok.t === "id") {
      i += 1;
      return { t: "var", name: tok.name };
    }
    if (tok.t === "lp") {
      i += 1;
      const inner = parseSum();
      if (!inner || peek()?.t !== "rp") return null;
      i += 1;
      return inner;
    }
    return null;
  };
  const expr = parseSum();
  if (!expr || i !== toks.length) return null;
  return expr;
}

function varsKey(vars: Array<[string, number]>): string {
  return vars.map(([name, exp]) => `${name}^${exp}`).join("*");
}

function termRank(term: Term): string {
  const degree = term.vars.reduce((sum, [, exp]) => sum + exp, 0);
  return `${String(1000 - degree).padStart(4, "0")}|${varsKey(term.vars)}`;
}

function sortPoly(poly: Poly): Poly {
  return [...poly]
    .filter((term) => term.coeff.n !== 0n)
    .sort((a, b) => (termRank(a) < termRank(b) ? -1 : termRank(a) > termRank(b) ? 1 : 0));
}

function polyFrom(coeff: Q, vars: Array<[string, number]> = []): Poly {
  if (coeff.n === 0n) return [];
  return [{ coeff, vars: [...vars].sort((a, b) => (a[0] < b[0] ? -1 : 1)) }];
}

function addVars(left: Array<[string, number]>, right: Array<[string, number]>): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const [name, exp] of [...left, ...right]) map.set(name, (map.get(name) ?? 0) + exp);
  return [...map.entries()].filter(([, exp]) => exp !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function polyAdd(left: Poly, right: Poly): Poly | null {
  const map = new Map<string, Q>();
  for (const term of [...left, ...right]) {
    const key = varsKey(term.vars);
    map.set(key, qAdd(map.get(key) ?? q(0n), term.coeff));
  }
  const poly: Poly = [];
  for (const [key, coeff] of map) {
    if (coeff.n === 0n) continue;
    const vars = key
      ? key.split("*").map((part) => {
          const [name, exp] = part.split("^");
          return [name!, Number(exp)] as [string, number];
        })
      : [];
    poly.push({ coeff, vars });
  }
  if (poly.length > MAX_TERMS) return null;
  return sortPoly(poly);
}

function polyMul(left: Poly, right: Poly): Poly | null {
  let acc: Poly = [];
  for (const a of left) {
    for (const b of right) {
      const next = polyFrom(qMul(a.coeff, b.coeff), addVars(a.vars, b.vars));
      const sum = polyAdd(acc, next);
      if (!sum) return null;
      acc = sum;
    }
  }
  return acc;
}

function polyScale(poly: Poly, factor: Q): Poly | null {
  return polyMul(poly, polyFrom(factor));
}

function expandPoly(expr: Expr): Poly | null {
  switch (expr.t) {
    case "num":
      return polyFrom(expr.v);
    case "var":
      return polyFrom(q(1n), [[expr.name, 1]]);
    case "neg": {
      const inner = expandPoly(expr.x);
      return inner ? polyScale(inner, q(-1n)) : null;
    }
    case "add": {
      let acc: Poly = [];
      for (const part of expr.xs) {
        const next = expandPoly(part);
        if (!next) return null;
        const sum = polyAdd(acc, next);
        if (!sum) return null;
        acc = sum;
      }
      return acc;
    }
    case "mul": {
      let acc = polyFrom(q(1n));
      for (const part of expr.xs) {
        const next = expandPoly(part);
        if (!next || !acc) return null;
        const product = polyMul(acc, next);
        if (!product) return null;
        acc = product;
      }
      return acc;
    }
    case "pow": {
      let acc = polyFrom(q(1n));
      const base = expandPoly(expr.base);
      if (!base) return null;
      for (let n = 0; n < expr.exp; n += 1) {
        const product = polyMul(acc, base);
        if (!product) return null;
        acc = product;
      }
      return acc;
    }
    case "div": {
      const numerator = expandPoly(expr.n);
      const denominator = expandPoly(expr.d);
      if (!numerator || !denominator || denominator.length !== 1 || denominator[0]!.vars.length > 0) {
        return null;
      }
      if (denominator[0]!.coeff.n === 0n) return null;
      return polyScale(numerator, q(denominator[0]!.coeff.d, denominator[0]!.coeff.n));
    }
    default:
      return null;
  }
}

function polyKey(poly: Poly): string {
  const sorted = sortPoly(poly);
  if (sorted.length === 0) return "0";
  return sorted
    .map((term) => {
      const coeff = `${term.coeff.n}/${term.coeff.d}`;
      const vars = varsKey(term.vars);
      return vars ? `${coeff}*${vars}` : coeff;
    })
    .join("+");
}

function isConstant(poly: Poly): boolean {
  return poly.length === 0 || (poly.length === 1 && poly[0]!.vars.length === 0);
}

type Signature = { monomial: string; sums: string };

function factorSignature(expr: Expr): { factored: boolean; signature: Signature } | null {
  const flat = flattenFactors(expr);
  if (!flat) return null;
  let monomial = polyFrom(flat.sign);
  const sums: string[] = [];
  let pieces = 0;
  for (const factor of flat.factors) {
    const poly = expandPoly(factor);
    if (!poly || !monomial) return null;
    pieces += 1;
    if (isMonomialPoly(poly)) {
      const nextMonomial = polyMul(monomial, poly);
      if (!nextMonomial) return null;
      monomial = nextMonomial;
    } else {
      const normalized = normalizeSignedPoly(poly);
      const scaled = polyScale(monomial, normalized.sign);
      if (!scaled) return null;
      monomial = scaled;
      sums.push(polyKey(normalized.poly));
    }
  }
  sums.sort();
  const monomialKey = polyKey(monomial);
  const unitMonomial = monomialKey === "1/1" || monomialKey === "-1/1";
  return {
    // A product that still has a binomial (or a pulled-out coefficient)
    // is factored. A single expanded sum is not.
    factored: sums.length >= 1 && (pieces >= 2 || !unitMonomial),
    signature: { monomial: monomialKey, sums: sums.join("|") },
  };
}

function isMonomialPoly(poly: Poly): boolean {
  return sortPoly(poly).length <= 1;
}

function normalizeSignedPoly(poly: Poly): { sign: Q; poly: Poly } {
  const sorted = sortPoly(poly);
  if (sorted.length === 0) return { sign: q(1n), poly: [] };
  if (sorted[0]!.coeff.n < 0n) {
    return { sign: q(-1n), poly: sortPoly(polyScale(sorted, q(-1n)) ?? []) };
  }
  return { sign: q(1n), poly: sorted };
}

function flattenFactors(expr: Expr): { sign: Q; factors: Expr[] } | null {
  if (expr.t === "neg") {
    const inner = flattenFactors(expr.x);
    if (!inner) return null;
    return { sign: qNeg(inner.sign), factors: inner.factors };
  }
  if (expr.t === "mul") {
    let sign = q(1n);
    const factors: Expr[] = [];
    for (const part of expr.xs) {
      const inner = flattenFactors(part);
      if (!inner) return null;
      sign = qMul(sign, inner.sign);
      factors.push(...inner.factors);
    }
    return { sign, factors };
  }
  if (expr.t === "div") {
    const denominator = expandPoly(expr.d);
    if (!denominator || !isConstant(denominator) || denominator.length === 0 || denominator[0]!.coeff.n === 0n) {
      return null;
    }
    const inner = flattenFactors(expr.n);
    if (!inner) return null;
    return {
      sign: qMul(inner.sign, q(denominator[0]!.coeff.d, denominator[0]!.coeff.n)),
      factors: inner.factors,
    };
  }
  if (expr.t === "num") return { sign: expr.v, factors: [] };
  return { sign: q(1n), factors: [expr] };
}

function parseAnswerExpression(value: string): Expr | null {
  const toks = tokenize(value);
  if (!toks) return null;
  return parseExpression(toks);
}

export function answersAlgebraicallyMatch(studentAnswer: string, correctForm: string): boolean {
  const key = correctForm.trim();
  if (!key || /^[a-d]$/i.test(key)) return false;
  const student = parseAnswerExpression(studentAnswer);
  const expected = parseAnswerExpression(key);
  if (!student || !expected) return false;
  const studentPoly = expandPoly(student);
  const expectedPoly = expandPoly(expected);
  if (!studentPoly || !expectedPoly) return false;
  if (polyKey(studentPoly) !== polyKey(expectedPoly)) return false;
  const expectedFactors = factorSignature(expected);
  if (!expectedFactors?.factored) return true;
  const studentFactors = factorSignature(student);
  if (!studentFactors?.factored) return false;
  return (
    studentFactors.signature.monomial === expectedFactors.signature.monomial &&
    studentFactors.signature.sums === expectedFactors.signature.sums
  );
}
