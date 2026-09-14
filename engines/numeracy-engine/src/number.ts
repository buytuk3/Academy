/**
 * CORE-15 — numeric expression normalisation & deterministic value
 * comparison. Language/notation agnostic: all digit scripts fold to
 * ASCII via the injected digit policy (core never hard-codes language).
 */
import type { DigitNormalizationPolicy } from "./policies.js";

const OPERATOR_MAP: Record<string, string> = {
  "×": "*", "✕": "*", "•": "*", "·": "*", "x": "*", "X": "*",
  "÷": "/", "−": "-", "–": "-", "—": "-",
};

export function normalizeExpression(value: string, policy: DigitNormalizationPolicy): string {
  let s = policy.normalize(value);
  for (const [from, to] of Object.entries(OPERATOR_MAP)) s = s.split(from).join(to);
  s = s.replace(/[\s,]+/g, "");
  return s;
}

const INTEGER_RE = /^([+-]?\d+)$/;
const DECIMAL_RE = /^([+-]?\d+(?:\.\d+)?)$/;
const FRACTION_RE = /^([+-]?\d+)\/([+-]?\d+)$/;
const REMAINDER_RE = /^([+-]?\d+)r([+-]?\d+)$/;
const BINARY_RE = /^([+-]?\d+(?:\.\d+)?)([+\-*/])([+-]?\d+(?:\.\d+)?)$/;
const COMPARATOR_RE = /^(.*?)(>=|<=|>|<|=)(.*)$/;

export function toNumber(s: string): number | undefined {
  const m = DECIMAL_RE.exec(s);
  return m ? Number(m[1]) : undefined;
}

/** exact integer equality via BigInt; decimal falls back to parseFloat. */
export function numbersEqual(a: string, b: string): boolean {
  const ia = INTEGER_RE.exec(a);
  const ib = INTEGER_RE.exec(b);
  if (ia && ib) return BigInt(ia[1]) === BigInt(ib[1]);
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === undefined || nb === undefined) return false;
  return Math.abs(na - nb) < 1e-9;
}

export interface ParsedFraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export function parseFraction(s: string): ParsedFraction | undefined {
  const m = FRACTION_RE.exec(s);
  if (!m) return undefined;
  const den = BigInt(m[2]);
  if (den === 0n) return undefined;
  return { numerator: BigInt(m[1]), denominator: den };
}

/** a/b == c/d  <=>  a*d == c*b (exact, no floating point). */
export function fractionsEqual(a: string, b: string): boolean {
  const fa = parseFraction(a);
  const fb = parseFraction(b);
  if (!fa || !fb) return false;
  return fa.numerator * fb.denominator === fb.numerator * fa.denominator;
}

export interface ParsedRemainder {
  readonly quotient: bigint;
  readonly remainder: bigint;
}

export function parseRemainder(s: string): ParsedRemainder | undefined {
  const m = REMAINDER_RE.exec(s);
  if (!m) return undefined;
  return { quotient: BigInt(m[1]), remainder: BigInt(m[2]) };
}

export interface ParsedBinary {
  readonly left: string;
  readonly operator: string;
  readonly right: string;
}

export function parseBinary(s: string): ParsedBinary | undefined {
  const m = BINARY_RE.exec(s);
  return m ? { left: m[1], operator: m[2], right: m[3] } : undefined;
}

export interface ParsedComparator {
  readonly left: string;
  readonly operator: string;
  readonly right: string;
}

export function parseComparator(s: string): ParsedComparator | undefined {
  const m = COMPARATOR_RE.exec(s);
  return m ? { left: m[1], operator: m[2], right: m[3] } : undefined;
}

/** expected/actual with a power-of-ten ratio (10, 100, 1000, ...) — place-value drift. */
export function isPowerOfTenRatio(e: number, a: number): boolean {
  if (e === 0 || a === 0) return false;
  const hi = Math.max(Math.abs(e), Math.abs(a));
  const lo = Math.min(Math.abs(e), Math.abs(a));
  const r = Math.round(hi / lo);
  if (r <= 1) return false;
  return Math.abs(hi / lo - r) < 1e-9 && Number.isInteger(Math.log10(r));
}

/** missed-carry / missed-borrow signature: difference is a power of ten. */
export function isPowerOfTenDiff(e: number, a: number): boolean {
  const d = Math.abs(e - a);
  if (d <= 1) return false;
  return Number.isInteger(Math.log10(d));
}

/** full digit reversal ("92" -> "29"). */
export function isDigitTranslocation(e: string, a: string): boolean {
  if (e === a) return false;
  const rev = e.split("").reverse().join("");
  return rev === a;
}
