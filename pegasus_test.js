
const fs = require('fs');
const { TwelvelabsApiClient } = require('twelvelabs-js');

// REPLACE HERE.
const TL_API_KEY = '';
const TL_ASSET_ID = '';
const IAB_CSV_PATH = 'C:/Users/natha/OneDrive/Desktop/Coding/Projects/Consulting/TwelveLabs/contextual-ad-engine/public/Content Taxonomy 3.1.csv';

const tl_client = new TwelvelabsApiClient({
    apiKey: TL_API_KEY,
})

function loadIABCSV(csv_path) {
    const csv = fs.readFileSync(csv_path, 'utf8');
    const lines = csv.split('\n');

    let IAB_DATA = {};
    let nodeMap = {}; // Temporary dictionary to hold all rows for relationship tracing

    // PASS 1: Register all rows and initialize Tier 1 categories
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = line.split(',');
        const id = values[0]?.trim();
        const parentId = values[1]?.trim();
        const name = values[2]?.trim();

        if (!id) continue;

        // Store every row in the temporary map
        nodeMap[id] = { id, parentId, name };

        // If there is no parent ID, it is a root Tier 1 category
        if (!parentId) {
            IAB_DATA[id] = {
                tier1: name,
                tier2: [],
                tier3: [],
                tier4: [], // Included based on the columns visible in your image
                code: id
            };
        }
    }

    // PASS 2: Trace lineage and place Tier 2/3/4 items into their root Tier 1 parent
    for (const id in nodeMap) {
        const node = nodeMap[id];
        
        // Skip Tier 1 nodes as they are already the root keys
        if (!node.parentId) continue; 

        // Trace up the tree to find the root Tier 1 ID and determine the tier depth
        let current = node;
        let depth = 1;
        
        while (current.parentId && nodeMap[current.parentId]) {
            current = nodeMap[current.parentId];
            depth++;
        }

        const rootTier1Id = current.id;

        // Push the child node into the correct array of its Tier 1 root
        if (IAB_DATA[rootTier1Id]) {
            const childObject = { 
                id: node.id, 
                parentId: node.parentId, 
                name: node.name 
            };
            
            if (depth === 2) {
                IAB_DATA[rootTier1Id].tier2.push(childObject);
            } else if (depth === 3) {
                IAB_DATA[rootTier1Id].tier3.push(childObject);
            } else if (depth === 4) {
                IAB_DATA[rootTier1Id].tier4.push(childObject);
            }
        }
    }

    return IAB_DATA;
}

async function IAB_Analysis(assetId) {
    const IAB_DATA = loadIABCSV(IAB_CSV_PATH);
    const tier1IabIds = Object.keys(IAB_DATA).filter((id) => typeof id === 'string' && id.length > 0);
    const tier1IabNames = tier1IabIds
        .map((id) => IAB_DATA[id]?.tier1)
        .filter((name) => typeof name === 'string' && name.length > 0);
    const tier1NameToId = Object.fromEntries(
        tier1IabIds
            .map((id) => [IAB_DATA[id]?.tier1, id])
            .filter(([name, id]) => typeof name === 'string' && name.length > 0 && typeof id === 'string')
    );
    const finalAdTechTimeline = [];

    async function waitForTask(taskId) {
        while (true) {
            const task = await tl_client.analyzeAsync.tasks.retrieve(taskId);
            console.log(`Task ${taskId} status: ${task.status}`);
            if (task.status === "ready") return task;
            if (task.status === "failed") {
                throw new Error(task.error?.message || `Task ${taskId} failed`);
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }

    async function classifyExactIabId({ startTime, endTime, parentId, candidates, parentName }) {
        if (!candidates || candidates.length === 0) return parentId;

        const candidatePairs = candidates
            .map((item) => ({ id: item?.id, name: item?.name }))
            .filter((item) => typeof item.id === 'string' && item.id.length > 0 && typeof item.name === 'string' && item.name.length > 0);
        const candidateIds = candidatePairs.map((item) => item.id);
        const candidateNames = candidatePairs.map((item) => item.name);
        const candidateNameToId = Object.fromEntries(candidatePairs.map((item) => [item.name, item.id]));
        const candidateOptions = candidatePairs.map((item) => `${item.name} (${item.id})`).join('\n');

        const prompt = `Look strictly at the scene from ${startTime} seconds to ${endTime} seconds. It falls under the broad category of ${parentName}. Classify this specific scene into the most accurate sub-category from this list ONLY:\n${candidateOptions}\n\nRespond with valid JSON in this exact format: {"sub_category":"<exact category name from the list>"}.`;

        try {
            let response;

            response = await tl_client.analyze({
                videoId: assetId,
                prompt,
                start: startTime,
                end: endTime,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        type: 'object',
                        properties: {
                            sub_category: {
                                type: 'string',
                                enum: candidateNames
                            }
                        },
                        required: ['sub_category']
                    }
                }
            }, {
                timeoutInSeconds: 90
            });

            console.log('RESPONSE: ', response);
            
            const rawText = response?.data ?? response?.text ?? response;
            const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
            console.log('PARSED: ', parsed);

            const rawValue = parsed?.sub_category || parsed?.category || parsed?.exact_iab_id || Object.values(parsed || {})[0];
            if (!rawValue || typeof rawValue !== 'string') {
                console.warn(`Failed to extract string from parsed object for scene ${startTime}-${endTime}`);
                return parentId;
            }

            const selectedName = rawValue.trim();
            const mappedId = candidateNameToId[selectedName];

            console.log('SELECTED NAME: ', selectedName);
            console.log('MAPPED ID: ', mappedId);

            return candidateIds.includes(mappedId) ? mappedId : parentId;
        } catch (error) {
            console.error(`Failed to classify sub-tier ${startTime}-${endTime}:`, error?.message || error);
            return parentId;
        }
    }

    console.log("TIER 1 IAB:", tier1IabNames);

    const sceneTask = await tl_client.analyzeAsync.tasks.create({
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
                    id: "scene_classification",
                    description: "A visually and contextually distinct scene in the video.",
                    fields: [
                        {
                            name: "tier_1_iab_category",
                            type: "string",
                            description: "The exact IAB Content Taxonomy 3.1 Tier 1 ID that best describes this specific scene.",
                            enum: tier1IabNames
                        }
                    ],
                },
            ],
        },
        minSegmentDuration: 5.0,
        maxSegmentDuration: 30.0,
    });

    const completedSceneTask = await waitForTask(sceneTask.taskId);
    const scenePayload = completedSceneTask.result?.data;
    const parsedScenePayload = typeof scenePayload === 'string' ? JSON.parse(scenePayload) : scenePayload;
    const scenesTimeline = parsedScenePayload?.scene_classification || [];

    for (const scene of scenesTimeline) {
        const start = scene.startTime ?? scene.start_time ?? scene.start;
        const end = scene.endTime ?? scene.end_time ?? scene.end;
        const t1Name = scene.metadata?.tier_1_iab_category;
        const t1Id = tier1NameToId[t1Name];

        console.log('SCENE: ', scene);

        if (!t1Id || !IAB_DATA[t1Id]) continue;

        let finalIabId = t1Id;
        let t2Id = null;
        let t3Id = null;
        let t4Id = null;
        let parentName = IAB_DATA[t1Id].tier1;

        const t2Candidates = IAB_DATA[t1Id].tier2.filter((node) => node.parentId === t1Id);
        console.log('T2 CANDIDATES: ', t2Candidates);
        
        finalIabId = await classifyExactIabId({
            startTime: start,
            endTime: end,
            parentId: finalIabId,
            candidates: t2Candidates,
            parentName
        });
        t2Id = finalIabId !== t1Id ? finalIabId : null;

        const t3Candidates = IAB_DATA[t1Id].tier3.filter((node) => node.parentId === finalIabId);
        if (t3Candidates.length > 0) {
            parentName = (t2Candidates.find((n) => n.id === finalIabId) || {}).name || parentName;
            finalIabId = await classifyExactIabId({
                startTime: start,
                endTime: end,
                parentId: finalIabId,
                candidates: t3Candidates,
                parentName
            });
            t3Id = finalIabId !== t2Id ? finalIabId : null;
        }
        console.log('T3 CANDIDATES: ', t3Candidates);

        const t4Candidates = IAB_DATA[t1Id].tier4.filter((node) => node.parentId === finalIabId);
        if (t4Candidates.length > 0) {
            parentName = (
                t3Candidates.find((n) => n.id === finalIabId) ||
                t2Candidates.find((n) => n.id === finalIabId) ||
                {}
            ).name || parentName;
            finalIabId = await classifyExactIabId({
                startTime: start,
                endTime: end,
                parentId: finalIabId,
                candidates: t4Candidates,
                parentName
            });
            t4Id = finalIabId !== t3Id ? finalIabId : null;
        }

        console.log('T4 CANDIDATES: ', t4Candidates);

        finalAdTechTimeline.push({
            start,
            end,
            t1_iab_id: t1Id,
            t2_iab_id: t2Id,
            t3_iab_id: t3Id,
            t4_iab_id: t4Id,
            final_iab_id: finalIabId
        });

        console.log('SCENE CLASSIFICATION:', {
            start,
            end,
            t1_iab_id: t1Id,
            t2_iab_id: t2Id,
            t3_iab_id: t3Id,
            t4_iab_id: t4Id,
            final_iab_id: finalIabId
        });
    }

    console.log(JSON.stringify(finalAdTechTimeline, null, 2));
    return finalAdTechTimeline;

} 

IAB_Analysis(TL_ASSET_ID);