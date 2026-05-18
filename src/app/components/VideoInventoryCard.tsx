"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import VideoCard from "./VideoCard";
import { type CachedVideo } from "../lib/videoCache";

type SearchMatch = { start: number; end: number; confidence: string; score?: number };

interface VideoInventoryCardProps {
    video: CachedVideo;
    displayName: string;
    searchMatch?: SearchMatch;
    onRename: (newName: string) => void;
    onDelete: () => void;
}

const dotsIcon = (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <circle cx="8" cy="3" r="1.25" />
        <circle cx="8" cy="8" r="1.25" />
        <circle cx="8" cy="13" r="1.25" />
    </svg>
);

export default function VideoInventoryCard({
    video,
    displayName,
    searchMatch,
    onRename,
    onDelete,
}: VideoInventoryCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(displayName);
    const menuRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isRenaming) setRenameValue(displayName);
    }, [displayName, isRenaming]);

    useEffect(() => {
        if (!menuOpen) return;
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    useEffect(() => {
        if (isRenaming) renameInputRef.current?.focus();
    }, [isRenaming]);

    const startRename = () => {
        setMenuOpen(false);
        setRenameValue(displayName);
        setIsRenaming(true);
    };

    const saveRename = () => {
        const trimmed = renameValue.trim();
        if (trimmed) onRename(trimmed);
        setIsRenaming(false);
    };

    const cancelRename = () => {
        setRenameValue(displayName);
        setIsRenaming(false);
    };

    const handleDelete = () => {
        setMenuOpen(false);
        if (
            window.confirm(
                "Remove this video from your inventory view? It will stay in the shared index but won't appear on this device.",
            )
        ) {
            onDelete();
        }
    };

    return (
        <div className="group/card">
            <VideoCard video={video} viewType="video-inventory" searchMatch={searchMatch} hideTitle />

            <div className="mt-2 flex items-start gap-1 min-h-[20px]">
                {isRenaming ? (
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename();
                                if (e.key === "Escape") cancelRename();
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-[11px] text-text-primary border border-border-light rounded-lg focus:outline-none focus:border-gray-400"
                        />
                        <button
                            type="button"
                            onClick={saveRename}
                            className="shrink-0 px-2 py-1 text-[10px] font-medium text-white bg-text-primary rounded-lg hover:bg-black transition-colors"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={cancelRename}
                            className="shrink-0 px-2 py-1 text-[10px] font-medium text-text-secondary hover:text-text-primary transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="flex-1 min-w-0 text-[11px] text-text-primary font-medium truncate" title={displayName}>
                            {displayName}
                        </p>
                        <div ref={menuRef} className="relative shrink-0 z-20">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setMenuOpen((o) => !o);
                                }}
                                className="p-0.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors"
                                aria-label="Video options"
                                aria-expanded={menuOpen}
                            >
                                {dotsIcon}
                            </button>
                            {menuOpen && (
                                <div
                                    role="menu"
                                    className="absolute right-0 top-full mt-1 w-[152px] bg-white rounded-xl border border-border-light shadow-lg z-50 overflow-hidden p-1 animate-fade-in"
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startRename();
                                        }}
                                        role="menuitem"
                                        className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-text-secondary rounded-lg hover:bg-gray-50 hover:text-text-primary transition-colors"
                                    >
                                        <Pencil className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete();
                                        }}
                                        role="menuitem"
                                        className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
