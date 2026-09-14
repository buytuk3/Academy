import { describe, expect, it } from "vitest";
import { ConfidenceEngine } from "../confidence.js";

describe("ConfidenceEngine", () => {
  it("accepts high confidence words and rejects low", () => {
    const engine = new ConfidenceEngine();
    expect(engine.isAcceptable(0.9)).toBe(true);
    expect(engine.isAcceptable(0.4)).toBe(false);
  });

  it("combines STT and alignment signals into one bounded score", () => {
    const engine = new ConfidenceEngine();
    const confidence = engine.calculateWordConfidence(
      { word: "x", start: 0, end: 1, confidence: 0.5, noSpeechProb: 0.1, avgLogprob: -0.2 },
      { word: "x", start: 0, end: 1, score: 0.8, confidence: 0.8 }
    );
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
