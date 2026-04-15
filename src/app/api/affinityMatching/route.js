import { NextResponse } from "next/server";

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

function inferAgeBand(demographics) {
    for (const tag of demographics || []) {
        const t = String(tag).toLowerCase().trim();
        const rawAge = t.match(/^(\d{1,2})$/);
        if (rawAge) return { band: "exact", value: parseInt(rawAge[1], 10) };
        const decade = t.match(/^(\d)0s$/);
        if (decade) return { band: "decade", value: parseInt(decade[1], 10) * 10 };
        if (t.includes("teen")) return { band: "decade", value: 10 };
    }
    return null;
}

function inferHHI(demographics) {
    let best = null;
    for (const tag of demographics || []) {
        const v = extractHHI(tag);
        if (v !== null) best = best === null ? v : Math.max(best, v);
    }
    return best;
}

function computeHeuristicAffinityBoost({ userDemographics, userInterests, adCohortAffinities, adCategoryKey }) {
    const boostReasons = [];
    let boost = 0;

    const ageInfo = inferAgeBand(userDemographics);
    const age = ageInfo?.band === "exact" ? ageInfo.value : null;
    const decade = ageInfo?.band === "decade" ? ageInfo.value : null;
    const hhi = inferHHI(userDemographics);

    const interestsText = (userInterests || []).join(" ").toLowerCase();
    const adTags = new Set((adCohortAffinities || []).map((t) => String(t).toLowerCase().trim()));

    const hasHealthSignal =
        interestsText.includes("health") ||
        interestsText.includes("wellness") ||
        interestsText.includes("fitness") ||
        interestsText.includes("active");
    const hasAutoSignal = interestsText.includes("auto") || interestsText.includes("car") || interestsText.includes("vehicle");
    const hasGamingSignal = interestsText.includes("gaming") || interestsText.includes("esports");

    // Healthy snacks: health-focused viewers get a strong (but capped) deterministic boost
    if (adTags.has("health_wellness") || adTags.has("clean_label") || adTags.has("high_protein")) {
        if (hasHealthSignal) {
            boost += 0.14;
            boostReasons.push("health-focused viewer + clean-label/healthy snack signals");
        }
    }

    // Youth tilt: snacks, gaming, sports cars
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

    // Auto enthusiasts get a boost when ad is auto/performance oriented
    if (hasAutoSignal && (adCategoryKey.startsWith("automotive") || adTags.has("car_enthusiast"))) {
        boost += 0.08;
        boostReasons.push("auto interest alignment");
    }

    // Gaming interest alignment
    if (hasGamingSignal && adTags.has("gaming")) {
        boost += 0.08;
        boostReasons.push("gaming interest alignment");
    }

    // Affluent/older tilt: finance/luxury/premium spirits
    const isOlderOrPlanning = (age !== null && age >= 30) || decade === 30 || decade === 40 || decade === 50;
    const isAffluent = hhi !== null && hhi >= 100;
    if (isOlderOrPlanning && isAffluent) {
        if (adCategoryKey === "financial_services" || adTags.has("investing") || adTags.has("retirement") || adTags.has("planning")) {
            boost += 0.10;
            boostReasons.push("older/affluent planning alignment");
        }
        if (adCategoryKey === "alcohol_premium" || adTags.has("premium_spirits") || adTags.has("luxury_goods") || adTags.has("premium_lifestyle")) {
            boost += 0.06;
            boostReasons.push("older/affluent premium alignment");
        }
    }

    // Safety cap: keep deterministic boost small relative to direct affinity
    boost = Math.min(0.2, boost);

    return { boost, boostReasons };
}

function computeInterestOverlap(userInterests, adAffinities) {
    if (!Array.isArray(adAffinities) || adAffinities.length === 0) return 0;
    if (!Array.isArray(userInterests) || userInterests.length === 0) return 0;

    const matches = adAffinities.filter((aff) => {
        const affNorm = String(aff).toLowerCase().replace(/_/g, " ").trim();
        return userInterests.some((interest) => {
            const intNorm = String(interest).toLowerCase().trim();
            return intNorm.includes(affNorm) || affNorm.includes(intNorm);
        });
    });

    return matches.length / adAffinities.length;
}

function findMatchingInterests(userInterests, adAffinities) {
    if (!Array.isArray(adAffinities) || adAffinities.length === 0) return [];
    if (!Array.isArray(userInterests) || userInterests.length === 0) return [];

    return userInterests.filter((interest) => {
        const intNorm = String(interest).toLowerCase().trim();
        return adAffinities.some((aff) => {
            const affNorm = String(aff).toLowerCase().replace(/_/g, " ").trim();
            return intNorm.includes(affNorm) || affNorm.includes(intNorm);
        });
    });
}

function extractHHI(tag) {
    const match = String(tag).match(/hhi\s*\$(\d+)k\+/i);
    return match ? parseInt(match[1], 10) : null;
}

function isAgeMatch(adTag, userTag) {
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
        // Temporary override: do not use Teenagers/Underage demographic tags
        // as broad blockers. Alcohol under-21 policy is handled separately.
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

function matchDemographics(adDemos, userDemos) {
    const matches = [];

    for (const adTag of adDemos || []) {
        const ad = String(adTag).toLowerCase().trim();
        const adHHI = extractHHI(ad);

        for (const userTag of userDemos || []) {
            const user = String(userTag).toLowerCase().trim();
            const userHHI = extractHHI(user);

            if (adHHI !== null && userHHI !== null) {
                if (userHHI >= adHHI) {
                    matches.push(adTag);
                    break;
                }
                continue;
            }

            if (["male", "female"].includes(ad) || ["male", "female"].includes(user)) {
                if (ad === user) {
                    matches.push(adTag);
                    break;
                }
                continue;
            }

            if (isAgeMatch(ad, user)) {
                matches.push(adTag);
                break;
            }

            if (user.includes(ad) || ad.includes(user)) {
                matches.push(adTag);
                break;
            }
        }
    }

    return { matches };
}

function scoreAdUserEligibility(user, ad) {
    const reasoning = [];
    const scores = {
        categoryAffinity: 0,
        demographicFit: 0,
        viewingContextFit: 0,
        engagementMultiplier: 1.0,
    };

    const userExclusions = Array.isArray(user?.exclusion_categories) ? user.exclusion_categories : [];
    const userDemographics = Array.isArray(user?.demographics) ? user.demographics : [];
    const userInterests = Array.isArray(user?.interest_signals) ? user.interest_signals : [];
    const userAffinities = user?.ad_category_affinities && typeof user.ad_category_affinities === "object" ? user.ad_category_affinities : {};

    const adCategoryKey = ad?.category_key ? String(ad.category_key) : "";
    const adTargetDemos = Array.isArray(ad?.targetDemographics) ? ad.targetDemographics : [];
    const adNegativeDemos = Array.isArray(ad?.negativeDemographics) ? ad.negativeDemographics : [];
    const adCohortAffinities = Array.isArray(ad?.cohort_affinities) ? ad.cohort_affinities : [];
    const ageInfo = inferAgeBand(userDemographics);
    const userAge = ageInfo?.band === "exact" ? ageInfo.value : null;

    // GATE 0: Hard Exclusions
    if (adCategoryKey && userExclusions.includes(adCategoryKey)) {
        reasoning.push(
            `EXCLUDED: "${adCategoryKey}" is blocked for ${user?.name || "viewer"} ` +
            `(compliance: ${userExclusions.join(", ")})`
        );
        return { isEligible: false, score: 0, reasoning, scores, bestSegment: null };
    }

    if (userAge !== null && userAge < 21 && adCategoryKey.startsWith("alcohol")) {
        reasoning.push(
            `EXCLUDED: "${adCategoryKey}" is blocked for ${user?.name || "viewer"} ` +
            `(under-21 alcohol policy).`
        );
        return { isEligible: false, score: 0, reasoning, scores, bestSegment: null };
    }

    if (adNegativeDemos.length > 0) {
        const negMatch = matchDemographics(adNegativeDemos, userDemographics);
        if (negMatch.matches.length > 0) {
            reasoning.push(
                `EXCLUDED: Viewer matches negative demographics (${negMatch.matches.join(", ")})`
            );
            return { isEligible: false, score: 0, reasoning, scores, bestSegment: null };
        }
    }

    // SCORE 1: Category Affinity (0–40 pts)
    if (user?.id === "generic") {
        scores.categoryAffinity = 0.5;
        reasoning.push(
            `Audience Affinity (20 pts): Generic viewer — neutral baseline.`
        );
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
        const matchedInterests = findMatchingInterests(userInterests, adCohortAffinities);

        if (directAffinity >= 0.7) {
            reasoning.push(
                `Audience Affinity (+${affinityPts} pts): Strong affinity for ${adCategoryKey} ` +
                `(${(directAffinity * 100).toFixed(0)}%). ` +
                `Matching interests: ${matchedInterests.join(", ") || "category-level match"}.`
            );
        } else if (directAffinity >= 0.4) {
            reasoning.push(
                `Audience Affinity (+${affinityPts} pts): Moderate affinity for ${adCategoryKey} ` +
                `(${(directAffinity * 100).toFixed(0)}%).`
            );
        } else if (directAffinity > 0) {
            reasoning.push(
                `Audience Affinity (+${affinityPts} pts): Weak affinity for ${adCategoryKey} ` +
                `(${(directAffinity * 100).toFixed(0)}%).`
            );
        } else {
            reasoning.push(
                `Audience Affinity (+0 pts): No recorded affinity for ${adCategoryKey || "this category"}.`
            );
        }

        if (boost > 0) {
            const boostPts = Math.round(boost * 40);
            reasoning.push(
                `Heuristic Boost (+${boostPts} pts): ${boostReasons.join("; ")}.`
            );
        }
    }

    // SCORE 2: Demographic Fit (0–30 pts)
    if (adTargetDemos.length > 0 && userDemographics.length > 0) {
        const demoResult = matchDemographics(adTargetDemos, userDemographics);
        const demoRatio = demoResult.matches.length / adTargetDemos.length;
        scores.demographicFit = demoRatio;

        const demoPts = Math.round(demoRatio * 30);
        if (demoPts > 0) {
            reasoning.push(
                `Demographics (+${demoPts} pts): Viewer matches ${demoResult.matches.length}` +
                `/${adTargetDemos.length} preferred demographics (${demoResult.matches.join(", ")}).`
            );
        } else {
            reasoning.push(
                `Demographics (0 pts): No overlap with preferred demographics (${adTargetDemos.join(", ")}).`
            );
        }
    } else {
        scores.demographicFit = 0.5;
        reasoning.push(`Demographics (15 pts): No demographic targeting specified — neutral.`);
    }

    // SCORE 3: Viewing Context Fit (0–15 pts)
    const viewingContext = user?.viewing_context || {};
    const daypart = viewingContext?.typical_daypart || "primetime";
    const device = viewingContext?.device_type || "ctv";

    const DAYPART_DEVICE_MATRIX = {
        primetime: { ctv: 1.0, mobile: 0.6, tablet: 0.7, desktop: 0.5 },
        late_night: { ctv: 0.9, mobile: 0.7, tablet: 0.7, desktop: 0.4 },
        daytime: { ctv: 0.5, mobile: 0.8, tablet: 0.8, desktop: 0.9 },
        morning: { ctv: 0.4, mobile: 0.8, tablet: 0.7, desktop: 0.9 },
    };

    const PREMIUM_CATEGORIES = [
        "alcohol_premium",
        "automotive_luxury",
        "fashion_luxury",
        "travel_luxury",
        "financial_services",
    ];
    const isPremiumAd = PREMIUM_CATEGORIES.includes(adCategoryKey);

    const baseContextScore = (DAYPART_DEVICE_MATRIX[daypart] && DAYPART_DEVICE_MATRIX[daypart][device]) ?? 0.5;

    scores.viewingContextFit = isPremiumAd
        ? baseContextScore
        : 0.4 + baseContextScore * 0.3;

    const contextPts = Math.round(scores.viewingContextFit * 15);
    reasoning.push(
        `Viewing Context (+${contextPts} pts): ${daypart} viewing on ${String(device).toUpperCase()}` +
        `${isPremiumAd ? " (premium placement boost)" : ""}.`
    );

    // SCORE 4: Engagement Tier (multiplier)
    const ENGAGEMENT_MULTIPLIERS = { high: 1.15, medium: 1.0, low: 0.85 };
    const engagementTier = user?.engagement_tier || "medium";
    scores.engagementMultiplier = ENGAGEMENT_MULTIPLIERS[engagementTier] ?? 1.0;

    if (engagementTier === "high") {
        reasoning.push(`Engagement Boost (×1.15): High-engagement viewer — premium ad tier eligible.`);
    } else if (engagementTier === "low") {
        reasoning.push(`Engagement Penalty (×0.85): Low-engagement viewer — reduced ad value.`);
    }

    // COMPOSITE SCORE
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
        bestSegment: null,
    };
}

function normalizeAdPayload(raw) {
    const ad = raw && typeof raw === "object" ? raw : {};

    // Backward-compatible aliases
    if (ad.categoryKey && !ad.category_key) ad.category_key = ad.categoryKey;
    if (ad.cohortAffinities && !ad.cohort_affinities) ad.cohort_affinities = ad.cohortAffinities;

    // Ensure arrays where needed
    if (!Array.isArray(ad.targetDemographics) && ad.targetDemographics != null) {
        ad.targetDemographics = String(ad.targetDemographics).split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(ad.negativeDemographics) && ad.negativeDemographics != null) {
        ad.negativeDemographics = String(ad.negativeDemographics).split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(ad.cohort_affinities) && ad.cohort_affinities != null) {
        ad.cohort_affinities = String(ad.cohort_affinities).split(",").map(s => s.trim()).filter(Boolean);
    }

    return ad;
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { userCohort } = body || {};
        const adRaw = body?.ad ?? body?.adData;

        if (!userCohort || !adRaw) {
            return NextResponse.json({ error: "Missing required fields: userCohort, ad" }, { status: 400 });
        }

        const ad = normalizeAdPayload(adRaw);
        const result = scoreAdUserEligibility(userCohort, ad);

        return NextResponse.json(result, { status: 200 });

    } catch (error) {
        console.error("Affinity Matching Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}