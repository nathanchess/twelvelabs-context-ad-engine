/**
 * Shared SQL text for exporting ad metadata to Databricks Delta.
 * Used by the export modal (preview) and POST /api/databricks/export (execution).
 */

export type AdMetadataExportRow = {
  creativeId: string;
  campaignName: string;
  durationSeconds: number;
  extractedVisualContexts: string;
  targetDemographics: string;
  negativeDemographics: string;
  targetAudienceAffinity: string;
  negativeCampaignContexts: string;
  brandSafetyGarm: string;
  /** JSON array of floats, Marengo multimodal (clip-averaged). Use in Mosaic / Vector Search via from_json(..., 'array<double>'). */
  marengoEmbeddingJson: string;
  embeddingDim: number;
  /** e.g. twelvelabs_marengo */
  embeddingModel: string;
  vectorSyncStatus: string;
};

/** SQL-safe suffix from display category name, e.g. "Luxury Spirits" -> luxury_spirits */
export function sanitizeCategoryTableSuffix(categoryName: string): string {
  const s = categoryName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "category";
}

function escapeSqlString(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function backtickIdent(part: string): string {
  return "`" + String(part).replace(/`/g, "") + "`";
}

/**
 * `catalog`.`schema`.`table` when catalog is non-empty; otherwise `schema`.`table`
 * (uses the SQL warehouse session default catalog — common for Unity Catalog).
 */
export function buildQualifiedTableName(
  catalog: string,
  schema: string,
  tableName: string
): string {
  const t = backtickIdent(tableName);
  const s = backtickIdent(schema);
  const c = catalog.trim();
  if (!c) {
    return `${s}.${t}`;
  }
  return `${backtickIdent(c)}.${s}.${t}`;
}

/**
 * Builds a single CREATE OR REPLACE TABLE ... AS SELECT * FROM VALUES statement
 * targeting `catalog`.`schema`.`ad_metadata_{suffix}`, or `schema`.`ad_metadata_{suffix}`
 * if catalog is empty.
 */
export function buildAdMetadataExportSql({
  catalog,
  schema,
  categoryName,
  rows,
}: {
  catalog: string;
  schema: string;
  categoryName: string;
  rows: AdMetadataExportRow[];
}): string {
  const suffix = sanitizeCategoryTableSuffix(categoryName);
  const tableId = `ad_metadata_${suffix}`;
  const fqTable = buildQualifiedTableName(catalog, schema, tableId);

  const colList = `creative_id, campaign_name, duration_sec, extracted_visual_contexts, target_demographics, negative_demographics, target_audience_affinity, negative_campaign_contexts, brand_safety_garm, marengo_embedding_json, embedding_dim, embedding_model, vector_sync_status`;

  if (rows.length === 0) {
    return `-- Ad metadata export (empty): ${categoryName}
-- Target: ${fqTable}
-- Mosaic AI Vector Search: column marengo_embedding_json is a JSON array string; cast with from_json(marengo_embedding_json, 'array<double>') for VECTOR SEARCH / embedding indexes.
CREATE OR REPLACE TABLE ${fqTable} AS
SELECT
  CAST('' AS STRING) AS creative_id,
  CAST('' AS STRING) AS campaign_name,
  CAST(0 AS INT) AS duration_sec,
  CAST('' AS STRING) AS extracted_visual_contexts,
  CAST('' AS STRING) AS target_demographics,
  CAST('' AS STRING) AS negative_demographics,
  CAST('' AS STRING) AS target_audience_affinity,
  CAST('' AS STRING) AS negative_campaign_contexts,
  CAST('' AS STRING) AS brand_safety_garm,
  CAST('' AS STRING) AS marengo_embedding_json,
  CAST(0 AS INT) AS embedding_dim,
  CAST('' AS STRING) AS embedding_model,
  CAST('' AS STRING) AS vector_sync_status
WHERE 1 = 0;
`;
  }

  const valueLines = rows.map((r) => {
    const dur = Number.isFinite(r.durationSeconds) ? Math.max(0, Math.floor(r.durationSeconds)) : 0;
    return (
      `  ('${escapeSqlString(r.creativeId)}', ` +
      `'${escapeSqlString(r.campaignName)}', ` +
      `${dur}, ` +
      `'${escapeSqlString(r.extractedVisualContexts)}', ` +
      `'${escapeSqlString(r.targetDemographics)}', ` +
      `'${escapeSqlString(r.negativeDemographics)}', ` +
      `'${escapeSqlString(r.targetAudienceAffinity)}', ` +
      `'${escapeSqlString(r.negativeCampaignContexts)}', ` +
      `'${escapeSqlString(r.brandSafetyGarm)}', ` +
      `'${escapeSqlString(r.marengoEmbeddingJson)}', ` +
      `${Number.isFinite(r.embeddingDim) ? Math.max(0, Math.floor(r.embeddingDim)) : 0}, ` +
      `'${escapeSqlString(r.embeddingModel)}', ` +
      `'${escapeSqlString(r.vectorSyncStatus)}')`
    );
  });

  const locHint = catalog.trim()
    ? `${catalog.trim()}.${schema.trim()}.${tableId}`
    : `(default catalog).${schema.trim()}.${tableId}`;
  return `-- Ad metadata export: ${categoryName}
-- Target Delta table: ${locHint}
-- marengo_embedding_json: JSON text of float[] (TwelveLabs Marengo, clip-averaged per creative).
-- For Databricks Vector Search / Mosaic: create a view with embedding ARRAY<DOUBLE> = from_json(marengo_embedding_json, 'array<double>'), then index that column (primary key e.g. creative_id).
CREATE OR REPLACE TABLE ${fqTable} AS
SELECT * FROM VALUES
${valueLines.join(",\n")}
AS v(${colList});
`;
}

/**
 * Empty string = two-part `schema.table` using the SQL warehouse session default catalog
 * (correct for Unity Catalog–only workspaces where hive_metastore is disabled).
 * Set DATABRICKS_CATALOG to a UC catalog name (from Data Explorer) when you want three-part names.
 */
export function defaultCatalog(): string {
  const v = process.env.DATABRICKS_CATALOG;
  if (v == null || String(v).trim() === "") return "";
  return String(v).trim();
}

export function defaultSchema(): string {
  return process.env.DATABRICKS_SCHEMA?.trim() || "default";
}
