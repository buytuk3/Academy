/**
 * Audio processing configuration
 * All values are in standard units (Hz, seconds, samples)
 */
export const audioConfig = {
  input: {
    sampleRate: 16000,      // 16kHz for speech
    channels: 1,            // Mono
    bitDepth: 16,           // 16-bit PCM
    format: "f32le",        // Float32 little-endian
  },

  enhancement: {
    rnnoiseSampleRate: 48000,  // RNNoise requires 48kHz
    frameSize: 480,             // 10ms @ 48kHz
    outputSampleRate: 16000,    // Downsample back to 16k for Whisper
    algorithm: "deepfilternet", // or "rnnoise"
  },

  features: {
    mfcc: {
      numCoefficients: 13,
      frameLength: 400,    // 25ms @ 16kHz
      hopLength: 160,      // 10ms @ 16kHz
      numFilters: 40,
      lowFrequency: 0,
      highFrequency: 8000,
    },
    pitch: {
      frameLength: 2048,
      hopLength: 512,
      minFrequency: 70,
      maxFrequency: 500,
      algorithm: "melodia", // or "yin", "yinfft"
    },
    energy: {
      frameLength: 1024,
      hopLength: 512,
    },
    spectral: {
      frameLength: 2048,
      hopLength: 512,
    },
  },

  vad: {
    positiveThreshold: 0.5,
    negativeThreshold: 0.35,
    minSpeechFrames: 3,
    preSpeechPadFrames: 5,
    redemptionFrames: 8,
    frameSamples: 512,
  },

  processing: {
    maxDurationSec: 300,    // 5 minutes max
    minDurationSec: 1,      // 1 second min
    silenceThreshold: 0.01, // RMS threshold for silence detection
  },
} as const;

export type AudioConfig = typeof audioConfig;
