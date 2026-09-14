import { injectable } from "inversify";
import { PhoneticMatrix } from "./phonetic-matrix.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import type { AlignmentOp, DTWResult } from "@buytuk/contracts";

/**
 * DTW Alignment with Phonetic Distance Matrix
 */
@injectable()
export class AlignmentEngine {
  private matrix: PhoneticMatrix;

  constructor() {
    this.matrix = new PhoneticMatrix();
  }

  align(expected: string[], actual: string[], correlationId?: string): DTWResult {
    const log = logger.child({ component: "Alignment", correlationId });
    const startTime = Date.now();

    const n = expected.length, m = actual.length;
    const INS_COST = 0.7, DEL_COST = 0.7;

    const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    D[0][0] = 0;
    for (let i = 1; i <= n; i++) D[i][0] = D[i - 1][0] + DEL_COST;
    for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + INS_COST;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const subCost = this.matrix.distance(expected[i - 1], actual[j - 1]);
        D[i][j] = Math.min(
          D[i - 1][j - 1] + subCost,
          D[i - 1][j] + DEL_COST,
          D[i][j - 1] + INS_COST
        );
      }
    }

    const ops: AlignmentOp[] = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0) {
        const subCost = this.matrix.distance(expected[i - 1], actual[j - 1]);
        if (Math.abs(D[i][j] - (D[i - 1][j - 1] + subCost)) < 1e-9) {
          ops.push({
            type: subCost < 0.1 ? "match" : "substitution",
            expected: expected[i - 1],
            actual: actual[j - 1],
            cost: subCost,
          });
          i--; j--; continue;
        }
      }
      if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + DEL_COST)) < 1e-9) {
        ops.push({ type: "deletion", expected: expected[i - 1], cost: DEL_COST });
        i--; continue;
      }
      if (j > 0) {
        ops.push({ type: "insertion", actual: actual[j - 1], cost: INS_COST });
        j--; continue;
      }
      break;
    }

    const result: DTWResult = {
      ops: ops.reverse(),
      distance: D[n][m],
      normalizedDistance: D[n][m] / Math.max(n, m),
    };

    const duration = (Date.now() - startTime) / 1000;
    metrics.pipelineDuration.labels("alignment").observe(duration);

    log.info({ duration, ops: ops.length }, "Alignment completed");

    return result;
  }
}
