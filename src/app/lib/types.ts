/* ══════════════════════════════════════════════════════════════
   Shared types for the Contextual Ad Engine
   ══════════════════════════════════════════════════════════════ */

// ── GARM / Brand Safety ──────────────────────────────────────

export interface GarmFlag {
  category: string;
  severity: "Floor Violation" | "High Risk" | "Medium Risk" | "Low Risk";
  evidence: string;
}

export interface BrandSafety {
  is_safe: boolean;
  risk_level: "Low" | "Medium" | "High";
  garm_flags: GarmFlag[];
}

// ── Ad Suitability ───────────────────────────────────────────

export interface AdSuitability {
  suitable_categories: string[];
  unsuitable_categories?: string[];
  contextual_themes: string[];
  confidence: number;
}

// ── IAB Taxonomy (for standards-compatible ad requests) ─────

export interface IabTaxonomyItem {
  /** Tier-1 IAB category label (broad). */
  tier1: string;
  /** Tier-2 IAB category label (subcategory). */
  tier2: string;
  /** Tier-3 taxonomy label (more specific leaf), when available. */
  tier3?: string;
  /** IAB taxonomy code when available (e.g. "IAB1-5"). */
  code: string;
  /** Model confidence score in [0, 1]. */
  confidence: number;
}

export interface IabTaxonomySummary {
  iab: IabTaxonomyItem[];
  iabTopTier1: string[];
  iabTopTier2: string[];
  iabTopTier3?: string[];
}

// ── Ad Break Fitness ─────────────────────────────────────────

export interface AdBreakFitness {
  post_segment_break_quality: "High" | "Medium" | "Low";
  break_type: "Hard Cut" | "Fade" | "Narrative Pause" | "Topic Shift" | "None";
  interruption_risk: number;
  reasoning?: string;
}

// ── Segment (from generateAdPlan) ────────────────────────────

export interface Segment {
  start_time: number;
  end_time: number;
  scene_context: string;
  environment: string;
  cast_present?: string[];
  activities?: string[];
  objects_of_interest?: string[];
  sentiment: "Positive" | "Neutral" | "Negative" | "Mixed";
  emotional_intensity: number;
  tone:
    | "Celebratory"
    | "Romantic"
    | "Tense"
    | "Comedic"
    | "Somber"
    | "Inspirational"
    | "Casual"
    | "Dramatic"
    | "Action"
    | "Informational";
  brand_safety: BrandSafety;
  ad_suitability: AdSuitability;
  ad_break_fitness: AdBreakFitness;
  /** TwelveLabs Marengo embedding vector — averaged over clip segments in this time range. */
  vector?: number[];
}

// ── Cast ─────────────────────────────────────────────────────

export interface CastMember {
  name: string;
  role?: string;
  description: string;
}

// ── Demo viewer personas (not real users; used for affinity simulation) ──

export interface MockUser {
  id: string;
  name: string;
  demographics: string[];
  interest_signals: string[];
  ad_category_affinities: Record<string, number>;
  content_preferences: string[];
  exclusion_categories: string[];
  viewing_context: {
    device_type: "ctv" | "mobile" | "tablet" | "desktop";
    typical_daypart: "morning" | "daytime" | "primetime" | "late_night";
  };
  engagement_tier: "high" | "medium" | "low";
  dma_region: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: "ethan",
    name: "Ethan",
    demographics: ["Male", "30s", "Urban", "HHI $100K+"],
    interest_signals: [
      "Luxury goods", "High-end", "Premium spirits", "Liquor",
      "Alcohol", "Travel", "Vacation", "Resorts", "Fine Dining",
    ],
    ad_category_affinities: {
      alcohol_premium: 0.95,
      travel_luxury: 0.90,
      fashion_luxury: 0.80,
      automotive_luxury: 0.75,
      financial_services: 0.70,
      technology: 0.60,
      alcohol_beer: 0.40,
      cpg_food: 0.30,
      fitness_wellness: 0.25,
    },
    content_preferences: ["Drama", "Thriller", "Documentary", "Late Night"],
    exclusion_categories: [],
    viewing_context: { device_type: "ctv", typical_daypart: "primetime" },
    engagement_tier: "high",
    dma_region: "New York",
  },
  {
    id: "sarah",
    name: "Sarah",
    demographics: ["Female", "40s", "Suburban", "HHI $150K+"],
    interest_signals: [
      "Automotive", "Cars", "Vehicles", "Home improvement", "DIY",
      "Renovation", "Fitness", "Sports Enthusiasts",
      "Health & Wellness", "Active Lifestyle",
    ],
    ad_category_affinities: {
      automotive_truck: 0.55,
      automotive_luxury: 0.80,
      home_improvement: 0.95,
      fitness_wellness: 0.90,
      insurance: 0.65,
      financial_services: 0.70,
      retail_general: 0.60,
      cpg_food: 0.50,
      pharmaceutical: 0.45,
      travel_adventure: 0.55,
    },
    content_preferences: ["Reality TV", "Home & Garden", "Competition", "Sports"],
    exclusion_categories: [],
    viewing_context: { device_type: "ctv", typical_daypart: "primetime" },
    engagement_tier: "high",
    dma_region: "Chicago",
  },
  {
    id: "nathan",
    name: "Nathan",
    demographics: ["Male", "19", "College Student", "Urban", "HHI $45K+"],
    interest_signals: [
      "Gaming", "Video Games", "Esports", "Fast Food", "QSR",
      "Music", "Concerts", "Entertainment", "Movies",
      "Pop Culture", "Gen-Z",
    ],
    ad_category_affinities: {
      cpg_snacks: 0.95,
      qsr_fast_food: 0.95,
      technology: 0.85,
      telecom: 0.70,
      retail_general: 0.65,
      entertainment: 0.80,
      fitness_wellness: 0.30,
      automotive_truck: 0.55,
      financial_services: 0.50,
    },
    content_preferences: ["Action", "Comedy", "Anime", "Sports", "Gaming"],
    exclusion_categories: [],
    viewing_context: { device_type: "mobile", typical_daypart: "late_night" },
    engagement_tier: "medium",
    dma_region: "Los Angeles",
  },
  {
    id: "generic",
    name: "Generic",
    demographics: [],
    interest_signals: [],
    ad_category_affinities: {},
    content_preferences: [],
    exclusion_categories: [],
    viewing_context: { device_type: "ctv", typical_daypart: "primetime" },
    engagement_tier: "medium",
    dma_region: "National",
  },
];

// ── Ad Inventory Item ────────────────────────────────────────

export interface AdInventoryItem {
  id: string;
  brand: string;
  category_key: string;
  slug: string;
  asset_url: string;
  thumbnailUrl?: string;
  targetContexts: string[];
  negativeCampaignContexts: string[];
  targetDemographics: string[];
  negativeDemographics: string[];
  cohort_affinities: string[];
  brandSafetyGARM: string[];
  priority: number;
  summary?: string;
  proposedTitle?: string;
  /** TwelveLabs Marengo embedding vector — averaged over all clip segments for this ad. */
  vector?: number[];
}

// ── Placement Config ─────────────────────────────────────────

export interface PlacementConfig {
  safetyMode: "strict" | "balanced" | "revenue_max";
  maxBreaks: number;
  minSegmentDuration: number;
  minSpacingSeconds: number;
  scoringWeights: {
    contextAffinity: number;
    cohortAffinity: number;
    sentimentAlignment: number;
    suitabilityConfidence: number;
    adPriority: number;
  };
}

export const DEFAULT_PLACEMENT_CONFIG: PlacementConfig = {
  safetyMode: "balanced",
  maxBreaks: 4,
  minSegmentDuration: 30,
  minSpacingSeconds: 120,
  scoringWeights: {
    contextAffinity: 0.30,
    cohortAffinity: 0.25,
    sentimentAlignment: 0.15,
    suitabilityConfidence: 0.15,
    adPriority: 0.15,
  },
};

// ── Ad Break Candidate (output of identifyAdBreaks) ──────────

export interface AdBreakReasoning {
  breakQuality: string;
  breakQualityScore: number;
  interruptionRisk: number;
  interruptionScore: number;
  emotionalDrop: number;
  valleyBonus: number;
  breakType: string;
  transitionBonus: number;
  safetyMultiplier: number;
  /** strict / balanced / revenue_max adjustment (uses sentiment, tone, interruption when GARM is flat) */
  placementModeFactor: number;
  rawScore: number;
  finalScore: number;
}

export interface AdBreakCandidate {
  segmentIndex: number;
  timestamp: number;
  score: number;
  precedingSegment: Segment;
  followingSegment: Segment;
  reasoning: AdBreakReasoning;
}

// ── Ad Rank Result (output of rankAdsForBreak) ───────────────

export interface AdScores {
  // Pre-calculated user→ad suitability (from buildUserEligibilityCache / affinityMatching)
  adAffinity: number;        // 0-1: how well this ad suits this user
  // Scene context fit (computed by computeSceneFit)
  sceneFit: number;          // 0-1: overall scene fit (all sub-signals combined)
  // sceneFit sub-signals
  suitableMatch: number;     // 0-1: category taxonomy vs suitable_categories
  environmentFit: number;    // 0-1: ad category vs environment type
  toneCompat: number;        // 0-1: ad category vs scene emotional tone
  contextMatch: number;      // 0-1: THIS specific ad's creative content vs scene (per-ad differentiator)
}

export interface SignalChain {
  segmentIndex: number;
  timestamp: number;
  segmentSentiment: string;
  segmentTone: string;
  segmentEnvironment: string;
  segmentThemes: string[];
  segmentActivities: string[];
  adTargetContexts: string[];
  contextMatchedTokens: string[];   // kept for backward compat; empty when using vector similarity
  vectorSimilarity: number | null;  // raw cosine similarity (-1 to 1), null if vectors unavailable
  vectorsAvailable: boolean;        // true when both ad.vector and segment.vector exist
  userAffinityScore: number;
  eligibilityReasoning: string[];   // reasoning lines from scoreAdUserEligibility
  safetyMode: string;
  brandSafetyStatus: boolean;
  riskLevel: string;
  gateResults: { gate: string; passed: boolean; reason?: string }[];
  scores: AdScores;
  totalScore: number;
}

export interface AdRankResult {
  ad: AdInventoryItem;
  totalScore: number;
  isDisqualified: boolean;
  disqualificationReasons: string[];
  scores: AdScores;
  matchExplanation: string;
  signalChain: SignalChain;
}

// ── Diversity Plan (output of selectAdsWithDiversity) ────────

export interface DiversityPlanEntry {
  breakIndex: number;
  timestamp: number;
  breakScore: number;
  rankedAds: AdRankResult[];
  selectedAd: AdRankResult | null;
  diversityApplied: boolean;
  diversityReason?: string;
}

// ── User Eligibility (from affinityMatching logic) ───────────

export interface UserEligibilityResult {
  isEligible: boolean;
  score: number;
  reasoning: string[];
  scores: {
    categoryAffinity: number;
    demographicFit: number;
    viewingContextFit: number;
    engagementMultiplier: number;
  };
}

export type UserEligibilityCache = Record<string, UserEligibilityResult>;
