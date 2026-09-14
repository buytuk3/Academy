/**
 * Pipeline execution configuration
 */
export const pipelineConfig = {
  queue: {
    maxJobs: 100,
    concurrency: 5,
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 2000,
    },
    removeOnComplete: {
      count: 1000,
      age: 7 * 24 * 3600, // 7 days
    },
    removeOnFail: {
      count: 5000,
      age: 30 * 24 * 3600, // 30 days
    },
  },

  workers: {
    analyze: {
      concurrency: 3,
      maxJobsPerWorker: 50,
    },
    realtime: {
      concurrency: 10,
      maxJobsPerWorker: 100,
    },
  },

  timeouts: {
    audioEnhancement: 30000,    // 30 seconds
    featureExtraction: 20000,   // 20 seconds
    vad: 10000,                 // 10 seconds
    stt: 60000,                 // 60 seconds (Whisper is slow)
    forcedAlignment: 45000,     // 45 seconds
    g2p: 15000,                 // 15 seconds
    alignment: 10000,           // 10 seconds
    aiFeedback: 30000,          // 30 seconds (LLM call)
    totalPipeline: 300000,      // 5 minutes total
  },

  retry: {
    maxRetries: 3,
    retryableErrors: [
      "TIMEOUT",
      "NETWORK_ERROR",
      "INFERENCE_UNAVAILABLE",
    ],
    nonRetryableErrors: [
      "INVALID_AUDIO",
      "AUDIO_TOO_LONG",
      "INVALID_TEXT",
    ],
  },

  batching: {
    enabled: true,
    maxBatchSize: 10,
    batchTimeout: 5000, // 5 seconds
  },
} as const;

export type PipelineConfig = typeof pipelineConfig;
