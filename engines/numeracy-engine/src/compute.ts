/**
 * CORE-15 — deterministic arithmetic primitives. A calculator is NOT the
 * goal: these primitives only support deterministic comparison of expected
 * vs actual values (and future step validation). No floating-point trust:
 * integers are exact, division returns quotient/remainder.
 */
export interface BinaryEval {
  readonly value: number;
  readonly quotient?: bigint;
  readonly remainder?: bigint;
  readonly exact: boolean;
}

export function evalBinary(left: number, operator: string, right: number): BinaryEval {
  switch (operator) {
    case "+":
      return { value: left + right, exact: true };
    case "-":
      return { value: left - right, exact: true };
    case "*":
      return { value: left * right, exact: true };
    case "/": {
      if (right === 0) return { value: NaN, exact: false };
      if (Number.isInteger(left) && Number.isInteger(right) && left % right === 0) {
        return { value: left / right, quotient: BigInt(left) / BigInt(right), remainder: 0n, exact: true };
      }
      return { value: left / right, exact: false };
    }
    default:
      return { value: NaN, exact: false };
  }
}

/** verdict of "left op right" — used for comparison domains. */
export function comparatorHolds(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case "=":
      return left === right;
    default:
      return false;
  }
}
