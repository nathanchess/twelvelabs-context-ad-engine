"use client";

import {
  Button,
  CloseIcon,
  IconButton,
  Text,
} from "@twelvelabs-io/react";

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
}

const DEFAULT_SOURCE_REPO ="https://github.com/nathanchess/twelvelabs-context-ad-engine/tree/main";

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
            <div className="absolute inset-0 bg-surface-primary/40 backdrop-blur-[2px] animate-fade-in" />

            <div
                className="relative bg-surface-white rounded-2xl shadow-lg w-full max-w-[480px] mx-4 animate-modal-in border border-border-secondary"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-border-secondary">
                    <Text variant="title-small-bold" as="h2" className="text-foreground-body">
                        Configuration
                    </Text>
                    <IconButton
                        type="button"
                        variant="ghosted"
                        size="regular"
                        onClick={onClose}
                        aria-label="Close settings"
                    >
                        <CloseIcon className="size-4" />
                    </IconButton>
                </div>

                <div className="px-6 py-6 space-y-4">
                    <Text variant="paragraph-small" className="text-foreground-subtle leading-relaxed">
                        API keys and integration credentials for this deployment are{" "}
                        <span className="font-medium text-foreground-body">managed directly by TwelveLabs internal team members</span>.
                        They are not configurable through this interface.
                    </Text>
                    <Text variant="paragraph-small" className="text-foreground-subtle leading-relaxed">
                        If you need to run or configure the app yourself (for example a local deployment), use the
                        source repository: environment variables such as{" "}
                        <span className="font-tl-mono text-foreground-body">TL_API_KEY</span>,{" "}
                        <span className="font-tl-mono text-foreground-body">BLOB_READ_WRITE_TOKEN</span>, and optional{" "}
                        <span className="font-tl-mono text-foreground-body">DATABRICKS_*</span> are documented there for
                        analyze, search, video listing, generation, Vercel Blob caching, and the ad metadata SQL export.
                    </Text>
                    <Button
                        asChild
                        variant="outlined-gray"
                        size="regular"
                        className="w-full"
                    >
                        <a
                            href={DEFAULT_SOURCE_REPO}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            GitHub — source &amp; local setup
                        </a>
                    </Button>
                    <Text variant="paragraph-mini" className="text-foreground-muted">
                        Keys are never stored in the browser; exposing them in a deployed UI would be unsafe for a
                        public demo.
                    </Text>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-secondary">
                    <Button type="button" variant="secondary" size="regular" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
