"use client";

import {
  SearchIcon,
  Spinner,
  TextField,
} from "@twelvelabs-io/react";

type SemanticSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  focused?: boolean;
  isSearching?: boolean;
  onClear?: () => void;
  className?: string;
};

export default function SemanticSearchField({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Semantic search — describe a scene, emotion, or moment...",
  focused = false,
  isSearching = false,
  onClear,
  className = "",
}: SemanticSearchFieldProps) {
  return (
    <div className={`gradient-search-wrapper ${focused ? "active" : ""} ${className}`}>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        size="small"
        startContent={<SearchIcon className="size-4 shrink-0 text-foreground-muted" aria-hidden />}
        endContent={
          isSearching ? (
            <Spinner size="sm" className="text-foreground-muted" aria-label="Searching" />
          ) : undefined
        }
        clearable={Boolean(value) && !isSearching}
        onClear={onClear}
        controlClassName="border-0 bg-transparent shadow-none rounded-[10.5px] min-h-0 py-0"
        inputClassName="py-3 text-sm text-foreground-body placeholder:text-foreground-muted"
        className="gradient-search-inner w-full"
        aria-busy={isSearching}
      />
    </div>
  );
}
