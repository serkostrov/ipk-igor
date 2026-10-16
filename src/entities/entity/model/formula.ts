import {
  addCalendarDays,
  businessDaysBetween,
  extractIsoDate,
  parseIsoDate,
} from "@/shared/lib/business-days";

/** Values flowing through formula evaluation. Dates are `YYYY-MM-DD` strings. */
export type FormulaValue = number | string | boolean | null;

type FormulaNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "ref"; fieldId: string }
  | { type: "unary"; op: "-" | "+" | "NOT"; arg: FormulaNode }
  | { type: "binary"; op: string; left: FormulaNode; right: FormulaNode }
  | { type: "call"; name: string; args: FormulaNode[] };

export type FormulaParseResult =
  { ok: true; ast: FormulaNode; refs: string[] } | { ok: false; error: string };

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ref"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "eof" };

/** Supported functions with Russian aliases (shown in the editor cheat sheet). */
export const FORMULA_FUNCTIONS: Array<{
  name: string;
  alias: string;
  signature: string;
  description: string;
}> = [
  {
    name: "IF",
    alias: "ЕСЛИ",
    signature: "IF(условие; да; нет)",
    description: "Значение по условию",
  },
  {
    name: "MIN",
    alias: "МИН",
    signature: "MIN(a; b; …)",
    description: "Наименьшее число",
  },
  {
    name: "MAX",
    alias: "МАКС",
    signature: "MAX(a; b; …)",
    description: "Наибольшее число",
  },
  {
    name: "ROUND",
    alias: "ОКРУГЛ",
    signature: "ROUND(x; знаков)",
    description: "Округление",
  },
  { name: "ABS", alias: "МОДУЛЬ", signature: "ABS(x)", description: "Модуль" },
  {
    name: "COALESCE",
    alias: "ПЕРВОЕ",
    signature: "COALESCE(a; b; …)",
    description: "Первое непустое значение",
  },
  {
    name: "WORKDAYS",
    alias: "РАБДНИ",
    signature: "WORKDAYS(начало; конец)",
    description: "Рабочих дней между датами (включительно)",
  },
  {
    name: "DAYS",
    alias: "ДНИ",
    signature: "DAYS(начало; конец)",
    description: "Календарных дней от начала до конца",
  },
  {
    name: "TODAY",
    alias: "СЕГОДНЯ",
    signature: "TODAY()",
    description: "Сегодняшняя дата",
  },
];

const FUNCTION_ALIASES = new Map<string, string>(
  FORMULA_FUNCTIONS.flatMap((item) => [
    [item.name, item.name],
    [item.alias, item.name],
  ]),
);

const KEYWORDS = new Map<string, string>([
  ["AND", "AND"],
  ["И", "AND"],
  ["OR", "OR"],
  ["ИЛИ", "OR"],
  ["NOT", "NOT"],
  ["НЕ", "NOT"],
  ["TRUE", "TRUE"],
  ["ИСТИНА", "TRUE"],
  ["FALSE", "FALSE"],
  ["ЛОЖЬ", "FALSE"],
]);

class FormulaSyntaxError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (source.startsWith("{{", index)) {
      const end = source.indexOf("}}", index + 2);
      if (end < 0) throw new FormulaSyntaxError("Не закрыта ссылка на поле");
      tokens.push({ kind: "ref", value: source.slice(index + 2, end).trim() });
      index = end + 2;
      continue;
    }
    if (/\d/.test(char)) {
      const match = /^\d+(?:[.,]\d+)?/.exec(source.slice(index))!;
      tokens.push({
        kind: "number",
        value: Number(match[0].replace(",", ".")),
      });
      index += match[0].length;
      continue;
    }
    if (char === '"') {
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\" && index + 1 < source.length) index += 1;
        value += source[index];
        index += 1;
      }
      if (source[index] !== '"') {
        throw new FormulaSyntaxError("Не закрыта строка в кавычках");
      }
      index += 1;
      tokens.push({ kind: "string", value });
      continue;
    }
    if (/[A-Za-zА-Яа-яЁё_]/.test(char)) {
      const match = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/.exec(
        source.slice(index),
      )!;
      tokens.push({ kind: "ident", value: match[0].toUpperCase() });
      index += match[0].length;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (two === ">=" || two === "<=" || two === "!=" || two === "<>") {
      tokens.push({ kind: "op", value: two === "<>" ? "!=" : two });
      index += 2;
      continue;
    }
    if ("+-*/(),;=<>".includes(char)) {
      tokens.push({ kind: "op", value: char === ";" ? "," : char });
      index += 1;
      continue;
    }
    throw new FormulaSyntaxError(`Неожиданный символ «${char}»`);
  }
  tokens.push({ kind: "eof" });
  return tokens;
}

class Parser {
  private position = 0;
  readonly refs = new Set<string>();
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    const token = this.tokens[this.position]!;
    this.position += 1;
    return token;
  }

  private isOp(value: string) {
    const token = this.peek();
    return token.kind === "op" && token.value === value;
  }

  private isKeyword(value: string) {
    const token = this.peek();
    return token.kind === "ident" && KEYWORDS.get(token.value) === value;
  }

  private expectOp(value: string) {
    if (!this.isOp(value)) {
      throw new FormulaSyntaxError(
        `Ожидается «${value === "," ? ";" : value}»`,
      );
    }
    this.next();
  }

  parse(): FormulaNode {
    const node = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw new FormulaSyntaxError("Лишние символы в конце формулы");
    }
    return node;
  }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.isKeyword("OR")) {
      this.next();
      left = { type: "binary", op: "OR", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): FormulaNode {
    let left = this.parseNot();
    while (this.isKeyword("AND")) {
      this.next();
      left = { type: "binary", op: "AND", left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): FormulaNode {
    if (this.isKeyword("NOT")) {
      this.next();
      return { type: "unary", op: "NOT", arg: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): FormulaNode {
    const left = this.parseAdditive();
    const token = this.peek();
    if (
      token.kind === "op" &&
      ["=", "!=", ">", "<", ">=", "<="].includes(token.value)
    ) {
      this.next();
      return {
        type: "binary",
        op: token.value,
        left,
        right: this.parseAdditive(),
      };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.next() as { value: string }).value;
      left = { type: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = (this.next() as { value: string }).value;
      left = { type: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): FormulaNode {
    if (this.isOp("-") || this.isOp("+")) {
      const op = (this.next() as { value: string }).value as "-" | "+";
      return { type: "unary", op, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const token = this.next();
    if (token.kind === "number") return { type: "number", value: token.value };
    if (token.kind === "string") return { type: "string", value: token.value };
    if (token.kind === "ref") {
      if (!token.value) throw new FormulaSyntaxError("Пустая ссылка на поле");
      this.refs.add(token.value);
      return { type: "ref", fieldId: token.value };
    }
    if (token.kind === "op" && token.value === "(") {
      const node = this.parseOr();
      this.expectOp(")");
      return node;
    }
    if (token.kind === "ident") {
      const keyword = KEYWORDS.get(token.value);
      if (keyword === "TRUE") return { type: "boolean", value: true };
      if (keyword === "FALSE") return { type: "boolean", value: false };
      const name = FUNCTION_ALIASES.get(token.value);
      if (!name) {
        throw new FormulaSyntaxError(`Неизвестная функция «${token.value}»`);
      }
      this.expectOp("(");
      const args: FormulaNode[] = [];
      if (!this.isOp(")")) {
        args.push(this.parseOr());
        while (this.isOp(",")) {
          this.next();
          args.push(this.parseOr());
        }
      }
      this.expectOp(")");
      return { type: "call", name, args };
    }
    if (token.kind === "eof") {
      throw new FormulaSyntaxError("Формула оборвалась");
    }
    throw new FormulaSyntaxError("Ошибка в формуле");
  }
}

const parseCache = new Map<string, FormulaParseResult>();

export function parseFormula(expression: string): FormulaParseResult {
  const cached = parseCache.get(expression);
  if (cached) return cached;
  let result: FormulaParseResult;
  try {
    if (!expression.trim()) {
      result = { ok: false, error: "Формула пуста" };
    } else {
      const parser = new Parser(tokenize(expression));
      const ast = parser.parse();
      result = { ok: true, ast, refs: [...parser.refs] };
    }
  } catch (error: unknown) {
    result = {
      ok: false,
      error:
        error instanceof FormulaSyntaxError
          ? error.message
          : "Ошибка в формуле",
    };
  }
  parseCache.set(expression, result);
  return result;
}

function toNumber(value: FormulaValue): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isTruthy(value: FormulaValue): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  return value.trim().length > 0;
}

function isEmptyValue(value: FormulaValue) {
  return value == null || (typeof value === "string" && !value.trim());
}

function compare(op: string, left: FormulaValue, right: FormulaValue) {
  const bothNumeric =
    (typeof left === "number" || typeof left === "boolean" || left == null) &&
    (typeof right === "number" || typeof right === "boolean" || right == null);
  let diff: number;
  if (bothNumeric) {
    diff = toNumber(left) - toNumber(right);
  } else {
    const a = String(left ?? "")
      .trim()
      .toLocaleLowerCase("ru");
    const b = String(right ?? "")
      .trim()
      .toLocaleLowerCase("ru");
    diff = a === b ? 0 : a < b ? -1 : 1;
  }
  switch (op) {
    case "=":
      return diff === 0;
    case "!=":
      return diff !== 0;
    case ">":
      return diff > 0;
    case "<":
      return diff < 0;
    case ">=":
      return diff >= 0;
    default:
      return diff <= 0;
  }
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function callFunction(
  name: string,
  args: FormulaValue[],
  today: string,
): FormulaValue {
  switch (name) {
    case "IF":
      return isTruthy(args[0] ?? null) ? (args[1] ?? null) : (args[2] ?? null);
    case "MIN":
    case "MAX": {
      const numbers = args
        .filter((value) => !isEmptyValue(value))
        .map(toNumber)
        .filter((value) => Number.isFinite(value));
      if (numbers.length === 0) return null;
      return name === "MIN" ? Math.min(...numbers) : Math.max(...numbers);
    }
    case "ROUND": {
      const digits = Math.max(
        0,
        Math.min(6, Math.round(toNumber(args[1] ?? 0))),
      );
      const factor = 10 ** digits;
      return finiteOrNull(
        Math.round((toNumber(args[0] ?? null) + Number.EPSILON) * factor) /
          factor,
      );
    }
    case "ABS":
      return finiteOrNull(Math.abs(toNumber(args[0] ?? null)));
    case "COALESCE":
      return args.find((value) => !isEmptyValue(value)) ?? null;
    case "WORKDAYS": {
      const start = extractIsoDate(String(args[0] ?? ""));
      const end = extractIsoDate(String(args[1] ?? ""));
      if (!start || !end) return null;
      return businessDaysBetween(start, end);
    }
    case "DAYS": {
      const start = parseIsoDate(String(args[0] ?? ""));
      const end = parseIsoDate(String(args[1] ?? ""));
      if (!start || !end) return null;
      return Math.round((end.getTime() - start.getTime()) / 86_400_000);
    }
    case "TODAY":
      return today;
    default:
      return null;
  }
}

function evaluateNode(
  node: FormulaNode,
  resolve: (fieldId: string) => FormulaValue,
  today: string,
): FormulaValue {
  switch (node.type) {
    case "number":
    case "string":
    case "boolean":
      return node.value;
    case "ref":
      return resolve(node.fieldId);
    case "unary": {
      const value = evaluateNode(node.arg, resolve, today);
      if (node.op === "NOT") return !isTruthy(value);
      const numeric = toNumber(value);
      return finiteOrNull(node.op === "-" ? -numeric : numeric);
    }
    case "binary": {
      if (node.op === "AND") {
        return (
          isTruthy(evaluateNode(node.left, resolve, today)) &&
          isTruthy(evaluateNode(node.right, resolve, today))
        );
      }
      if (node.op === "OR") {
        return (
          isTruthy(evaluateNode(node.left, resolve, today)) ||
          isTruthy(evaluateNode(node.right, resolve, today))
        );
      }
      const left = evaluateNode(node.left, resolve, today);
      const right = evaluateNode(node.right, resolve, today);
      if (["=", "!=", ">", "<", ">=", "<="].includes(node.op)) {
        return compare(node.op, left, right);
      }
      const a = toNumber(left);
      const b = toNumber(right);
      if (node.op === "+") {
        const leftDate = typeof left === "string" ? extractIsoDate(left) : null;
        if (leftDate && typeof right === "number") {
          return addCalendarDays(leftDate, right);
        }
        return finiteOrNull(a + b);
      }
      if (node.op === "-") return finiteOrNull(a - b);
      if (node.op === "*") return finiteOrNull(a * b);
      if (b === 0) return null;
      return finiteOrNull(a / b);
    }
    case "call":
      return callFunction(
        node.name,
        node.args.map((arg) => evaluateNode(arg, resolve, today)),
        today,
      );
  }
}

export function evaluateFormula(
  expression: string,
  resolve: (fieldId: string) => FormulaValue,
  today: string,
): FormulaValue {
  const parsed = parseFormula(expression);
  if (!parsed.ok) return null;
  return evaluateNode(parsed.ast, resolve, today);
}

/** `{{fieldId}}` → `[Название поля]` for editing. */
export function formulaToDisplay(
  expression: string,
  getFieldName: (fieldId: string) => string | null,
): string {
  return expression.replace(/\{\{([^}]+)\}\}/g, (match, id: string) => {
    const name = getFieldName(id.trim());
    return name ? `[${name}]` : match;
  });
}

/** `[Название поля]` → `{{fieldId}}` (names are case-insensitive). */
export function formulaFromDisplay(
  text: string,
  fields: ReadonlyArray<{ id: string; name: string }>,
): { ok: true; expression: string } | { ok: false; error: string } {
  const byName = new Map(
    fields.map((field) => [
      field.name.trim().toLocaleLowerCase("ru"),
      field.id,
    ]),
  );
  let missing: string | null = null;
  const expression = text.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const id = byName.get(name.trim().toLocaleLowerCase("ru"));
    if (!id) {
      missing ??= name.trim();
      return `{{${name.trim()}}}`;
    }
    return `{{${id}}}`;
  });
  if (missing) return { ok: false, error: `Поле «${missing}» не найдено` };
  return { ok: true, expression };
}

/** Editor text → stored expression, with field and syntax checks. */
export function compileFormulaText(
  text: string,
  fields: ReadonlyArray<{ id: string; name: string }>,
): { ok: true; expression: string } | { ok: false; error: string } {
  const converted = formulaFromDisplay(text, fields);
  if (!converted.ok) return converted;
  const parsed = parseFormula(converted.expression);
  return parsed.ok ? converted : { ok: false, error: parsed.error };
}
