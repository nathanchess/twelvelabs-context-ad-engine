"use client";

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
}

/** README / deploy docs; override with NEXT_PUBLIC_GITHUB_SOURCE_URL if the repo moves */
const DEFAULT_SOURCE_REPO =
    process.env.NEXT_PUBLIC_GITHUB_SOURCE_URL ||
    "https://github.com/nathanchess/paramount-context-ad-engine";

/**
 * API credentials are not collected in the browser. Copy explains internal TwelveLabs ownership
 * and links to GitHub for local deployment details.
 */
export default function SettingsModal({ open, onClose }: SettingsModalProps) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-gray-700/40 backdrop-blur-[2px] animate-fade-in" />

            <div
                className="relative bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-4 animate-modal-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-border-light">
                    <h2 className="text-lg font-semibold text-text-primary">Configuration</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-gray-50 transition-colors duration-200"
                        aria-label="Close settings"
                    >
                        <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
                            <path d="M6.02051 5.31348L8.9668 2.36719L9.67383 3.07422L6.72754 6.02051L9.65332 8.94629L8.94629 9.65332L6.02051 6.72754L3.07422 9.67383L2.36719 8.9668L5.31348 6.02051L2.34668 3.05371L3.05371 2.34668L6.02051 5.31348Z" fill="currentColor" />
                            <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" fill="currentColor" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-6 space-y-4 text-sm text-text-secondary leading-relaxed">
                    <p>
                        API keys and integration credentials for this deployment are{" "}
                        <span className="font-medium text-text-primary">managed directly by TwelveLabs internal team members</span>.
                        They are not configurable through this interface.
                    </p>
                    <p>
                        If you need to run or configure the app yourself (for example a local deployment), use the
                        source repository: environment variables such as{" "}
                        <span className="font-mono text-text-primary">TL_API_KEY</span>,{" "}
                        <span className="font-mono text-text-primary">BLOB_READ_WRITE_TOKEN</span>, and optional{" "}
                        <span className="font-mono text-text-primary">DATABRICKS_*</span> are documented there for
                        analyze, search, video listing, generation, Vercel Blob caching, and the ad metadata SQL export.
                    </p>
                    <a
                        href={DEFAULT_SOURCE_REPO}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-border-light bg-gray-50 text-sm font-medium text-text-primary hover:bg-gray-100 hover:border-border-default transition-colors"
                    >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden>
                            <path
                                fillRule="evenodd"
                                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                            />
                        </svg>
                        GitHub — source &amp; local setup
                    </a>
                    <p className="text-xs text-text-tertiary">
                        Keys are never stored in the browser; exposing them in a deployed UI would be unsafe for a
                        public demo.
                    </p>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-full bg-gray-700 text-white text-sm font-medium hover:bg-gray-600 transition-all duration-200 hover:rounded-2xl"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
