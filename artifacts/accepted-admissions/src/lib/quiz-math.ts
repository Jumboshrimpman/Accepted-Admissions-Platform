/**
 * Display formatting for authored follow-up math.
 * Source text stays as x^2 and slash fractions. This only describes how to
 * draw it: superscripts, minus signs, stacked fractions, and radicals.
 */

export const FREE_RESPONSE_FORMAT_HINT = "Type exponents as x^2.";

const FORMATTED_QUIZ_TITLES = new Set(["Factoring Quiz", "SAT Math Problems"]);

export function quizShowsFormattedMath(title?: string | null): boolean {
  return FORMATTED_QUIZ_TITLES.has((title ?? "").trim());
}

export type MathExpr =
  | { type: "num"; text: string }
  | { type: "var"; name: string }
  | { type: "pi" }
  | { type: "neg"; expr: MathExpr }
  | { type: "add"; terms: MathExpr[] }
  | { type: "mul"; factors: Array<{ expr: MathExpr; explicit: boolean }> }
  | { type: "div"; num: MathExpr; den: MathExpr }
  | { type: "pow"; base: MathExpr; exp: MathExpr }
  | { type: "abs"; expr: MathExpr }
  | { type: "sqrt"; expr: MathExpr }
  | { type: "group"; bracket: "(" | "["; items: MathExpr[] }
  | { type: "eq"; left: MathExpr; right: MathExpr };

export type MathSegment = { type: "text"; text: string } | { type: "math"; expr: MathExpr };

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

function isLetter(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z]/.test(char));
}

function letterRun(src: string, index: number): string {
  let end = index;
  while (isLetter(src[end])) end += 1;
  return src.slice(index, end);
}

const SHORT_WORDS = new Set([
  "am",
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "he",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "no",
  "of",
  "ok",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "vs",
  "we",
]);

function isWordRun(run: string, next: string | undefined): boolean {
  if (run === "sqrt" && next === "(") return false;
  if (/^pi$/i.test(run)) return false;
  if (run.length >= 3) return true;
  if (run.length === 2 && /[A-Z]/.test(run)) return true;
  return SHORT_WORDS.has(run.toLowerCase());
}

class Parser {
  private src: string;
  private i: number;

  constructor(src: string, i: number) {
    this.src = src;
    this.i = i;
  }

  get pos(): number {
    return this.i;
  }

  parseEquation(): MathExpr | null {
    const left = this.parseSum();
    if (!left) return null;
    let expr = left;
    while (this.startsWith("=")) {
      const mark = this.i;
      this.i += 1;
      const right = this.parseSum();
      if (!right) {
        this.i = mark;
        break;
      }
      expr = { type: "eq", left: expr, right };
    }
    return expr;
  }

  private parseSum(): MathExpr | null {
    const first = this.parseProduct();
    if (!first) return null;
    const terms: MathExpr[] = [first];
    while (true) {
      const mark = this.i;
      this.skipSpace();
      const op = this.src[this.i];
      if (!op || !"+-−–—".includes(op)) {
        this.i = mark;
        break;
      }
      this.i += 1;
      const right = this.parseProduct();
      if (!right) {
        this.i = mark;
        break;
      }
      terms.push(op === "+" ? right : { type: "neg", expr: right });
    }
    return terms.length === 1 ? first : { type: "add", terms };
  }

  private parseProduct(): MathExpr | null {
    const first = this.parseUnary();
    if (!first) return null;
    const factors: Array<{ expr: MathExpr; explicit: boolean }> = [{ expr: first, explicit: false }];
    while (true) {
      const mark = this.i;
      this.skipSpace();
      if (this.src[this.i] === "*" && this.src[this.i + 1] !== "*") {
        const mark = this.i;
        this.i += 1;
        const right = this.parseUnary();
        if (!right) {
          this.i = mark;
          break;
        }
        factors.push({ expr: right, explicit: true });
        continue;
      }
      if (this.src[this.i] === "/") {
        const mark = this.i;
        this.i += 1;
        const den = this.parseUnary();
        if (!den) {
          this.i = mark;
          break;
        }
        const num: MathExpr =
          factors.length === 1 ? factors[0]!.expr : { type: "mul", factors: factors.slice() };
        factors.splice(0, factors.length, { expr: { type: "div", num, den }, explicit: false });
        continue;
      }
      if (this.primaryAhead()) {
        const mark = this.i;
        const right = this.parseUnary();
        if (!right || this.i === mark) break;
        factors.push({ expr: right, explicit: false });
        continue;
      }
      this.i = mark;
      break;
    }
    return factors.length === 1 ? factors[0]!.expr : { type: "mul", factors };
  }

  private parseUnary(): MathExpr | null {
    this.skipSpace();
    const char = this.src[this.i];
    if (char === "+") {
      this.i += 1;
      return this.parseUnary();
    }
    if (char === "-" || char === "−" || char === "–" || char === "—") {
      this.i += 1;
      const inner = this.parseUnary();
      return inner ? { type: "neg", expr: inner } : null;
    }
    return this.parsePow();
  }

  private parsePow(): MathExpr | null {
    const base = this.parsePrimary();
    if (!base) return null;
    const mark = this.i;
    this.skipSpace();
    if (this.src[this.i] === "^" || (this.src[this.i] === "*" && this.src[this.i + 1] === "*")) {
      const mark = this.i;
      this.i += this.src[this.i] === "^" ? 1 : 2;
      const exp = this.parseUnary();
      if (!exp) {
        this.i = mark;
        return base;
      }
      return { type: "pow", base, exp };
    }
    const sup = SUPERSCRIPTS[this.src[this.i] ?? ""];
    if (sup) {
      let digits = "";
      while (SUPERSCRIPTS[this.src[this.i] ?? ""]) {
        digits += SUPERSCRIPTS[this.src[this.i]!]!;
        this.i += 1;
      }
      return { type: "pow", base, exp: { type: "num", text: digits } };
    }
    this.i = mark;
    return base;
  }

  private parsePrimary(): MathExpr | null {
    this.skipSpace();
    const char = this.src[this.i];
    if (!char) return null;
    if (char === "π" || char === "Π") {
      this.i += 1;
      return { type: "pi" };
    }
    if (char === "√") {
      this.i += 1;
      const inner = this.src[this.skipSpaceIndex()] === "(" ? this.parsePrimary() : this.parseUnary();
      return inner ? { type: "sqrt", expr: inner } : null;
    }
    if (char === "|") {
      const mark = this.i;
      this.i += 1;
      const inner = this.parseEquation();
      this.skipSpace();
      if (!inner || this.src[this.i] !== "|") {
        this.i = mark;
        return null;
      }
      this.i += 1;
      return { type: "abs", expr: inner };
    }
    if (char === "(" || char === "[") return this.parseGroup(char === "(" ? "(" : "[");
    if (char === "." || (char >= "0" && char <= "9")) {
      const match = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|^\.\d+/.exec(this.src.slice(this.i));
      if (!match) return null;
      this.i += match[0].length;
      return { type: "num", text: match[0] };
    }
    if (isLetter(char)) {
      const run = letterRun(this.src, this.i);
      const next = this.src[this.i + run.length];
      if (run === "sqrt" && next === "(") {
        this.i += 4;
        const inner = this.parsePrimary();
        return inner ? { type: "sqrt", expr: inner } : null;
      }
      if (/^pi$/i.test(run)) {
        this.i += run.length;
        return { type: "pi" };
      }
      if (isWordRun(run, next)) return null;
      this.i += 1;
      return { type: "var", name: char };
    }
    return null;
  }

  private parseGroup(bracket: "(" | "["): MathExpr | null {
    const mark = this.i;
    this.i += 1;
    const first = this.parseEquation();
    if (!first) {
      this.i = mark;
      return null;
    }
    const items = [first];
    while (this.startsWith(",")) {
      this.i += 1;
      const next = this.parseEquation();
      if (!next) {
        this.i = mark;
        return null;
      }
      items.push(next);
    }
    this.skipSpace();
    const close = bracket === "(" ? ")" : "]";
    if (this.src[this.i] !== close) {
      this.i = mark;
      return null;
    }
    this.i += 1;
    return { type: "group", bracket, items };
  }

  private primaryAhead(): boolean {
    const index = this.skipSpaceIndex();
    const char = this.src[index];
    if (!char) return false;
    if ("([|πΠ√".includes(char) || char === "." || (char >= "0" && char <= "9")) return true;
    if (!isLetter(char)) return false;
    const run = letterRun(this.src, index);
    return !isWordRun(run, this.src[index + run.length]);
  }

  private startsWith(value: string): boolean {
    const index = this.skipSpaceIndex();
    if (!this.src.startsWith(value, index)) return false;
    this.i = index;
    return true;
  }

  private skipSpace(): void {
    while (this.src[this.i] === " ") this.i += 1;
  }

  private skipSpaceIndex(): number {
    let index = this.i;
    while (this.src[index] === " ") index += 1;
    return index;
  }
}

function hasMathSignal(slice: string): boolean {
  return /[\^*/=|πΠ√]/.test(slice) || /[+\-−–—]/.test(slice) || /sqrt\s*\(/i.test(slice) || /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(slice);
}

function canStart(src: string, index: number): boolean {
  return index === 0 || !isLetter(src[index - 1]);
}

export function segmentQuizMath(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let textStart = 0;
  let index = 0;
  const flush = (end: number) => {
    if (end > textStart) segments.push({ type: "text", text: input.slice(textStart, end) });
  };
  while (index < input.length) {
    const char = input[index]!;
    const startable = /[0-9A-Za-zπΠ√([|+\-−–—.]/.test(char);
    if (!canStart(input, index) || !startable) {
      index += 1;
      continue;
    }
    const parser = new Parser(input, index);
    const expr = parser.parseEquation();
    if (!expr || parser.pos <= index) {
      index += 1;
      continue;
    }
    const slice = input.slice(index, parser.pos);
    if (!hasMathSignal(slice)) {
      index += 1;
      continue;
    }
    flush(index);
    segments.push({ type: "math", expr });
    textStart = parser.pos;
    index = parser.pos;
  }
  flush(input.length);
  return segments;
}

function sqrtInnerPlain(expr: MathExpr): string {
  if (expr.type === "group" && expr.bracket === "(" && expr.items.length === 1) {
    return exprPlain(expr.items[0]!);
  }
  return exprPlain(expr);
}

function exprPlain(expr: MathExpr): string {
  switch (expr.type) {
    case "num":
      return expr.text;
    case "var":
      return expr.name;
    case "pi":
      return "π";
    case "neg":
      return `−${exprPlain(expr.expr)}`;
    case "add":
      return expr.terms
        .map((term, index) => {
          const text = exprPlain(term);
          if (index === 0) return text;
          return text.startsWith("−") ? ` − ${text.slice(1)}` : ` + ${text}`;
        })
        .join("");
    case "mul":
      return expr.factors
        .map((factor, index) => {
          const text = exprPlain(factor.expr);
          if (index === 0) return text;
          return factor.explicit ? `·${text}` : text;
        })
        .join("");
    case "div":
      return `\\frac{${exprPlain(expr.num)}}{${exprPlain(expr.den)}}`;
    case "pow":
      return `${exprPlain(expr.base)}^{${exprPlain(expr.exp)}}`;
    case "abs":
      return `|${exprPlain(expr.expr)}|`;
    case "sqrt":
      return `√(${sqrtInnerPlain(expr.expr)})`;
    case "group": {
      const open = expr.bracket;
      const close = expr.bracket === "(" ? ")" : "]";
      return `${open}${expr.items.map(exprPlain).join(", ")}${close}`;
    }
    case "eq":
      return `${exprPlain(expr.left)} = ${exprPlain(expr.right)}`;
    default:
      return "";
  }
}

/** Stable text form used by rendering tests. Fractions use \\frac, exponents use ^{ }. */
export function quizMathPlain(input: string): string {
  return segmentQuizMath(input)
    .map((segment) => (segment.type === "text" ? segment.text : exprPlain(segment.expr)))
    .join("");
}
