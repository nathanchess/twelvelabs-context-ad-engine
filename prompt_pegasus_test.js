require('dotenv').config();
const { TwelvelabsApiClient } = require('twelvelabs-js');

const TL_API_KEY = process.env.TL_API_KEY || '';

const tl_client = new TwelvelabsApiClient({
    apiKey: TL_API_KEY,
})

function formatAnalyzeAsyncResult({ data, outputTokens }) {
    if (data == null) {
        return { outputTokens, data: null };
    }
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return { outputTokens, data: JSON.parse(data) };
            } catch {
                return { outputTokens, data };
            }
        }
        return { outputTokens, data };
    }
    return { outputTokens, data };
}

function printAnalyzeAsyncResult(result) {
    console.log(JSON.stringify(formatAnalyzeAsyncResult(result), null, 2));
}

async function generate_ad_plan(assetId) {

   const task = await tl_client.analyzeAsync.tasks.create({
    modelName: 'pegasus1.5',
    video: {
        type: 'asset_id',
        assetId: assetId
    },
    analysisMode: 'time_based_metadata',
    responseFormat: {
        type: 'segment_definitions',
        segmentDefinitions: [
            {
                id: 'scene',
                description: 'A narratively or thematically cohesive segment suitable for CTV ad break planning. Group consecutive shots into the broadest meaningful unit rather than splitting on every visual change. Intros, recaps, title sequences, and cold opens each constitute a single segment regardless of internal cuts.',
                fields: [
                    {
                        name: 'scene_context',
                        type: 'string',
                        description: 'One concise sentence describing the scene, referencing cast by name',
                    },
                    {
                        name: 'environment',
                        type: 'string',
                        description: 'Environment of the scene'
                    },
                    {
                        name: 'cast_present',
                        type: 'array',
                        description: 'Names of cast members visible or speaking',
                        items: {
                            type: 'string',
                        }
                    }, 
                    {
                        name: 'activities',
                        type: 'array',
                        description: 'Key activities in the scene. Title case.',
                        items: {
                            type: 'string',
                        }
                    },
                    {
                        name: 'objects_of_interest',
                        type: 'array',
                        description: 'Notable objects in the scene. Title case.',
                        items: {
                            type: 'string',
                        }
                    },
                    {
                        name: 'sentiment',
                        type: 'string',
                        description: 'Sentiment of the scene',
                        enum: ['Positive', 'Neutral', 'Negative', 'Mixed']
                    },
                    {
                        name: 'emotional_intensity',
                        type: 'number',
                        description: 'Emotional intensity of the scene',
                        minimum: 0,
                        maximum: 1,
                    },
                    {
                        name: 'tone',
                        type: 'string',
                        description: 'Tone of the scene',
                        enum: ['Celebratory', 'Romantic', 'Tense', 'Comedic', 'Somber', 'Inspirational', 'Casual', 'Dramatic', 'Action', 'Informational']
                    },
                    // segment_definitions fields must be primitives or arrays of primitives — no nested objects.
                    {
                        name: 'brand_safety_is_safe',
                        type: 'boolean',
                        description: 'Whether the scene is safe for advertising.',
                    },
                    {
                        name: 'brand_safety_risk_level',
                        type: 'string',
                        description: 'Overall brand-safety risk level for the scene.',
                        enum: ['Low', 'Medium', 'High'],
                    },
                    {
                        name: 'brand_safety_garm_flags',
                        type: 'array',
                        description:
                            'GARM issues for this scene. Each entry is one pipe-delimited string: CATEGORY|SEVERITY|EVIDENCE where SEVERITY is one of Floor Violation, High Risk, Medium Risk, Low Risk. Use an empty array if none.',
                        items: {
                            type: 'string',
                            description: 'One flag as CATEGORY|SEVERITY|EVIDENCE',
                        },
                    },
                    {
                        name: 'ad_suitable_categories',
                        type: 'array',
                        description: 'Product or vertical categories that would suit ads in this scene.',
                        items: { type: 'string', description: 'A suitable category label' },
                    },
                    {
                        name: 'ad_unsuitable_categories',
                        type: 'array',
                        description: 'Categories that would be a poor or unsafe fit for ads in this scene.',
                        items: { type: 'string', description: 'An unsuitable category label' },
                    },
                    {
                        name: 'ad_contextual_themes',
                        type: 'array',
                        description: 'Short contextual theme labels for ad targeting (e.g. sports, family, finance).',
                        items: { type: 'string', description: 'A theme label' },
                    },
                    {
                        name: 'ad_suitability_confidence',
                        type: 'number',
                        description: 'Model confidence (0–1) for the suitability judgments above.',
                        minimum: 0,
                        maximum: 1,
                    },
                    {
                        name: 'ad_break_post_segment_break_quality',
                        type: 'string',
                        description: 'Quality of a hypothetical ad break immediately after this segment.',
                        enum: ['High', 'Medium', 'Low'],
                    },
                    {
                        name: 'ad_break_break_type',
                        type: 'string',
                        description: 'How the scene transitions at the end (relevant to placing an ad break).',
                        enum: ['Hard Cut', 'Fade', 'Narrative Pause', 'Topic Shift', 'None'],
                    },
                    {
                        name: 'ad_break_interruption_risk',
                        type: 'number',
                        description: 'How jarring an ad would feel at segment end (0 = seamless, 1 = very disruptive).',
                        minimum: 0,
                        maximum: 1,
                    },
                    {
                        name: 'ad_break_reasoning',
                        type: 'string',
                        description: 'Brief reasoning for ad break fitness scores, referencing concrete scene content.',
                    },
                ]   
            }
        ]
    },
    maxTokens: 65536,
   })

    const taskId = task.taskId;
    
    while (true) {
        const waitTask = await tl_client.analyzeAsync.tasks.retrieve(taskId);
        console.log(`Task ${taskId} status: ${waitTask.status}`);

        if (waitTask.status === 'ready') {
            const data = waitTask.result?.data;
            const outputTokens = waitTask.result?.outputTokens;
            return { data, outputTokens };
        }
        if (waitTask.status === 'failed') {
            throw new Error(waitTask.error?.message || `Task ${taskId} failed`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error(`Task ${taskId} timed out`);

}

async function main() {
    const TL_ASSET_ID = '69d5ee36973ca4e1ca50d0e1';
    const result = await generate_ad_plan(TL_ASSET_ID);
    printAnalyzeAsyncResult(result);
}

main().catch((error) => {
    console.error('Execution failed:', error?.message || error);
    process.exit(1);
});