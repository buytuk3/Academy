import { describe, expect, it } from "vitest";
import { GapEngine } from "../gap.js";

describe("GapEngine", () => {
  it("distributes errors by type and collects problem words", () => {
    const engine = new GapEngine();
    const ops: any[] = [
      { type: "match", expected: "a", actual: "a", cost: 0 },
      { type: "substitution", expected: "ب", actual: "پ", cost: 0.8 },
      { type: "deletion", expected: "ج", cost: 1 },
    ];
    const gaps = engine.compute(ops as any, [], []);
    expect(gaps.errorDistribution.substitution).toBe(1);
    expect(gaps.errorDistribution.deletion).toBe(1);
    expect(gaps.skippedSegments).toContain("ج");
    expect(gaps.problemWords).toContain("ب");
  });

  it("flags phoneme confusions", () => {
    const engine = new GapEngine();
    const words: any[] = [
      {
        word: "قال",
        start: 0,
        end: 1,
        score: 0.6,
        confidence: 0.7,
        phonemeAlignment: {
          expected: ["q", "a", "l"],
          actual: ["k", "a", "l"],
          errors: [
            { type: "substitution", expected: "q", actual: "k", position: 0, phoneticDistance: 0.7, severity: "high" },
          ],
          score: 0.66,
        },
      },
    ];
    const gaps = engine.compute([], words, []);
    expect(gaps.phonemeGaps["q→k"]).toBe(1);
    expect(gaps.severityBreakdown.high).toBe(1);
  });
});
