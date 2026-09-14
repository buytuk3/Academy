import "reflect-metadata";
import { Container } from "inversify";
import { AudioEnhancement } from "./pipeline/audio-enhancement.js";
import { FeatureExtractor } from "./pipeline/feature-extraction.js";
import { VoiceActivityDetector } from "./pipeline/vad.js";
import { WhisperSTT } from "./pipeline/stt.js";
import { G2PEngine } from "./pipeline/g2p.js";
import { IPAMapper } from "./pipeline/ipa-mapper.js";
import { AlignmentEngine } from "./pipeline/alignment.js";
import { ForcedAlignment } from "./pipeline/forced-alignment.js";
import { ConfidenceEngine } from "./engines/confidence.js";
import { ReadingScoreEngine } from "./engines/reading-score.js";
import { MasteryEngine } from "./engines/mastery.js";
import { GapEngine } from "./engines/gap.js";
import { RuleEngine } from "./engines/rule-engine.js";
import { AIFeedbackEngine } from "./engines/ai-feedback.js";
import { RecommendationEngine } from "./engines/recommendation.js";
import { ExerciseLibrary } from "./exercises/library.js";
import { ReportGenerator } from "./report/generator.js";
import { GatewayLLMAdapter } from "./engines/llm/gateway-adapter.js";
import type { LLMProvider } from "./engines/llm/types.js";

const TYPES = {
  // Pipeline
  AudioEnhancement: Symbol.for("AudioEnhancement"),
  FeatureExtractor: Symbol.for("FeatureExtractor"),
  VoiceActivityDetector: Symbol.for("VoiceActivityDetector"),
  WhisperSTT: Symbol.for("WhisperSTT"),
  G2PEngine: Symbol.for("G2PEngine"),
  IPAMapper: Symbol.for("IPAMapper"),
  AlignmentEngine: Symbol.for("AlignmentEngine"),
  ForcedAlignment: Symbol.for("ForcedAlignment"),

  // Engines
  ConfidenceEngine: Symbol.for("ConfidenceEngine"),
  ReadingScoreEngine: Symbol.for("ReadingScoreEngine"),
  MasteryEngine: Symbol.for("MasteryEngine"),
  GapEngine: Symbol.for("GapEngine"),
  RuleEngine: Symbol.for("RuleEngine"),
  AIFeedbackEngine: Symbol.for("AIFeedbackEngine"),
  RecommendationEngine: Symbol.for("RecommendationEngine"),

  // Support
  ExerciseLibrary: Symbol.for("ExerciseLibrary"),
  ReportGenerator: Symbol.for("ReportGenerator"),

  // LLM (P2 / ACR-E6-001 — provider-agnostic abstraction)
  LLMProvider: Symbol.for("LLMProvider"),
};

function buildContainer(): Container {
  const container = new Container({ defaultScope: "Singleton" });

  // Pipeline Layer
  container.bind<AudioEnhancement>(TYPES.AudioEnhancement).to(AudioEnhancement);
  container.bind<FeatureExtractor>(TYPES.FeatureExtractor).to(FeatureExtractor);
  container.bind<VoiceActivityDetector>(TYPES.VoiceActivityDetector).to(VoiceActivityDetector);
  container.bind<WhisperSTT>(TYPES.WhisperSTT).to(WhisperSTT);
  container.bind<G2PEngine>(TYPES.G2PEngine).to(G2PEngine);
  container.bind<IPAMapper>(TYPES.IPAMapper).to(IPAMapper);
  container.bind<AlignmentEngine>(TYPES.AlignmentEngine).to(AlignmentEngine);
  container.bind<ForcedAlignment>(TYPES.ForcedAlignment).to(ForcedAlignment);

  // Engine Layer
  container.bind<ConfidenceEngine>(TYPES.ConfidenceEngine).to(ConfidenceEngine);
  container.bind<ReadingScoreEngine>(TYPES.ReadingScoreEngine).to(ReadingScoreEngine);
  container.bind<MasteryEngine>(TYPES.MasteryEngine).to(MasteryEngine);
  container.bind<GapEngine>(TYPES.GapEngine).to(GapEngine);
  container.bind<RuleEngine>(TYPES.RuleEngine).to(RuleEngine);
  container.bind<AIFeedbackEngine>(TYPES.AIFeedbackEngine).to(AIFeedbackEngine);
  container.bind<RecommendationEngine>(TYPES.RecommendationEngine).to(RecommendationEngine);

  // Support Layer
  container.bind<ExerciseLibrary>(TYPES.ExerciseLibrary).to(ExerciseLibrary);
  container.bind<ReportGenerator>(TYPES.ReportGenerator).to(ReportGenerator);

  // LLM (P2 — additive: provider-agnostic; swap the binding to change provider)
  container.bind<LLMProvider>(TYPES.LLMProvider).to(GatewayLLMAdapter);

  return container;
}

export const container = buildContainer();
export { TYPES };
