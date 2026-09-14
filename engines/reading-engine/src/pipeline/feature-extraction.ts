import { injectable } from "inversify";
import { Essentia, EssentiaWASM } from "essentia.js";
import { audioConfig } from "../../config/audio.config.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import type { AudioFeatures } from "@buytuk/contracts";

/**
 * Feature Extraction using Essentia (C++ library, WASM bindings)
 *
 * Provides:
 *   - MFCC (correct implementation with proper windowing)
 *   - Pitch (Melodia algorithm)
 *   - Energy, ZCR, Spectral features
 *   - HNR (Harmonics-to-Noise Ratio)
 */
@injectable()
export class FeatureExtractor {
  private essentia: Essentia;

  constructor() {
    this.essentia = new Essentia(EssentiaWASM);
  }

  extract(pcm: Float32Array, sampleRate: number, correlationId?: string): AudioFeatures {
    const log = logger.child({ component: "FeatureExtractor", correlationId });
    const startTime = Date.now();

    const { mfcc: mfccCfg, pitch: pitchCfg, energy: energyCfg, spectral: spectralCfg } = audioConfig.features;

    const mfcc = this.computeMFCC(pcm, sampleRate, mfccCfg);
    const pitch = this.computePitch(pcm, sampleRate, pitchCfg);
    const energy = this.computeEnergy(pcm, energyCfg);
    const zcr = this.computeZCR(pcm);
    const spectralCentroid = this.computeSpectralCentroid(pcm, sampleRate, spectralCfg);
    const spectralRolloff = this.computeSpectralRolloff(pcm, sampleRate, spectralCfg);
    const speechRate = this.estimateSpeechRate(pitch, energy);
    const pauseRatio = this.computePauseRatio(energy);
    const prosodyVariance = this.stdDev(pitch.filter(p => p > 0));
    const hnr = this.computeHNR(pcm, sampleRate);

    const duration = (Date.now() - startTime) / 1000;
    metrics.pipelineDuration.labels("feature_extraction").observe(duration);

    log.info({ duration, frames: mfcc.length }, "Feature extraction completed");

    return {
      mfcc,
      pitch,
      energy,
      zcr,
      spectralCentroid,
      spectralRolloff,
      speechRate,
      pauseRatio,
      prosodyVariance,
      hnr,
    };
  }

  private computeMFCC(pcm: Float32Array, sr: number, cfg: any): number[][] {
    const frameSize = cfg.frameLength;
    const hopSize = cfg.hopLength;
    const frames: number[][] = [];

    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const frame = pcm.slice(i, i + frameSize);
      const wframe = this.essentia.Window(frame, "hann");
      const spectrum = this.essentia.Spectrum(wframe);
      const { magnitudes } = this.essentia.MFCC(spectrum, {
        sampleRate: sr,
        highFrequencyBound: sr / 2,
        lowFrequencyBound: cfg.lowFrequency,
        numberOfBands: cfg.numFilters,
        numberOfCoefficients: cfg.numCoefficients,
      });
      frames.push(magnitudes);
    }
    return frames;
  }

  private computePitch(pcm: Float32Array, sr: number, cfg: any): number[] {
    const frames: number[] = [];
    for (let i = 0; i + cfg.frameLength <= pcm.length; i += cfg.hopLength) {
      const frame = pcm.slice(i, i + cfg.frameLength);
      try {
        const { pitch, confidence } = this.essentia.PitchMelodia(frame, {
          sampleRate: sr,
          minFrequency: cfg.minFrequency,
          maxFrequency: cfg.maxFrequency,
        });
        frames.push(confidence > 0.5 ? pitch : 0);
      } catch {
        frames.push(0);
      }
    }
    return frames;
  }

  private computeEnergy(pcm: Float32Array, cfg: any): number[] {
    const frameSize = cfg.frameLength;
    const hopSize = cfg.hopLength;
    const out: number[] = [];
    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const frame = pcm.slice(i, i + frameSize);
      out.push(this.essentia.Energy(frame));
    }
    return out;
  }

  private computeZCR(pcm: Float32Array): number[] {
    const frameSize = 1024, hopSize = 512;
    const out: number[] = [];
    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const frame = pcm.slice(i, i + frameSize);
      out.push(this.essentia.ZeroCrossingRate(frame));
    }
    return out;
  }

  private computeSpectralCentroid(pcm: Float32Array, sr: number, cfg: any): number[] {
    const frameSize = cfg.frameLength;
    const hopSize = cfg.hopLength;
    const out: number[] = [];
    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const frame = this.essentia.Window(pcm.slice(i, i + frameSize), "hann");
      const spectrum = this.essentia.Spectrum(frame);
      out.push(this.essentia.Centroid(spectrum) * sr / 2);
    }
    return out;
  }

  private computeSpectralRolloff(pcm: Float32Array, sr: number, cfg: any): number[] {
    const frameSize = cfg.frameLength;
    const hopSize = cfg.hopLength;
    const out: number[] = [];
    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const frame = this.essentia.Window(pcm.slice(i, i + frameSize), "hann");
      const spectrum = this.essentia.Spectrum(frame);
      out.push(this.essentia.RollOff(spectrum, { sampleRate: sr }));
    }
    return out;
  }

  private computeHNR(pcm: Float32Array, sr: number): number {
    const frameSize = 4096;
    const frame = pcm.slice(0, Math.min(frameSize, pcm.length));
    try {
      return this.essentia.HNR(frame, { sampleRate: sr });
    } catch {
      return 0;
    }
  }

  private estimateSpeechRate(pitch: number[], energy: number[]): number {
    const voiced = pitch.filter((p, i) => p > 0 && energy[i] > 0.02).length;
    const durationSec = (pitch.length * audioConfig.features.pitch.hopLength) / audioConfig.input.sampleRate;
    return voiced / Math.max(durationSec, 0.1);
  }

  private computePauseRatio(energy: number[]): number {
    const threshold = audioConfig.processing.silenceThreshold;
    const pauses = energy.filter(e => e < threshold).length;
    return pauses / Math.max(energy.length, 1);
  }

  private stdDev(arr: number[]): number {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }
}
