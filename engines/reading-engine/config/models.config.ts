/**
 * ML Model configuration with versioning
 */
export const modelsConfig = {
  whisper: {
    name: "openai/whisper-large-v3-turbo",
    version: "2024.10",
    sha256: "a4b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6",
    endpoint: "/whisper/transcribe",
    parameters: {
      language: "ar",
      task: "transcribe",
      word_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    },
  },

  forcedAlignment: {
    name: "whisperx/whisperx-alignment",
    version: "3.1.1",
    sha256: "b5c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7",
    endpoint: "/alignment/word",
    parameters: {
      batch_size: 16,
      align_model: "jonatasgrosman/wav2vec2-large-xlsr-53-arabic",
    },
  },

  phonemeRecognizer: {
    name: "facebook/mms-fa-arabic",
    version: "2024.05",
    sha256: "c6d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    endpoint: "/alignment/phoneme",
    parameters: {
      language: "ar",
      return_timestamps: true,
    },
  },

  g2p: {
    name: "camel-tools/camel",
    version: "1.6.2",
    sha256: "d7e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
    endpoint: "/g2p/transcribe",
    parameters: {
      diacritize: true,
      morphAnalysis: true,
    },
  },

  vad: {
    name: "snakers4/silero-vad",
    version: "5.1",
    sha256: "e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    endpoint: "/vad/detect",
    parameters: {
      threshold: 0.5,
      min_speech_duration_ms: 250,
      max_speech_duration_s: 300,
    },
  },

  enhancement: {
    name: "deepfilternet/DeepFilterNet",
    version: "0.5.6",
    sha256: "f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    endpoint: "/enhancement/denoise",
    parameters: {
      attenuation_limit_db: 12,
      min_processing_threshold: -10,
    },
  },
} as const;

export type ModelsConfig = typeof modelsConfig;
