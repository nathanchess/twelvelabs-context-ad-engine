/* ══════════════════════════════════════════════════════════════
   Ad Placement Engine — Pure, deterministic functions.
   No API calls, no randomness, no LLM calls.
   Same inputs always produce the same outputs.
   ══════════════════════════════════════════════════════════════ */

import type {
  Segment,
  PlacementConfig,
  AdBreakCandidate,
  AdBreakReasoning,
  AdInventoryItem,
  MockUser,
  AdRankResult,
  AdScores,
  SignalChain,
  UserEligibilityCache,
  UserEligibilityResult,
} from "./types";

/* ── Token helpers ───────────────────────────────────────── */

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are",
  "was", "has", "have", "its", "not", "but", "can", "all", "who", "she",
  "her", "his", "him", "they", "them", "their", "there", "here", "when",
  "what", "which", "where", "how", "out", "one", "two", "three",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function buildSegmentTokens(segment: Segment): Set<string> {
  return new Set(
    tokenize(
      [
        segment.scene_context ?? "",
        segment.environment ?? "",
        ...(segment.ad_suitability?.suitable_categories ?? []),
        ...(segment.ad_suitability?.contextual_themes ?? []),
        ...(segment.activities ?? []),
        ...(segment.objects_of_interest ?? []),
      ].join(" ")
    )
  );
}

// Maps a category_key to broad semantic keywords that often appear in matching scene text
const CATEGORY_SEMANTIC_KEYWORDS: Record<string, string[]> = {
  alcohol_premium: ["spirits", "whiskey", "bourbon", "scotch", "vodka", "cocktail", "bar", "wine", "luxury", "premium", "celebration", "social", "entertainment", "dining", "nightlife", "party", "drink", "toast", "champagne"],
  alcohol_beer: ["beer", "sports", "party", "bar", "casual", "social", "friends", "game", "pub", "tailgate", "celebration"],
  cpg_snacks: ["snack", "food", "casual", "party", "gaming", "fun", "friends", "social", "sports", "eat", "crunch", "munch"],
  cpg_food: ["food", "eating", "dining", "meal", "restaurant", "cooking", "kitchen", "family", "table", "dinner"],
  automotive_truck: ["truck", "vehicle", "drive", "outdoor", "adventure", "construction", "work", "road", "haul", "off-road"],
  automotive_luxury: ["luxury", "premium", "drive", "performance", "vehicle", "style", "prestige", "sedan", "sports"],
  financial_services: ["finance", "money", "invest", "wealth", "business", "plan", "future", "retirement", "savings"],
  fitness_wellness: ["fitness", "health", "wellness", "active", "gym", "exercise", "sport", "training", "run", "workout"],
  home_improvement: ["home", "house", "renovation", "build", "kitchen", "garden", "remodel", "diy", "tools"],
  travel_luxury: ["travel", "vacation", "resort", "hotel", "beach", "destination", "adventure", "explore", "destination"],
  entertainment: ["entertainment", "fun", "comedy", "movie", "music", "show", "stream", "laugh", "event", "concert"],
  technology: ["tech", "digital", "phone", "app", "software", "device", "smart", "screen", "data"],
  insurance: ["insurance", "protect", "coverage", "safe", "secure", "family", "home", "vehicle"],
  pharmaceutical: ["health", "medicine", "doctor", "relief", "wellness", "symptom", "treatment"],
  retail_general: ["shop", "store", "sale", "deal", "fashion", "style", "clothes", "brand"],
  qsr_fast_food: ["food", "fast", "burger", "pizza", "eat", "restaurant", "quick", "meal", "delivery"],
  telecom: ["phone", "data", "connect", "network", "mobile", "internet", "stream", "call"],
  sports_betting: ["sports", "game", "bet", "odds", "win", "team", "score", "champion"],
};

// Maps category_key to the segment's suitable_categories strings it typically matches
const CATEGORY_TO_AD_SUITABLE: Record<string, string[]> = {
  alcohol_premium: ["premium spirits", "spirits", "fine dining", "luxury goods", "entertainment"],
  alcohol_beer: ["entertainment", "pop culture", "sports"],
  cpg_snacks: ["fast food", "entertainment", "pop culture", "gaming", "snacks"],
  cpg_food: ["fast food", "home improvement", "health", "food"],
  automotive_truck: ["automotive", "home improvement", "fitness"],
  automotive_luxury: ["automotive", "luxury goods", "travel"],
  financial_services: ["financial services", "finance"],
  fitness_wellness: ["fitness", "health & wellness", "wellness"],
  home_improvement: ["home improvement"],
  travel_luxury: ["travel", "luxury goods"],
  entertainment: ["entertainment", "pop culture"],
  technology: ["technology", "entertainment"],
  retail_general: ["retail", "fashion", "pop culture"],
  qsr_fast_food: ["fast food", "pop culture"],
};

/* ── Scene Fit lookup tables ─────────────────────────────── */

// How well each ad category performs in a given environment type.
// Keys are lowercased segment.environment values; inner keys are category_key.
const ENVIRONMENT_CATEGORY_AFFINITY: Record<string, Record<string, number>> = {
  "indoor bar restaurant": {
    alcohol_premium: 1.0, alcohol_beer: 0.9, cpg_food: 0.7,
    entertainment: 0.6, financial_services: 0.4, automotive_luxury: 0.3, default: 0.2,
  },
  "indoor venue": {
    alcohol_premium: 0.7, alcohol_beer: 0.6, entertainment: 0.8,
    fashion_luxury: 0.7, financial_services: 0.4, cpg_snacks: 0.5, default: 0.3,
  },
  "outdoor sports venue": {
    alcohol_beer: 0.9, cpg_snacks: 0.9, qsr_fast_food: 0.8,
    sports_betting: 0.9, fitness_wellness: 0.7, automotive_truck: 0.6,
    alcohol_premium: 0.4, default: 0.3,
  },
  "outdoor nature": {
    automotive_truck: 0.9, travel_adventure: 0.9, travel_luxury: 0.7,
    fitness_wellness: 0.8, insurance: 0.5, alcohol_beer: 0.5,
    alcohol_premium: 0.3, default: 0.2,
  },
  "outdoor adventure": {
    automotive_truck: 1.0, travel_adventure: 0.9, fitness_wellness: 0.8,
    alcohol_beer: 0.5, cpg_snacks: 0.6, default: 0.2,
  },
  "outdoor urban": {
    automotive_luxury: 0.8, fashion_luxury: 0.8, technology: 0.7,
    telecom: 0.7, qsr_fast_food: 0.7, retail_general: 0.6,
    alcohol_premium: 0.5, default: 0.3,
  },
  "indoor home": {
    home_improvement: 1.0, insurance: 0.7, cpg_food: 0.8,
    cpg_snacks: 0.7, technology: 0.7, pharmaceutical: 0.7,
    telecom: 0.6, default: 0.3,
  },
  "indoor office": {
    technology: 0.9, financial_services: 0.9, telecom: 0.7,
    insurance: 0.6, default: 0.2,
  },
  "indoor retail": {
    retail_general: 0.9, fashion_luxury: 0.8, cpg_food: 0.7,
    cpg_snacks: 0.7, technology: 0.6, default: 0.3,
  },
  "vehicle": {
    automotive_truck: 1.0, automotive_luxury: 1.0, insurance: 0.7,
    telecom: 0.5, default: 0.2,
  },
  "studio": {
    entertainment: 0.8, technology: 0.5, default: 0.3,
  },
};

// How well each ad category's creative tone aligns with a scene's emotional tone.
const CATEGORY_TONE_AFFINITY: Record<string, Record<string, number>> = {
  alcohol_premium: {
    Celebratory: 1.0, Romantic: 0.8, Casual: 0.7, Dramatic: 0.5,
    Inspirational: 0.6, Comedic: 0.4, Informational: 0.3,
    Tense: 0.2, Somber: 0.1, Action: 0.3, default: 0.4,
  },
  alcohol_beer: {
    Celebratory: 0.9, Comedic: 0.9, Casual: 0.8, Action: 0.7,
    Inspirational: 0.5, Dramatic: 0.3, Romantic: 0.3,
    Tense: 0.2, Somber: 0.1, Informational: 0.3, default: 0.4,
  },
  cpg_snacks: {
    Comedic: 1.0, Casual: 0.9, Celebratory: 0.8, Action: 0.7,
    Inspirational: 0.4, Dramatic: 0.2, Romantic: 0.2,
    Tense: 0.2, Somber: 0.1, Informational: 0.3, default: 0.4,
  },
  cpg_food: {
    Casual: 0.9, Celebratory: 0.7, Comedic: 0.7, Romantic: 0.6,
    Inspirational: 0.5, Informational: 0.5, Dramatic: 0.3,
    Tense: 0.2, Somber: 0.2, Action: 0.3, default: 0.4,
  },
  automotive_truck: {
    Action: 1.0, Inspirational: 0.8, Dramatic: 0.7, Casual: 0.5,
    Celebratory: 0.5, Comedic: 0.4, Tense: 0.4, Romantic: 0.2,
    Somber: 0.2, Informational: 0.4, default: 0.4,
  },
  automotive_luxury: {
    Dramatic: 0.9, Inspirational: 0.9, Romantic: 0.7, Celebratory: 0.7,
    Casual: 0.5, Action: 0.6, Comedic: 0.3, Tense: 0.3,
    Somber: 0.2, Informational: 0.4, default: 0.4,
  },
  financial_services: {
    Inspirational: 1.0, Informational: 0.9, Dramatic: 0.6, Casual: 0.5,
    Celebratory: 0.5, Romantic: 0.3, Comedic: 0.3, Action: 0.3,
    Tense: 0.3, Somber: 0.3, default: 0.4,
  },
  fitness_wellness: {
    Inspirational: 1.0, Action: 0.9, Celebratory: 0.7, Casual: 0.6,
    Dramatic: 0.4, Comedic: 0.4, Romantic: 0.3, Informational: 0.6,
    Tense: 0.2, Somber: 0.2, default: 0.4,
  },
  home_improvement: {
    Inspirational: 0.8, Casual: 0.8, Informational: 0.7,
    Celebratory: 0.5, Dramatic: 0.4, Comedic: 0.5, Action: 0.5,
    Romantic: 0.3, Tense: 0.2, Somber: 0.2, default: 0.4,
  },
  travel_luxury: {
    Romantic: 1.0, Inspirational: 0.9, Celebratory: 0.8, Casual: 0.7,
    Dramatic: 0.4, Comedic: 0.4, Action: 0.5, Informational: 0.4,
    Tense: 0.1, Somber: 0.1, default: 0.4,
  },
  travel_adventure: {
    Action: 1.0, Inspirational: 0.9, Celebratory: 0.7, Casual: 0.6,
    Dramatic: 0.5, Comedic: 0.5, Romantic: 0.4, Informational: 0.4,
    Tense: 0.3, Somber: 0.2, default: 0.4,
  },
  entertainment: {
    Comedic: 0.9, Celebratory: 0.9, Casual: 0.8, Action: 0.8,
    Dramatic: 0.6, Inspirational: 0.6, Romantic: 0.5, Informational: 0.4,
    Tense: 0.4, Somber: 0.3, default: 0.5,
  },
  technology: {
    Informational: 0.9, Inspirational: 0.8, Casual: 0.6, Action: 0.6,
    Dramatic: 0.4, Comedic: 0.5, Celebratory: 0.5, Romantic: 0.2,
    Tense: 0.3, Somber: 0.2, default: 0.4,
  },
  qsr_fast_food: {
    Comedic: 1.0, Casual: 0.9, Celebratory: 0.7, Action: 0.7,
    Inspirational: 0.3, Dramatic: 0.2, Romantic: 0.2, Tense: 0.2,
    Somber: 0.1, Informational: 0.3, default: 0.4,
  },
  retail_general: {
    Casual: 0.8, Celebratory: 0.7, Comedic: 0.7, Inspirational: 0.5,
    Informational: 0.5, Dramatic: 0.3, Action: 0.4, Romantic: 0.4,
    Tense: 0.2, Somber: 0.2, default: 0.4,
  },
  insurance: {
    Inspirational: 0.8, Informational: 0.8, Dramatic: 0.6, Casual: 0.5,
    Celebratory: 0.4, Romantic: 0.4, Somber: 0.5, Tense: 0.4,
    Comedic: 0.3, Action: 0.3, default: 0.4,
  },
  pharmaceutical: {
    Informational: 0.9, Inspirational: 0.7, Casual: 0.5, Dramatic: 0.4,
    Celebratory: 0.3, Romantic: 0.3, Comedic: 0.2, Action: 0.2,
    Tense: 0.3, Somber: 0.4, default: 0.4,
  },
  telecom: {
    Casual: 0.8, Comedic: 0.7, Celebratory: 0.6, Informational: 0.7,
    Inspirational: 0.5, Action: 0.5, Dramatic: 0.3, Romantic: 0.3,
    Tense: 0.2, Somber: 0.2, default: 0.4,
  },
  sports_betting: {
    Action: 1.0, Celebratory: 0.9, Tense: 0.7, Comedic: 0.6,
    Casual: 0.5, Dramatic: 0.5, Inspirational: 0.4, Informational: 0.4,
    Romantic: 0.1, Somber: 0.1, default: 0.4,
  },
  fashion_luxury: {
    Dramatic: 0.9, Romantic: 0.9, Inspirational: 0.8, Celebratory: 0.7,
    Casual: 0.5, Comedic: 0.3, Action: 0.3, Informational: 0.3,
    Tense: 0.2, Somber: 0.2, default: 0.4,
  },
};

/**
 * Pure cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1]; returns 0 if either vector is zero-norm.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dot   += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * computeSceneFit — Per-ad scene relevance score (0–1).
 *
 * Four signals:
 *   A) Suitable-category match  (15%) — category taxonomy in scene's suitable_categories
 *   B) Environment affinity     (15%) — ad category vs environment type
 *   C) Tone compatibility       (10%) — ad category vs emotional tone
 *   D) Semantic vector match    (60%) — TwelveLabs Marengo cosine similarity (ad ↔ segment)
 *
 * Signal D uses pre-computed TwelveLabs embeddings for precise semantic matching.
 * When vectors are not yet available it defaults to 0.5 (neutral), so A–C still drive ranking.
 */
function computeSceneFit(
  ad: AdInventoryItem,
  segment: Segment
): {
  score: number;
  breakdown: { suitableMatch: number; environmentFit: number; toneCompat: number; contextMatch: number };
  contextMatchedTokens: string[];
  vectorSimilarity: number | null;
  vectorsAvailable: boolean;
  reasoning: string;
} {
  // ── Signal A: Suitable Category Match ──────────────────
  const suitableLower = (segment.ad_suitability?.suitable_categories ?? []).map((s) =>
    s.toLowerCase()
  );
  const unsuitableLower = (segment.ad_suitability?.unsuitable_categories ?? []).map((s) =>
    s.toLowerCase()
  );
  const adSuitableTargets = CATEGORY_TO_AD_SUITABLE[ad.category_key] ?? [];

  const isExplicitlyUnsuitable = adSuitableTargets.some((target) =>
    unsuitableLower.some((sc) => sc.includes(target) || target.includes(sc))
  );

  let suitableMatch: number;
  if (isExplicitlyUnsuitable) {
    suitableMatch = 0.05;
  } else if (adSuitableTargets.length === 0) {
    suitableMatch = 0.3;
  } else {
    const hits = adSuitableTargets.filter((target) =>
      suitableLower.some((sc) => sc.includes(target) || target.includes(sc))
    ).length;
    suitableMatch = hits / adSuitableTargets.length;
  }

  // ── Signal B: Environment Affinity ─────────────────────
  const envKey = (segment.environment ?? "").toLowerCase();
  const envMap = ENVIRONMENT_CATEGORY_AFFINITY[envKey];
  const environmentFit = envMap
    ? (envMap[ad.category_key] ?? (envMap.default as number) ?? 0.3)
    : 0.3;

  // ── Signal C: Tone Compatibility ────────────────────────
  const toneLookup = CATEGORY_TONE_AFFINITY[ad.category_key];
  const toneCompat = toneLookup
    ? (toneLookup[segment.tone] ?? (toneLookup.default as number) ?? 0.4)
    : 0.4;

  // ── Signal D: Semantic Vector Match (TwelveLabs Marengo) ──
  // Cosine similarity between the ad's embedding and the segment's embedding.
  // Vectors are pre-computed by TwelveLabs and averaged over clip segments.
  // Normalized from [-1, 1] → [0, 1].
  // Falls back to 0.5 (neutral) when embeddings are not yet loaded so that
  // signals A–C continue to differentiate ads without crashing the ranking.
  const vectorsAvailable =
    Array.isArray(ad.vector) && ad.vector.length > 0 &&
    Array.isArray(segment.vector) && segment.vector.length > 0;

  let vectorSimilarity: number | null = null;
  let contextMatch = 0.5; // neutral fallback
  if (vectorsAvailable) {
    vectorSimilarity = cosineSimilarity(ad.vector!, segment.vector!);
    // Stretch the expected cosine range for this dataset into [0, 1]
    // so small raw similarity differences become more meaningful.
    const SIM_MIN = 0.35; // baseline for unrelated content
    const SIM_MAX = 0.75; // baseline for highly related content
    const stretchedSim = (vectorSimilarity - SIM_MIN) / (SIM_MAX - SIM_MIN);
    contextMatch = Math.max(0, Math.min(1.0, stretchedSim));
    // Emphasize higher-quality matches to improve spread in ranking.
    contextMatch = Math.pow(contextMatch, 1.5);
  }

  // ── Composite ───────────────────────────────────────────
  // Weights: A+B+C = 40% (category/context baseline), D = 60% (semantic uniqueness)
  const score =
    suitableMatch  * 0.15 +
    environmentFit * 0.15 +
    toneCompat     * 0.10 +
    contextMatch   * 0.60;

  // ── Reasoning ────────────────────────────────────────────
  const parts: string[] = [];
  if (vectorsAvailable && vectorSimilarity !== null) {
    if (contextMatch >= 0.70) {
      parts.push(`strong semantic match (${contextMatch.toFixed(2)} similarity)`);
    } else if (contextMatch >= 0.55) {
      parts.push(`moderate semantic match (${contextMatch.toFixed(2)} similarity)`);
    } else {
      parts.push(`low semantic match (${contextMatch.toFixed(2)} similarity)`);
    }
  } else {
    parts.push("embeddings pending — using category signals only");
  }
  if (suitableMatch >= 0.5) {
    const matched = adSuitableTargets.filter((t) =>
      suitableLower.some((sc) => sc.includes(t) || t.includes(sc))
    );
    parts.push(`category fits (${matched.join(", ")})`);
  }
  if (environmentFit >= 0.7) {
    parts.push(`${segment.environment || "environment"} suits this category`);
  } else if (environmentFit < 0.3) {
    parts.push(`weak environment fit`);
  }
  if (toneCompat >= 0.7) {
    parts.push(`${segment.tone} tone enhances this category`);
  } else if (toneCompat < 0.3) {
    parts.push(`${segment.tone} tone clashes`);
  }

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: { suitableMatch, environmentFit, toneCompat, contextMatch },
    contextMatchedTokens: [], // replaced by vector similarity — kept for interface compat
    vectorSimilarity,
    vectorsAvailable,
    reasoning: parts.join("; ") || "neutral fit",
  };
}

/* ── Constants ────────────────────────────────────────────── */

const BREAK_QUALITY_MAP: Record<string, number> = {
  High: 1.0,
  Medium: 0.5,
  Low: 0.1,
};

const TRANSITION_BONUS_MAP: Record<string, number> = {
  "Hard Cut": 0.3,
  Fade: 0.35,
  "Narrative Pause": 0.4,
  "Topic Shift": 0.25,
  None: 0.0,
};

const SENTIMENT_TONE_MATRIX: Record<string, Record<string, number>> = {
  Positive: {
    Celebratory: 1.0,
    Romantic: 0.8,
    Inspirational: 0.9,
    Casual: 0.7,
    Comedic: 0.7,
    default: 0.6,
  },
  Neutral: {
    Informational: 0.7,
    Casual: 0.6,
    default: 0.5,
  },
  Negative: {
    Somber: 0.2,
    Tense: 0.3,
    Dramatic: 0.3,
    default: 0.2,
  },
  Mixed: {
    default: 0.4,
  },
};

/**
 * When segment brand_safety is mostly "safe / Low", GARM-based safetyMode branches never diverge.
 * This factor always uses interruption risk + sentiment + tone so strict / balanced / revenue_max
 * produce visibly different break rankings and counts.
 */
function placementModeBreakFactor(
  safetyMode: PlacementConfig["safetyMode"],
  segment: Segment
): number {
  const ir = segment.ad_break_fitness?.interruption_risk ?? 0.5;
  const sent = segment.sentiment;
  const tenseTone =
    segment.tone === "Tense" ||
    segment.tone === "Somber" ||
    segment.tone === "Dramatic";

  if (safetyMode === "strict") {
    let f = 1 - 0.28 * Math.max(0, ir - 0.32);
    if (sent === "Negative") f *= 0.86;
    else if (sent === "Mixed") f *= 0.92;
    if (tenseTone) f *= 0.9;
    return Math.max(0.32, f);
  }
  if (safetyMode === "balanced") {
    let f = 1 - 0.12 * Math.max(0, ir - 0.48);
    if (sent === "Negative") f *= 0.94;
    if (tenseTone) f *= 0.96;
    return Math.max(0.52, f);
  }
  let f = 1 + 0.14 * Math.max(0, 0.62 - ir);
  if (sent === "Positive") f *= 1.05;
  return Math.min(1.2, f);
}

/** Per-mode scaling of ad×scene scores (eligible rows only). */
function placementModeAdRankFactor(
  safetyMode: PlacementConfig["safetyMode"],
  segment: Segment
): number {
  const ir = segment.ad_break_fitness?.interruption_risk ?? 0.5;
  if (safetyMode === "strict") {
    let f = Math.max(0.5, 1 - 0.22 * Math.max(0, ir - 0.4));
    if (segment.sentiment === "Negative" || segment.sentiment === "Mixed") f *= 0.88;
    return f;
  }
  if (safetyMode === "balanced") {
    return Math.max(0.72, 1 - 0.1 * Math.max(0, ir - 0.52));
  }
  return Math.min(1.14, 1 + 0.08 * Math.max(0, 0.58 - ir));
}

/* ══════════════════════════════════════════════════════════════
   Function 1: identifyAdBreaks
   ══════════════════════════════════════════════════════════════ */

export function identifyAdBreaks(
  segments: Segment[],
  config: PlacementConfig
): AdBreakCandidate[] {
  const { safetyMode, maxBreaks, minSegmentDuration, minSpacingSeconds } = config;

  const allCandidates: AdBreakCandidate[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    // FILTER: skip if this is the last segment
    if (!nextSegment) continue;

    // FILTER: skip if segment duration is too short
    if (segment.end_time - segment.start_time < minSegmentDuration) continue;

    // ── Scoring ──────────────────────────────────────────

    const breakQualityScore =
      BREAK_QUALITY_MAP[segment.ad_break_fitness?.post_segment_break_quality] ?? 0.1;

    const interruptionRisk = segment.ad_break_fitness?.interruption_risk ?? 0.5;
    const interruptionScore = 1.0 - interruptionRisk;

    const emotionalDrop = Math.max(
      0,
      segment.emotional_intensity - (nextSegment.emotional_intensity ?? 0)
    );
    const valleyBonus = emotionalDrop * 0.5;

    const transitionBonus =
      TRANSITION_BONUS_MAP[segment.ad_break_fitness?.break_type] ?? 0.0;

    // ── Safety Mode Multiplier ───────────────────────────

    let safetyMultiplier = 1.0;

    if (safetyMode === "strict") {
      if (
        segment.brand_safety?.is_safe === false ||
        nextSegment.brand_safety?.is_safe === false
      ) {
        safetyMultiplier = 0.0;
      }
    } else if (safetyMode === "balanced") {
      const riskLevel = segment.brand_safety?.risk_level;
      if (riskLevel === "High") safetyMultiplier = 0.0;
      else if (riskLevel === "Medium") safetyMultiplier = 0.5;
    }
    // revenue_max: GARM multiplier stays 1.0 (placementModeBreakFactor still applies below)

    // ── Composite ────────────────────────────────────────

    const rawScore =
      breakQualityScore * 0.35 +
      interruptionScore * 0.25 +
      valleyBonus * 0.2 +
      transitionBonus * 0.2;

    const placementModeFactor = placementModeBreakFactor(safetyMode, segment);

    const finalScore =
      Math.round(rawScore * safetyMultiplier * placementModeFactor * 1000) / 1000;

    if (finalScore <= 0) continue;

    const reasoning: AdBreakReasoning = {
      breakQuality: segment.ad_break_fitness?.post_segment_break_quality ?? "Low",
      breakQualityScore,
      interruptionRisk,
      interruptionScore,
      emotionalDrop,
      valleyBonus,
      breakType: segment.ad_break_fitness?.break_type ?? "None",
      transitionBonus,
      safetyMultiplier,
      placementModeFactor,
      rawScore,
      finalScore,
    };

    allCandidates.push({
      segmentIndex: i,
      timestamp: segment.end_time,
      score: finalScore,
      precedingSegment: segment,
      followingSegment: nextSegment,
      reasoning,
    });
  }

  // ── Post-processing: greedy spacing enforcement ────────

  allCandidates.sort((a, b) => b.score - a.score);

  const selected: AdBreakCandidate[] = [];

  for (const candidate of allCandidates) {
    if (selected.length >= maxBreaks) break;

    const tooClose = selected.some(
      (s) => Math.abs(s.timestamp - candidate.timestamp) < minSpacingSeconds
    );
    if (tooClose) continue;

    selected.push(candidate);
  }

  // Return sorted chronologically
  selected.sort((a, b) => a.timestamp - b.timestamp);

  return selected;
}

/* ══════════════════════════════════════════════════════════════
   Function 2: rankAdsForBreak
   ══════════════════════════════════════════════════════════════ */

export function rankAdsForBreak(
  adBreak: AdBreakCandidate,
  user: MockUser,
  ads: AdInventoryItem[],
  config: PlacementConfig,
  userEligibilityCache?: UserEligibilityCache
): AdRankResult[] {
  const segment = adBreak.precedingSegment;
  const results: AdRankResult[] = [];

  // Break-level context for reasoning
  const breakQuality = segment.ad_break_fitness?.post_segment_break_quality ?? "Low";
  const interruptionRisk = segment.ad_break_fitness?.interruption_risk ?? 0.5;
  const isBrandSafe = segment.brand_safety?.is_safe ?? true;
  const riskLevel = segment.brand_safety?.risk_level ?? "Low";

  for (const ad of ads) {
    const gateResults: { gate: string; passed: boolean; reason?: string }[] = [];
    let isDisqualified = false;
    const disqualificationReasons: string[] = [];

    // ── STEP 1: Hard Exclusion Gates ─────────────────────

    const eligibility = userEligibilityCache?.[ad.id] ?? null;

    // Gate A: Pre-calculated user eligibility (from affinityMatching)
    if (eligibility !== null && !eligibility.isEligible) {
      isDisqualified = true;
      const reason =
        eligibility.reasoning.find((r) => r.startsWith("EXCLUDED")) ??
        `User ineligible (score: ${eligibility.score}/100)`;
      disqualificationReasons.push(reason);
      gateResults.push({ gate: "A: User Eligibility", passed: false, reason });
    } else if (eligibility === null && user.exclusion_categories.includes(ad.category_key)) {
      // Fallback when no cache: check exclusion list directly
      isDisqualified = true;
      const reason = `"${ad.category_key}" is in ${user.name}'s exclusion list`;
      disqualificationReasons.push(reason);
      gateResults.push({ gate: "A: User Eligibility", passed: false, reason });
    } else {
      gateResults.push({ gate: "A: User Eligibility", passed: true });
    }

    // Gate B: Negative campaign contexts vs scene
    if (!isDisqualified) {
      const scenePool = [
        ...(segment.ad_suitability?.contextual_themes ?? []),
        ...(segment.activities ?? []),
        segment.environment ?? "",
      ].map((s) => s.toLowerCase());
      const negOverlap = (ad.negativeCampaignContexts ?? []).filter((neg) =>
        scenePool.some((ctx) => ctx.includes(neg.toLowerCase()))
      );
      if (negOverlap.length > 0) {
        isDisqualified = true;
        const reason = `Scene overlaps with negative campaign contexts: ${negOverlap.join(", ")}`;
        disqualificationReasons.push(reason);
        gateResults.push({ gate: "B: Scene Context", passed: false, reason });
      } else {
        gateResults.push({ gate: "B: Scene Context", passed: true });
      }
    }

    // Gate C: Alcohol + GARM cross-check
    if (!isDisqualified) {
      if (ad.category_key.startsWith("alcohol")) {
        const dangerousFlags = (segment.brand_safety?.garm_flags ?? []).filter(
          (f) =>
            (f.category.toLowerCase().includes("alcohol") ||
              f.category.toLowerCase().includes("drug") ||
              f.category.toLowerCase().includes("underage")) &&
            f.severity !== "Low Risk"
        );
        if (dangerousFlags.length > 0) {
          isDisqualified = true;
          const reason = `Alcohol ad blocked: GARM [${dangerousFlags.map((f) => f.category).join(", ")}]`;
          disqualificationReasons.push(reason);
          gateResults.push({ gate: "C: Brand Safety", passed: false, reason });
        } else {
          gateResults.push({ gate: "C: Brand Safety", passed: true });
        }
      } else {
        gateResults.push({ gate: "C: Brand Safety", passed: true });
      }
    }

    // Gate D: strict only blocks explicitly unsafe segments (same as before; modes mainly differ via score factors)
    if (!isDisqualified) {
      if (config.safetyMode === "strict" && !isBrandSafe) {
        isDisqualified = true;
        const reason = `Strict mode: segment is ${riskLevel} risk`;
        disqualificationReasons.push(reason);
        gateResults.push({ gate: "D: Safety Mode", passed: false, reason });
      } else {
        gateResults.push({ gate: "D: Safety Mode", passed: true });
      }
    }

    // ── STEP 2: Scoring ──────────────────────────────────
    //
    // Simple two-signal multiplicative model:
    //   adAffinity  = pre-calculated user→ad score (affinityMatching)
    //   sceneFit    = how well this ad category fits THIS scene
    //   totalScore  = adAffinity × sceneFit
    //
    // This respects the existing user-matching work (adInventory page)
    // and only adds the scene-placement judgment here.
    // ─────────────────────────────────────────────────────

    let scores: AdScores;
    let totalScore: number;
    let sceneFitResult: ReturnType<typeof computeSceneFit> | null = null;
    let adAffinity = 0;

    if (isDisqualified) {
      scores = {
        adAffinity: 0, sceneFit: 0,
        suitableMatch: 0, environmentFit: 0, toneCompat: 0, contextMatch: 0,
      };
      totalScore = -1;
    } else {
      // adAffinity: use the pre-calculated eligibility score directly.
      // This already accounts for category affinity, demographics, and
      // viewing context — no need to recompute here.
      if (eligibility) {
        adAffinity = Math.min(1.0, eligibility.score / 100);
      } else if (user.id === "generic") {
        adAffinity = 0.5;
      } else {
        adAffinity = user.ad_category_affinities[ad.category_key] ?? 0.3;
      }

      // sceneFit: how well does THIS specific ad match this scene?
      // Now includes per-ad creative content matching (Signal D),
      // so ads in the same category will score differently.
      sceneFitResult = computeSceneFit(ad, segment);

      // totalScore = adAffinity × sceneFit × placement mode (strict dampens edgy breaks; revenue_max lifts clean ones)
      const modeRank = placementModeAdRankFactor(config.safetyMode, segment);
      totalScore =
        Math.round(adAffinity * sceneFitResult.score * modeRank * 1000) / 1000;

      scores = {
        adAffinity: Math.round(adAffinity * 1000) / 1000,
        sceneFit: sceneFitResult.score,
        suitableMatch: Math.round(sceneFitResult.breakdown.suitableMatch * 1000) / 1000,
        environmentFit: Math.round(sceneFitResult.breakdown.environmentFit * 1000) / 1000,
        toneCompat: Math.round(sceneFitResult.breakdown.toneCompat * 1000) / 1000,
        contextMatch: Math.round(sceneFitResult.breakdown.contextMatch * 1000) / 1000,
      };
    }

    // ── STEP 3: Reasoning ────────────────────────────────

    let matchExplanation: string;
    if (isDisqualified) {
      matchExplanation = `Blocked: ${disqualificationReasons[0] ?? "Unknown"}`;
    } else {
      const affinityPct = Math.round(adAffinity * 100);
      const affinityDesc =
        affinityPct >= 70 ? "high affinity" : affinityPct >= 40 ? "moderate affinity" : "low affinity";

      const sceneFitScore = sceneFitResult?.score ?? 0;
      const sceneDesc =
        sceneFitScore >= 0.6 ? "strong scene fit" : sceneFitScore >= 0.35 ? "moderate scene fit" : "weak scene fit";

      const toneC = sceneFitResult?.breakdown.toneCompat ?? 0.4;
      const toneNote =
        toneC >= 0.7
          ? `${segment.tone} tone boosts this category`
          : toneC < 0.3
            ? `${segment.tone} tone clashes`
            : "";

      const vectorsAvail = sceneFitResult?.vectorsAvailable ?? false;
      const vecSim = sceneFitResult?.vectorSimilarity ?? null;
      const creativePart = vectorsAvail && vecSim !== null
        ? ` Semantic similarity: ${(Math.max(0, (vecSim + 1) / 2)).toFixed(2)}.`
        : " Embeddings pending.";

      const breakNote =
        interruptionRisk > 0.6
          ? ` High interruption risk (${Math.round(interruptionRisk * 100)}%).`
          : !isBrandSafe
            ? ` Brand safety flagged (${riskLevel}).`
            : ` ${breakQuality} break quality.`;

      matchExplanation = `${user.name}: ${affinityDesc} (${affinityPct}%). ${sceneDesc}${creativePart}${toneNote ? ` ${segment.tone} tone ${toneC >= 0.7 ? "boosts" : "clashes with"} this category.` : ""}${breakNote}`;
    }

    // ── Signal Chain ─────────────────────────────────────

    const signalChain: SignalChain = {
      segmentIndex: adBreak.segmentIndex,
      timestamp: adBreak.timestamp,
      segmentSentiment: segment.sentiment,
      segmentTone: segment.tone,
      segmentEnvironment: segment.environment,
      segmentThemes: segment.ad_suitability?.contextual_themes ?? [],
      segmentActivities: segment.activities ?? [],
      adTargetContexts: ad.targetContexts ?? [],
      contextMatchedTokens: [],
      vectorSimilarity: sceneFitResult?.vectorSimilarity ?? null,
      vectorsAvailable: sceneFitResult?.vectorsAvailable ?? false,
      userAffinityScore: adAffinity,
      eligibilityReasoning: eligibility?.reasoning ?? [],
      safetyMode: config.safetyMode,
      brandSafetyStatus: isBrandSafe,
      riskLevel,
      gateResults,
      scores,
      totalScore,
    };

    results.push({ ad, totalScore, isDisqualified, disqualificationReasons, scores, matchExplanation, signalChain });
  }

  results.sort((a, b) => b.totalScore - a.totalScore);
  return results;
}

/* ══════════════════════════════════════════════════════════════
   scoreAdUserEligibility
   Ported from affinityMatching/route.js for client-side use.
   Pure function: user + ad -> eligibility result.
   ══════════════════════════════════════════════════════════════ */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function extractHHI(tag: string): number | null {
  const match = String(tag).match(/hhi\s*\$(\d+)k\+/i);
  return match ? parseInt(match[1], 10) : null;
}

function inferAgeBand(demographics: string[]): { band: string; value: number } | null {
  for (const tag of demographics) {
    const t = String(tag).toLowerCase().trim();
    const rawAge = t.match(/^(\d{1,2})$/);
    if (rawAge) return { band: "exact", value: parseInt(rawAge[1], 10) };
    const decade = t.match(/^(\d)0s$/);
    if (decade) return { band: "decade", value: parseInt(decade[1], 10) * 10 };
    if (t.includes("teen")) return { band: "decade", value: 10 };
  }
  return null;
}

function inferHHI(demographics: string[]): number | null {
  let best: number | null = null;
  for (const tag of demographics) {
    const v = extractHHI(tag);
    if (v !== null) best = best === null ? v : Math.max(best, v);
  }
  return best;
}

function isAgeMatch(adTag: string, userTag: string): boolean {
  const ad = String(adTag).toLowerCase().trim();
  const user = String(userTag).toLowerCase().trim();
  const userAge = user.match(/^(\d+)$/);
  const age = userAge ? parseInt(userAge[1], 10) : null;

  const ADULT_TERMS = ["adults", "adult", "18+", "21+"];
  const UNDERAGE_TERMS = ["underage", "under 21", "teens", "teenagers", "youth"];
  const DECADE_PATTERN = /^(\d)0s$/;

  if (ADULT_TERMS.includes(ad)) {
    if (ADULT_TERMS.includes(user)) return true;
    if (age !== null && age >= 18) return true;
    if (DECADE_PATTERN.test(user)) return true;
  }
  if (UNDERAGE_TERMS.includes(ad)) {
    // Temporary override: do not treat Teenagers/Underage demographic tags
    // as broad negative blockers for non-alcohol categories.
    return false;
  }

  const adDecade = ad.match(DECADE_PATTERN);
  const userDecade = user.match(DECADE_PATTERN);
  if (adDecade && userDecade && adDecade[1] === userDecade[1]) return true;
  if (adDecade && age !== null) {
    const decadeStart = parseInt(adDecade[1], 10) * 10;
    if (age >= decadeStart && age < decadeStart + 10) return true;
  }

  return false;
}

function matchDemographics(
  adDemos: string[],
  userDemos: string[]
): { matches: string[] } {
  const matches: string[] = [];
  for (const adTag of adDemos) {
    const ad = String(adTag).toLowerCase().trim();
    const adHHI = extractHHI(ad);
    for (const userTag of userDemos) {
      const user = String(userTag).toLowerCase().trim();
      const userHHI = extractHHI(user);
      if (adHHI !== null && userHHI !== null) {
        if (userHHI >= adHHI) { matches.push(adTag); break; }
        continue;
      }
      if (["male", "female"].includes(ad) || ["male", "female"].includes(user)) {
        if (ad === user) { matches.push(adTag); break; }
        continue;
      }
      if (isAgeMatch(ad, user)) { matches.push(adTag); break; }
      if (user.includes(ad) || ad.includes(user)) { matches.push(adTag); break; }
    }
  }
  return { matches };
}

function computeInterestOverlap(
  userInterests: string[],
  adAffinities: string[]
): number {
  if (!adAffinities.length || !userInterests.length) return 0;
  const matched = adAffinities.filter((aff) => {
    const affNorm = String(aff).toLowerCase().replace(/_/g, " ").trim();
    return userInterests.some((interest) => {
      const intNorm = String(interest).toLowerCase().trim();
      return intNorm.includes(affNorm) || affNorm.includes(intNorm);
    });
  });
  return matched.length / adAffinities.length;
}

function computeHeuristicAffinityBoost(params: {
  userDemographics: string[];
  userInterests: string[];
  adCohortAffinities: string[];
  adCategoryKey: string;
}): { boost: number; boostReasons: string[] } {
  const { userDemographics, userInterests, adCohortAffinities, adCategoryKey } = params;
  const boostReasons: string[] = [];
  let boost = 0;

  const ageInfo = inferAgeBand(userDemographics);
  const age = ageInfo?.band === "exact" ? ageInfo.value : null;
  const decade = ageInfo?.band === "decade" ? ageInfo.value : null;
  const hhi = inferHHI(userDemographics);

  const interestsText = userInterests.join(" ").toLowerCase();
  const adTags = new Set(adCohortAffinities.map((t) => String(t).toLowerCase().trim()));

  const hasHealthSignal =
    interestsText.includes("health") ||
    interestsText.includes("wellness") ||
    interestsText.includes("fitness") ||
    interestsText.includes("active");
  const hasAutoSignal =
    interestsText.includes("auto") ||
    interestsText.includes("car") ||
    interestsText.includes("vehicle");
  const hasGamingSignal =
    interestsText.includes("gaming") || interestsText.includes("esports");

  if (adTags.has("health_wellness") || adTags.has("clean_label") || adTags.has("high_protein")) {
    if (hasHealthSignal) {
      boost += 0.14;
      boostReasons.push("health-focused viewer + clean-label/healthy snack signals");
    }
  }

  const isYounger = (age !== null && age < 25) || decade === 20 || decade === 10;
  if (isYounger) {
    if (adCategoryKey === "cpg_snacks" || adTags.has("snacking") || adTags.has("gaming")) {
      boost += 0.08;
      boostReasons.push("younger viewer tilt toward snacks/gaming");
    }
    if (adTags.has("sports_car") || adTags.has("performance_auto")) {
      boost += 0.08;
      boostReasons.push("younger viewer tilt toward performance auto");
    }
  }

  if (hasAutoSignal && (adCategoryKey.startsWith("automotive") || adTags.has("car_enthusiast"))) {
    boost += 0.08;
    boostReasons.push("auto interest alignment");
  }

  if (hasGamingSignal && adTags.has("gaming")) {
    boost += 0.08;
    boostReasons.push("gaming interest alignment");
  }

  const isOlderOrPlanning =
    (age !== null && age >= 30) || decade === 30 || decade === 40 || decade === 50;
  const isAffluent = hhi !== null && hhi >= 100;
  if (isOlderOrPlanning && isAffluent) {
    if (
      adCategoryKey === "financial_services" ||
      adTags.has("investing") ||
      adTags.has("retirement") ||
      adTags.has("planning")
    ) {
      boost += 0.1;
      boostReasons.push("older/affluent planning alignment");
    }
    if (
      adCategoryKey === "alcohol_premium" ||
      adTags.has("premium_spirits") ||
      adTags.has("luxury_goods") ||
      adTags.has("premium_lifestyle")
    ) {
      boost += 0.06;
      boostReasons.push("older/affluent premium alignment");
    }
  }

  boost = Math.min(0.2, boost);
  return { boost, boostReasons };
}

export function scoreAdUserEligibility(
  user: MockUser,
  ad: AdInventoryItem
): UserEligibilityResult {
  const reasoning: string[] = [];
  const scores = {
    categoryAffinity: 0,
    demographicFit: 0,
    viewingContextFit: 0,
    engagementMultiplier: 1.0,
  };

  const userExclusions = user.exclusion_categories ?? [];
  const userDemographics = user.demographics ?? [];
  const userInterests = user.interest_signals ?? [];
  const userAffinities = user.ad_category_affinities ?? {};
  const adCategoryKey = ad.category_key ?? "";
  const adTargetDemos = ad.targetDemographics ?? [];
  const adNegativeDemos = ad.negativeDemographics ?? [];
  const adCohortAffinities = ad.cohort_affinities ?? [];
  const ageInfo = inferAgeBand(userDemographics);
  const userAge = ageInfo?.band === "exact" ? ageInfo.value : null;

  // GATE 0: Hard Exclusions
  if (adCategoryKey && userExclusions.includes(adCategoryKey)) {
    reasoning.push(
      `EXCLUDED: "${adCategoryKey}" is blocked for ${user.name} (compliance: ${userExclusions.join(", ")})`
    );
    return { isEligible: false, score: 0, reasoning, scores };
  }

  if (userAge !== null && userAge < 21 && adCategoryKey.startsWith("alcohol")) {
    reasoning.push(
      `EXCLUDED: "${adCategoryKey}" is blocked for ${user.name} (under-21 alcohol policy).`
    );
    return { isEligible: false, score: 0, reasoning, scores };
  }

  if (adNegativeDemos.length > 0) {
    const negMatch = matchDemographics(adNegativeDemos, userDemographics);
    if (negMatch.matches.length > 0) {
      reasoning.push(
        `EXCLUDED: Viewer matches negative demographics (${negMatch.matches.join(", ")})`
      );
      return { isEligible: false, score: 0, reasoning, scores };
    }
  }

  // SCORE 1: Category Affinity (0-40 pts)
  if (user.id === "generic") {
    scores.categoryAffinity = 0.5;
    reasoning.push("Audience Affinity (20 pts): Generic viewer -- neutral baseline.");
  } else {
    const directAffinity = adCategoryKey ? (userAffinities[adCategoryKey] ?? 0) : 0;
    const interestOverlap = computeInterestOverlap(userInterests, adCohortAffinities);
    const baseAffinity = directAffinity * 0.7 + interestOverlap * 0.3;
    const { boost, boostReasons } = computeHeuristicAffinityBoost({
      userDemographics,
      userInterests,
      adCohortAffinities,
      adCategoryKey,
    });
    scores.categoryAffinity = clamp01(baseAffinity + boost);
    const affinityPts = Math.round(scores.categoryAffinity * 40);

    if (directAffinity >= 0.7) {
      reasoning.push(`Audience Affinity (+${affinityPts} pts): Strong affinity for ${adCategoryKey} (${(directAffinity * 100).toFixed(0)}%).`);
    } else if (directAffinity >= 0.4) {
      reasoning.push(`Audience Affinity (+${affinityPts} pts): Moderate affinity for ${adCategoryKey} (${(directAffinity * 100).toFixed(0)}%).`);
    } else if (directAffinity > 0) {
      reasoning.push(`Audience Affinity (+${affinityPts} pts): Weak affinity for ${adCategoryKey} (${(directAffinity * 100).toFixed(0)}%).`);
    } else {
      reasoning.push(`Audience Affinity (+0 pts): No recorded affinity for ${adCategoryKey || "this category"}.`);
    }
    if (boost > 0) {
      reasoning.push(`Heuristic Boost (+${Math.round(boost * 40)} pts): ${boostReasons.join("; ")}.`);
    }
  }

  // SCORE 2: Demographic Fit (0-30 pts)
  if (adTargetDemos.length > 0 && userDemographics.length > 0) {
    const demoResult = matchDemographics(adTargetDemos, userDemographics);
    const demoRatio = demoResult.matches.length / adTargetDemos.length;
    scores.demographicFit = demoRatio;
    const demoPts = Math.round(demoRatio * 30);
    if (demoPts > 0) {
      reasoning.push(`Demographics (+${demoPts} pts): Viewer matches ${demoResult.matches.length}/${adTargetDemos.length} preferred demographics.`);
    } else {
      reasoning.push(`Demographics (0 pts): No overlap with preferred demographics.`);
    }
  } else {
    scores.demographicFit = 0.5;
    reasoning.push("Demographics (15 pts): No demographic targeting specified -- neutral.");
  }

  // SCORE 3: Viewing Context Fit (0-15 pts)
  const daypart = user.viewing_context?.typical_daypart ?? "primetime";
  const device = user.viewing_context?.device_type ?? "ctv";

  const DAYPART_DEVICE_MATRIX: Record<string, Record<string, number>> = {
    primetime: { ctv: 1.0, mobile: 0.6, tablet: 0.7, desktop: 0.5 },
    late_night: { ctv: 0.9, mobile: 0.7, tablet: 0.7, desktop: 0.4 },
    daytime: { ctv: 0.5, mobile: 0.8, tablet: 0.8, desktop: 0.9 },
    morning: { ctv: 0.4, mobile: 0.8, tablet: 0.7, desktop: 0.9 },
  };

  const PREMIUM_CATEGORIES = [
    "alcohol_premium", "automotive_luxury", "fashion_luxury",
    "travel_luxury", "financial_services",
  ];
  const isPremiumAd = PREMIUM_CATEGORIES.includes(adCategoryKey);
  const baseContextScore = DAYPART_DEVICE_MATRIX[daypart]?.[device] ?? 0.5;
  scores.viewingContextFit = isPremiumAd
    ? baseContextScore
    : 0.4 + baseContextScore * 0.3;

  const contextPts = Math.round(scores.viewingContextFit * 15);
  reasoning.push(
    `Viewing Context (+${contextPts} pts): ${daypart} viewing on ${device.toUpperCase()}${isPremiumAd ? " (premium placement boost)" : ""}.`
  );

  // SCORE 4: Engagement Tier (multiplier)
  const ENGAGEMENT_MULTIPLIERS: Record<string, number> = { high: 1.15, medium: 1.0, low: 0.85 };
  scores.engagementMultiplier = ENGAGEMENT_MULTIPLIERS[user.engagement_tier] ?? 1.0;
  if (user.engagement_tier === "high") {
    reasoning.push("Engagement Boost (x1.15): High-engagement viewer.");
  } else if (user.engagement_tier === "low") {
    reasoning.push("Engagement Penalty (x0.85): Low-engagement viewer.");
  }

  // COMPOSITE
  const rawScore =
    scores.categoryAffinity * 40 +
    scores.demographicFit * 30 +
    scores.viewingContextFit * 15 +
    15;
  const finalScore = Math.round(Math.min(100, rawScore * scores.engagementMultiplier));

  return {
    isEligible: finalScore > 15,
    score: finalScore,
    reasoning,
    scores,
  };
}

/* ══════════════════════════════════════════════════════════════
   buildUserEligibilityCache
   Pre-computes eligibility for all ads for a given user.
   ══════════════════════════════════════════════════════════════ */

export function buildUserEligibilityCache(
  user: MockUser,
  ads: AdInventoryItem[]
): UserEligibilityCache {
  const cache: UserEligibilityCache = {};
  for (const ad of ads) {
    cache[ad.id] = scoreAdUserEligibility(user, ad);
  }
  return cache;
}

/* ══════════════════════════════════════════════════════════════
   selectAdsWithDiversity
  Wraps rankAdsForBreak across all breaks and enforces three
   cross-break diversity constraints:
    1. The same specific ad should not repeat across future breaks.
    2. The same specific ad cannot win consecutive breaks.
    3. The same category cannot win more than ceil(N/2) breaks.
   When a top candidate is suppressed, the next-ranked eligible
   ad takes the slot.
   ══════════════════════════════════════════════════════════════ */

import type { DiversityPlanEntry } from "./types";

export function selectAdsWithDiversity(
  adBreaks: AdBreakCandidate[],
  user: MockUser,
  ads: AdInventoryItem[],
  config: PlacementConfig,
  eligibilityCache: UserEligibilityCache
): DiversityPlanEntry[] {
  const maxSameCategory = Math.ceil(adBreaks.length / 2);
  const categoryCounts: Record<string, number> = {};
  let previousWinnerId: string | null = null;
  const usedWinnerIds = new Set<string>();

  const plan: DiversityPlanEntry[] = [];

  for (let i = 0; i < adBreaks.length; i++) {
    const adBreak = adBreaks[i];
    const rankedAds = rankAdsForBreak(adBreak, user, ads, config, eligibilityCache).map((r) => {
      // Hard exclude ads that already won prior breaks so they are not
      // considered (or displayed as eligible) in future breaks.
      if (!r.isDisqualified && usedWinnerIds.has(r.ad.id)) {
        return {
          ...r,
          isDisqualified: true,
          disqualificationReasons: [
            ...r.disqualificationReasons,
            "Excluded by diversity: ad already selected at an earlier break",
          ],
          totalScore: -1,
          matchExplanation: `Disqualified: Excluded by diversity (already selected at an earlier break).`,
        };
      }
      return r;
    });
    const eligible = rankedAds.filter((r) => !r.isDisqualified);

    let selectedAd: AdRankResult | null = null;
    let diversityApplied = false;
    let diversityReason: string | undefined;

    for (const candidate of eligible) {
      const catKey = candidate.ad.category_key;

      // Rule 1: do not reuse an ad already selected at earlier breaks
      if (usedWinnerIds.has(candidate.ad.id)) {
        diversityApplied = true;
        diversityReason = `${candidate.ad.brand} already selected at an earlier break`;
        continue;
      }

      // Rule 2: no consecutive same ad
      if (candidate.ad.id === previousWinnerId) {
        diversityApplied = true;
        diversityReason = `${candidate.ad.brand} already placed at previous break`;
        continue;
      }

      // Rule 3: category cap
      if ((categoryCounts[catKey] ?? 0) >= maxSameCategory) {
        diversityApplied = true;
        diversityReason = `${catKey.replace(/_/g, " ")} already placed at ${categoryCounts[catKey]} of ${maxSameCategory} allowed breaks`;
        continue;
      }

      selectedAd = candidate;
      break;
    }

    // Fallback: if all were suppressed by diversity, use the top eligible anyway
    if (!selectedAd && eligible.length > 0) {
      selectedAd = eligible[0];
      if (diversityReason) {
        diversityReason += " (fallback: all alternatives exhausted)";
      }
    }

    if (selectedAd) {
      const catKey = selectedAd.ad.category_key;
      categoryCounts[catKey] = (categoryCounts[catKey] ?? 0) + 1;
      previousWinnerId = selectedAd.ad.id;
      usedWinnerIds.add(selectedAd.ad.id);
    }

    plan.push({
      breakIndex: i,
      timestamp: adBreak.timestamp,
      breakScore: adBreak.score,
      rankedAds,
      selectedAd,
      diversityApplied,
      diversityReason,
    });
  }

  return plan;
}
