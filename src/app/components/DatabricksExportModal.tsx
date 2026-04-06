"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Check, Loader2, Circle } from "lucide-react";
import {
  buildAdMetadataExportSql,
  buildQualifiedTableName,
  sanitizeCategoryTableSuffix,
  type AdMetadataExportRow,
} from "../lib/databricksExportSql";
import OverviewCodeBlock from "./OverviewCodeBlock";

type RunPhase = "idle" | "submitting" | "running" | "uploading" | "complete" | "error";

const PHASE_ORDER = ["submitting", "running", "uploading"] as const;

const STEPS: { key: (typeof PHASE_ORDER)[number]; label: string }[] = [
  { key: "submitting", label: "Submitting SQL statement" },
  { key: "running", label: "Running on SQL warehouse" },
  { key: "uploading", label: "Uploading rows to Delta table" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  categoryName: string;
  rows: AdMetadataExportRow[];
};

export default function DatabricksExportModal({ open, onClose, categoryName, rows }: Props) {
  const [catalog, setCatalog] = useState("");
  const [schema, setSchema] = useState("default");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [lastServerSql, setLastServerSql] = useState<string | null>(null);
  const furthestStepIdx = useRef(-1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/databricks", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.catalog === "string") setCatalog(data.catalog);
        if (typeof data.schema === "string" && data.schema.trim()) setSchema(data.schema.trim());
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setRunPhase("idle");
      setRunError(null);
      setLastServerSql(null);
      furthestStepIdx.current = -1;
    }
  }, [open]);

  const tableSuffix = useMemo(() => sanitizeCategoryTableSuffix(categoryName), [categoryName]);

  const displayTablePath = useMemo(() => {
    const tableId = `ad_metadata_${tableSuffix}`;
    return buildQualifiedTableName(catalog, schema, tableId)
      .replace(/`/g, "")
      .split(".")
      .join(".");
  }, [catalog, schema, tableSuffix]);

  const sqlPreview = useMemo(
    () =>
      buildAdMetadataExportSql({
        catalog,
        schema,
        categoryName,
        rows,
      }),
    [catalog, schema, categoryName, rows]
  );

  const runExport = useCallback(async () => {
    setRunError(null);
    setLastServerSql(null);
    furthestStepIdx.current = 0;
    setRunPhase("submitting");

    let tick: ReturnType<typeof setInterval> | undefined;
    tick = setInterval(() => {
      setRunPhase((p) => {
        if (p === "submitting") {
          furthestStepIdx.current = Math.max(furthestStepIdx.current, 1);
          return "running";
        }
        if (p === "running") {
          furthestStepIdx.current = Math.max(furthestStepIdx.current, 2);
          return "uploading";
        }
        return p;
      });
    }, 1100);

    try {
      const res = await fetch("/api/databricks/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryName,
          catalog,
          schema,
          rows,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data.sql === "string") setLastServerSql(data.sql);

      if (!res.ok) {
        setRunError(typeof data.error === "string" ? data.error : "Export failed");
        furthestStepIdx.current = Math.max(furthestStepIdx.current, 2);
        setRunPhase("error");
        return;
      }
      furthestStepIdx.current = 2;
      setRunPhase("complete");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Network error");
      setRunPhase("error");
    } finally {
      if (tick) clearInterval(tick);
    }
  }, [categoryName, catalog, schema, rows]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="databricks-export-title"
    >
      <div className="w-full max-w-[720px] max-h-[90vh] flex flex-col rounded-2xl border border-border-light bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border-light shrink-0">
          <div>
            <h2 id="databricks-export-title" className="text-base font-semibold text-text-primary">
              Export to Databricks
            </h2>
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              Delta table{" "}
              <span className="font-mono text-text-secondary">{displayTablePath}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">
          <p className="text-xs text-text-secondary leading-relaxed">
            Unity Catalog–only workspaces cannot use <span className="font-mono text-[11px]">hive_metastore</span>
            . Leave catalog empty to use your SQL warehouse&apos;s{" "}
            <span className="font-semibold text-text-primary">default catalog</span>, and set schema to one you can
            write to (see Data Explorer). Rows: {rows.length}. Marengo vectors are in{" "}
            <span className="font-mono text-[11px]">marengo_embedding_json</span> (JSON float array) for Vector Search.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                Catalog
              </span>
              <input
                type="text"
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border-light bg-white font-mono text-xs text-text-primary placeholder:text-text-tertiary"
                placeholder="Empty = default UC catalog"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                Schema
              </span>
              <input
                type="text"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border-light bg-white font-mono text-xs text-text-primary placeholder:text-text-tertiary"
                placeholder="default"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed -mt-1">
            Optional: set <span className="font-mono">Catalog</span> to a UC name from Data Explorer for a
            three-part name. In Compute → your SQL warehouse → Configuration, confirm{" "}
            <span className="font-semibold text-text-secondary">Default catalog</span> / schema if exports fail.
          </p>

          <OverviewCodeBlock
            filename={`ad_metadata_${tableSuffix}.sql`}
            language="sql"
            code={lastServerSql && runPhase === "complete" ? lastServerSql : sqlPreview}
          />

          <div className="rounded-xl border border-border-light bg-gray-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-3">
              Run SQL statement
            </p>
            <ul className="space-y-2.5">
              {STEPS.map((step, i) => {
                const currentIdx =
                  runPhase === "idle" || runPhase === "complete" || runPhase === "error"
                    ? -1
                    : PHASE_ORDER.indexOf(runPhase as (typeof PHASE_ORDER)[number]);
                const done =
                  runPhase === "complete" ||
                  (runPhase !== "error" && currentIdx > i) ||
                  (runPhase === "error" && i < furthestStepIdx.current);
                const active = runPhase !== "error" && currentIdx === i;
                const failedHere = runPhase === "error" && i === furthestStepIdx.current;
                return (
                  <li key={step.key} className="flex items-center gap-2.5 text-xs">
                    {done ? (
                      <Check className="w-4 h-4 text-mb-green-dark shrink-0" strokeWidth={2.5} />
                    ) : failedHere ? (
                      <span
                        className="w-4 h-4 rounded-full border-2 border-red-500 shrink-0 inline-block"
                        aria-hidden
                      />
                    ) : active ? (
                      <Loader2 className="w-4 h-4 text-text-primary shrink-0 animate-spin" />
                    ) : (
                      <Circle className="w-4 h-4 text-border-light shrink-0" strokeWidth={1.5} />
                    )}
                    <span
                      className={
                        done
                          ? "text-text-secondary"
                          : active || failedHere
                            ? failedHere
                              ? "font-medium text-red-600"
                              : "font-medium text-text-primary"
                            : "text-text-tertiary"
                      }
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center gap-2.5 text-xs">
                {runPhase === "complete" ? (
                  <Check className="w-4 h-4 text-mb-green-dark shrink-0" strokeWidth={2.5} />
                ) : runPhase === "error" ? (
                  <span className="w-4 h-4 rounded-full bg-red-500 shrink-0" aria-hidden />
                ) : (
                  <Circle className="w-4 h-4 text-border-light shrink-0" strokeWidth={1.5} />
                )}
                <span
                  className={
                    runPhase === "complete"
                      ? "font-medium text-mb-green-dark"
                      : runPhase === "error"
                        ? "font-medium text-red-600"
                        : "text-text-tertiary"
                  }
                >
                  {runPhase === "complete"
                    ? "Complete"
                    : runPhase === "error"
                      ? "Failed"
                      : "Pending"}
                </span>
              </li>
            </ul>
            {runError && (
              <div className="mt-3 border-t border-border-light pt-3 space-y-2">
                <p className="text-xs text-red-600 leading-relaxed whitespace-pre-wrap">{runError}</p>
                {runError.includes("UC_HIVE_METASTORE_DISABLED") ||
                runError.includes("Hive Metastore") ? (
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Your workspace has legacy Hive Metastore access off. You do not need to change
                    permissions for that. Clear <span className="font-mono">Catalog</span> above (default) so
                    SQL uses your warehouse&apos;s Unity Catalog default, or enter your UC catalog name from
                    Data Explorer. Enabling Hive Metastore would require an admin and federation; using UC is
                    the normal path.
                  </p>
                ) : null}
                {runError.includes("SCHEMA_NOT_FOUND") || runError.includes("cannot be found") ? (
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Pick a catalog and schema that exist under Unity Catalog in Data Explorer, or leave
                    catalog empty and set <span className="font-mono">Schema</span> to a schema your user can
                    write to. If you then see a permission error, an admin must grant{" "}
                    <span className="font-mono text-text-primary">USE CATALOG</span>,{" "}
                    <span className="font-mono text-text-primary">USE SCHEMA</span>, and{" "}
                    <span className="font-mono text-text-primary">CREATE TABLE</span> on that schema.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary border border-border-light hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={runPhase === "submitting" || runPhase === "running" || runPhase === "uploading"}
            onClick={runExport}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-text-primary hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-opacity cursor-pointer"
          >
            {runPhase === "submitting" || runPhase === "running" || runPhase === "uploading"
              ? "Working…"
              : runPhase === "complete"
                ? "Run again"
                : "Run SQL statement"}
          </button>
        </div>
      </div>
    </div>
  );
}
