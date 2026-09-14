/** Minimal LCS (longest common subsequence) over normalized word tokens — deterministic. */
export interface LcsPair {
  readonly i: number; // index in expected
  readonly j: number; // index in actual
}

export function lcsPairs(a: readonly string[], b: readonly string[]): LcsPair[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: LcsPair[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push({ i, j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
