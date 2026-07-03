import { getSingletonHighlighter, type BundledLanguage } from "shiki";

const THEME = "dark-plus" as const;

const LANG_MAP: Record<string, BundledLanguage> = {
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  sql: "sql",
  json: "json",
};

let highlighterReady: ReturnType<typeof getSingletonHighlighter> | null = null;

function getHighlighter() {
  if (!highlighterReady) {
    highlighterReady = getSingletonHighlighter({
      themes: [THEME],
      langs: ["javascript", "typescript", "sql", "json"],
    });
  }
  return highlighterReady;
}

function resolveLanguage(language: string): BundledLanguage {
  return LANG_MAP[language.toLowerCase()] ?? "javascript";
}

export async function highlightCode(code: string, language: string): Promise<string> {
  const highlighter = await getHighlighter();
  const lang = resolveLanguage(language);
  return highlighter.codeToHtml(code, { lang, theme: THEME });
}
