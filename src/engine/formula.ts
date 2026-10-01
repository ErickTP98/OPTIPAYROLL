/**
 * Evaluador seguro de fórmulas para las reglas de cálculo (sin usar eval).
 *
 * Soporta números, variables (BASE, TASA, MES, ... y códigos de conceptos/reglas),
 * operadores + - * / ^ %, comparaciones (< <= > >= = == != <>), paréntesis y las
 * funciones MIN, MAX, ROUND, ABS, IF, FLOOR, CEIL. Los nombres no distinguen mayúsculas.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; e: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "call"; name: string; args: Node[] };

interface Token {
  kind: "num" | "id" | "op" | "(" | ")" | ",";
  value: string;
  pos: number;
}

export class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|^[0-9]+\.?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Número no válido en la posición ${i + 1}`);
      tokens.push({ kind: "num", value: m[0], pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_À-ſ]/.test(c)) {
      const m = /^[A-Za-z_À-ſ][A-Za-z0-9_À-ſ]*/.exec(src.slice(i))!;
      tokens.push({ kind: "id", value: m[0].toUpperCase(), pos: i });
      i += m[0].length;
    } else if (c === "(" || c === ")" || c === ",") {
      tokens.push({ kind: c, value: c, pos: i });
      i++;
    } else {
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "==", "!=", "<>"].includes(two)) {
        tokens.push({ kind: "op", value: two, pos: i });
        i += 2;
      } else if ("+-*/^%<>=".includes(c)) {
        tokens.push({ kind: "op", value: c, pos: i });
        i++;
      } else {
        throw new FormulaError(`Carácter no válido "${c}" en la posición ${i + 1}`);
      }
    }
  }
  return tokens;
}

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  MIN: { min: 1, max: Infinity },
  MAX: { min: 1, max: Infinity },
  ROUND: { min: 1, max: 2 },
  ABS: { min: 1, max: 1 },
  FLOOR: { min: 1, max: 1 },
  CEIL: { min: 1, max: 1 },
  IF: { min: 3, max: 3 },
  SI: { min: 3, max: 3 },
};

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new FormulaError("La fórmula está vacía");
    const node = this.comparison();
    if (this.i < this.tokens.length) {
      throw new FormulaError(`Símbolo inesperado "${this.tokens[this.i].value}"`);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return !!t && t.kind === "op" && ops.includes(t.value);
  }

  private comparison(): Node {
    let left = this.additive();
    while (this.isOp("<", "<=", ">", ">=", "=", "==", "!=", "<>")) {
      const op = this.tokens[this.i++].value;
      left = { t: "bin", op, l: left, r: this.additive() };
    }
    return left;
  }

  private additive(): Node {
    let left = this.term();
    while (this.isOp("+", "-")) {
      const op = this.tokens[this.i++].value;
      left = { t: "bin", op, l: left, r: this.term() };
    }
    return left;
  }

  private term(): Node {
    let left = this.unary();
    while (this.isOp("*", "/")) {
      const op = this.tokens[this.i++].value;
      left = { t: "bin", op, l: left, r: this.unary() };
    }
    return left;
  }

  private unary(): Node {
    if (this.isOp("-")) {
      this.i++;
      return { t: "neg", e: this.unary() };
    }
    if (this.isOp("+")) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.i++;
      return { t: "bin", op: "^", l: base, r: this.unary() };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.isOp("%")) {
      this.i++;
      node = { t: "bin", op: "/", l: node, r: { t: "num", v: 100 } };
    }
    return node;
  }

  private primary(): Node {
    const t = this.peek();
    if (!t) throw new FormulaError("La fórmula termina de forma inesperada");
    if (t.kind === "num") {
      this.i++;
      const v = Number(t.value);
      if (!Number.isFinite(v)) throw new FormulaError(`Número no válido "${t.value}"`);
      return { t: "num", v };
    }
    if (t.kind === "(") {
      this.i++;
      const e = this.comparison();
      this.expect(")");
      return e;
    }
    if (t.kind === "id") {
      this.i++;
      if (this.peek()?.kind === "(") {
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new FormulaError(`Función desconocida "${t.value}"`);
        this.i++;
        const args: Node[] = [];
        if (this.peek()?.kind !== ")") {
          args.push(this.comparison());
          while (this.peek()?.kind === ",") {
            this.i++;
            args.push(this.comparison());
          }
        }
        this.expect(")");
        if (args.length < fn.min || args.length > fn.max) {
          throw new FormulaError(`Cantidad de argumentos incorrecta para ${t.value}`);
        }
        return { t: "call", name: t.value, args };
      }
      return { t: "var", name: t.value };
    }
    throw new FormulaError(`Símbolo inesperado "${t.value}"`);
  }

  private expect(kind: Token["kind"]) {
    const t = this.peek();
    if (!t || t.kind !== kind) throw new FormulaError(`Se esperaba "${kind}"`);
    this.i++;
  }
}

export interface CompiledFormula {
  variables: string[];
  evaluate(vars: Record<string, number>): number;
}

function collectVars(node: Node, out: Set<string>) {
  switch (node.t) {
    case "var":
      out.add(node.name);
      break;
    case "neg":
      collectVars(node.e, out);
      break;
    case "bin":
      collectVars(node.l, out);
      collectVars(node.r, out);
      break;
    case "call":
      node.args.forEach((a) => collectVars(a, out));
      break;
  }
}

function evalNode(node: Node, vars: Record<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var": {
      const v = vars[node.name];
      if (v === undefined) throw new FormulaError(`Variable desconocida "${node.name}"`);
      return v;
    }
    case "neg":
      return -evalNode(node.e, vars);
    case "bin": {
      const l = evalNode(node.l, vars);
      const r = evalNode(node.r, vars);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "^": return Math.pow(l, r);
        case "<": return l < r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case ">": return l > r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "=":
        case "==": return l === r ? 1 : 0;
        case "!=":
        case "<>": return l !== r ? 1 : 0;
      }
      throw new FormulaError(`Operador desconocido ${node.op}`);
    }
    case "call": {
      const name = node.name;
      if (name === "IF" || name === "SI") {
        return evalNode(node.args[0], vars) !== 0
          ? evalNode(node.args[1], vars)
          : evalNode(node.args[2], vars);
      }
      const a = node.args.map((x) => evalNode(x, vars));
      switch (name) {
        case "MIN": return Math.min(...a);
        case "MAX": return Math.max(...a);
        case "ABS": return Math.abs(a[0]);
        case "FLOOR": return Math.floor(a[0]);
        case "CEIL": return Math.ceil(a[0]);
        case "ROUND": {
          const f = Math.pow(10, a[1] ?? 0);
          return Math.round(a[0] * f) / f;
        }
      }
      throw new FormulaError(`Función desconocida ${name}`);
    }
  }
}

export function compileFormula(src: string): CompiledFormula {
  const ast = new Parser(tokenize(src)).parse();
  const vars = new Set<string>();
  collectVars(ast, vars);
  return {
    variables: [...vars],
    evaluate: (v) => evalNode(ast, v),
  };
}
