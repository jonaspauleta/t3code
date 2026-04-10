import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { File, Folder, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cn } from "~/lib/utils";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import type { WorkspaceTabId } from "~/workspace/workspaceStore";

interface CommandPaletteProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly openTabs: ReadonlyArray<WorkspaceTabId>;
  readonly onSelectFile: (relativePath: string) => void;
  readonly onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 150;

export function CommandPalette({
  environmentId,
  cwd,
  openTabs,
  onSelectFile,
  onClose,
}: CommandPaletteProps) {
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(rawQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [rawQuery]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Server-side search
  const searchQuery = useQuery(
    projectSearchEntriesQueryOptions({
      environmentId,
      cwd,
      query: debouncedQuery,
      enabled: debouncedQuery.length > 0,
      limit: 50,
    }),
  );

  // When query is empty, show recent files from open tabs
  const recentFiles = useMemo(() => {
    return openTabs
      .filter((tab): tab is WorkspaceTabId & { kind: "file" } => tab.kind === "file")
      .map(
        (tab): ProjectEntry => ({
          path: tab.relativePath,
          kind: "file" as const,
        }),
      );
  }, [openTabs]);

  const results: ReadonlyArray<ProjectEntry> =
    debouncedQuery.length > 0 ? (searchQuery.data?.entries ?? []) : recentFiles;

  const clampedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  // Keep a ref to the latest results + index so the keyboard handler
  // never stales and doesn't cause unnecessary re-renders.
  const resultsRef: RefObject<ReadonlyArray<ProjectEntry>> = useRef(results);
  resultsRef.current = results;
  const clampedIndexRef: RefObject<number> = useRef(clampedIndex);
  clampedIndexRef.current = clampedIndex;

  const handleSelect = useCallback(
    (entry: ProjectEntry) => {
      if (entry.kind === "file") {
        onSelectFile(entry.path);
        onClose();
      }
    },
    [onSelectFile, onClose],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, resultsRef.current.length - 1));
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          event.preventDefault();
          const entry = resultsRef.current[clampedIndexRef.current];
          if (entry) {
            handleSelect(entry);
          }
          break;
        }
        case "Escape": {
          event.preventDefault();
          onClose();
          break;
        }
      }
    },
    [handleSelect, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[clampedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/32 pt-[12vh] backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex max-h-[min(24rem,60vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-popover shadow-lg">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            placeholder="Search files by name..."
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
          />
        </div>

        {/* Results list */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-1">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {debouncedQuery.length > 0 ? "No files found." : "No recent files."}
            </div>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.path}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  "hover:bg-accent",
                  index === clampedIndex && "bg-accent text-accent-foreground",
                )}
                onClick={() => handleSelect(entry)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {entry.kind === "directory" ? (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.path}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">{entry.kind}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">↵</kbd> open
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
