import { describe, expect, it } from "vitest";
import { ReadingScoreEngine } from "../reading-score.js";
import type { AlignmentResult, AudioFeatures, WordAlignment } from "@buytuk/contracts";

const perfectAlignment: AlignmentResult = {
  wordOps: [],
  phonemeOps: [],
  wordErrorRate: 0,
  phonemeErrorRate: 0,
  totalErrors: 0,
};

const words: WordAlignment[] = [
  {
    word: "مرحبا",
    start: 0,
    end: 0.5,
    score: 1,
    confidence: 0.95,
    phonemeAlignment: { expected: ["m", "a"], actual: ["m", "a"], errors: [], score: 1 },
  },
];

const features: AudioFeatures = {
  mfcc: [],
  pitch: [150, 150],
  energy: [0.5, 0.5],
  zcr: [],
  spectralCentroid: [],
  spectralRolloff: [],
  speechRate: 2,
  pauseRatio: 0.1,
  prosodyVariance: 5,
  hnr: 20,
};

describe("ReadingScoreEngine", () => {
  it("perfect reading scores 100 accuracy and ideal wpm", () => {
    const engine = new ReadingScoreEngine();
    const score = engine.compute(perfectAlignment, words, features, 10, 20);
    expect(score.accuracy).toBe(100);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.wpm).toBe(120);
  });

  it("word errors reduce accuracy proportionally", () => {
    const engine = new ReadingScoreEngine();
    const bad: AlignmentResult = { ...perfectAlignment, wordErrorRate: 0.5 };
    const s = engine.compute(bad, [], features, 10, 20);
    expect(s.accuracy).toBe(50);
  });
});
