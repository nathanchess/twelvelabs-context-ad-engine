import { NextResponse } from "next/server";

/**
 * Databricks integration status (no side effects at import time).
 * Export runs via POST /api/databricks/export
 */
export async function GET() {
  const configured = Boolean(
    process.env.DATABRICKS_TOKEN &&
      process.env.DATABRICKS_HOST &&
      process.env.DATABRICKS_HTTP_PATH
  );
  const cat = process.env.DATABRICKS_CATALOG;
  const catalog =
    cat == null || String(cat).trim() === "" ? "" : String(cat).trim();

  return NextResponse.json({
    configured,
    catalog,
    schema: process.env.DATABRICKS_SCHEMA?.trim() || "default",
  });
}
