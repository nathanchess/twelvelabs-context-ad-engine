import { NextResponse } from "next/server";
import {
  buildAdMetadataExportSql,
  defaultCatalog,
  defaultSchema,
} from "../../../lib/databricksExportSql";
import { executeSql } from "../_lib/runSql";

const MAX_ROWS = 500;
const MAX_FIELD_LEN = 8000;
/** Marengo ~512 floats as JSON can exceed 8k */
const MAX_EMBEDDING_JSON_LEN = 400000;

function normalizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ROWS).map((r) => ({
    creativeId: String(r.creativeId ?? "").slice(0, MAX_FIELD_LEN),
    campaignName: String(r.campaignName ?? "").slice(0, MAX_FIELD_LEN),
    durationSeconds: Number(r.durationSeconds) || 0,
    extractedVisualContexts: String(r.extractedVisualContexts ?? "").slice(0, MAX_FIELD_LEN),
    targetDemographics: String(r.targetDemographics ?? "").slice(0, MAX_FIELD_LEN),
    negativeDemographics: String(r.negativeDemographics ?? "").slice(0, MAX_FIELD_LEN),
    targetAudienceAffinity: String(r.targetAudienceAffinity ?? "").slice(0, MAX_FIELD_LEN),
    negativeCampaignContexts: String(r.negativeCampaignContexts ?? "").slice(0, MAX_FIELD_LEN),
    brandSafetyGarm: String(r.brandSafetyGarm ?? "").slice(0, MAX_FIELD_LEN),
    marengoEmbeddingJson: String(r.marengoEmbeddingJson ?? "").slice(0, MAX_EMBEDDING_JSON_LEN),
    embeddingDim: Number(r.embeddingDim) || 0,
    embeddingModel: String(r.embeddingModel ?? "").slice(0, 128),
    vectorSyncStatus: String(r.vectorSyncStatus ?? "").slice(0, MAX_FIELD_LEN),
  }));
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const categoryName = body?.categoryName;
  if (typeof categoryName !== "string" || !categoryName.trim()) {
    return NextResponse.json({ error: "categoryName is required" }, { status: 400 });
  }

  const rows = normalizeRows(body?.rows);

  const catalog =
    body && typeof body === "object" && "catalog" in body && typeof body.catalog === "string"
      ? body.catalog.trim()
      : defaultCatalog();

  const schema =
    body && typeof body === "object" && "schema" in body && typeof body.schema === "string" && body.schema.trim()
      ? body.schema.trim()
      : defaultSchema();

  const sql = buildAdMetadataExportSql({
    catalog,
    schema,
    categoryName: categoryName.trim(),
    rows,
  });

  try {
    await executeSql(sql);
    return NextResponse.json({ ok: true, sql });
  } catch (e) {
    const code = e && e.code;
    if (code === "DATABRICKS_NOT_CONFIGURED") {
      return NextResponse.json({ ok: false, error: e.message, sql }, { status: 503 });
    }
    console.error("[databricks/export]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Export failed", sql },
      { status: 500 }
    );
  }
}
