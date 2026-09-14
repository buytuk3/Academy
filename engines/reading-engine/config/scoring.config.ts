/**
 * Scoring and assessment configuration
 */
export const scoringConfig = {
  weights: {
    accuracy: 0.35,        // Word-level accuracy
    pronunciation: 0.30,   // Phoneme-level accuracy
    fluency: 0.25,         // Speed + rhythm
    prosody: 0.10,         // Intonation + stress
  },

  idealWpm: 120,           // Ideal words per minute for Arabic
  minWpm: 60,              // Minimum acceptable
  maxWpm: 180,             // Maximum acceptable

  mastery: {
    mastered: 85,          // Score >= 85 = mastered
    progressing: 70,       // Score >= 70 = progressing
    developing: 50,        // Score >= 50 = developing
    // Below 50 = needs support
  },

  thresholds: {
    skipLineConsecutiveDeletes: 3,
    skipLinePercentage: 0.3,
    highPriorityErrorCount: 3,
    mediumPriorityErrorCount: 2,
    lowPriorityErrorCount: 1,
  },

  phonemeSeverity: {
    high: {
      minDistance: 0.6,    // Phonetic distance >= 0.6 = high severity
      examples: ["θ→b", "q→ʔ"],
    },
    medium: {
      minDistance: 0.3,
      maxDistance: 0.6,
      examples: ["θ→s", "q→k"],
    },
    low: {
      maxDistance: 0.3,
      examples: ["a→aː"],
    },
  },

  confidence: {
    minAcceptable: 0.7,    // Minimum confidence to accept word
    lowConfidenceThreshold: 0.5,
  },
} as const;

export type ScoringConfig = typeof scoringConfig;
