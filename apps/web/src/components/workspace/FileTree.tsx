import type { EnvironmentId } from "@t3tools/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef } from "react";

import { useGitStatus } from "~/lib/gitStatusState";
import { workspaceListDirectoryQueryOptions } from "~/lib/workspaceReactQuery";
import { useWorkspaceStore, type WorkspaceTabId } from "~/workspace/workspaceStore";

import { buildVisibleRows, type DirectoryListingSnapshot } from "./FileTree.logic";
import { useFileContextMenu } from "./FileContextMenu";
import { FileTreeNode } from "./FileTreeNode";

interface FileTreeProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId | null;
  readonly onSelectTab: (tab: WorkspaceTabId) => void;
}

const ROW_HEIGHT = 22;

// Stable empty references — used as fallbacks so zustand selectors and
// useMemo derivations return the SAME reference every render, avoiding
// React infinite re-render loops.
const EMPTY_EXPANDED_DIRECTORIES: ReadonlyArray<string> = [];
const EMPTY_MODIFIED_PATHS: ReadonlySet<string> = new Set();

/**
 * Custom hook: fetches listings for the workspace root plus every currently
 * expanded directory. `useQueries` tolerates a dynamically-sized array, so
 * the hook count stays stable across renders.
 */
function useDirectoryListings(
  environmentId: EnvironmentId,
  cwd: string,
  expandedDirectoriesList: ReadonlyArray<string>,
) {
  const rootQuery = useQuery(
    workspaceListDirectoryQueryOptions({ environmentId, cwd, relativePath: "" }),
  );
  const subtreeQueries = useQueries({
    queries: expandedDirectoriesList.map((relativePath) =>
      workspaceListDirectoryQueryOptions({ environmentId, cwd, relativePath }),
    ),
  });
  return { rootQuery, subtreeQueries };
}

export function FileTree({ environmentId, cwd, activeTab, onSelectTab }: FileTreeProps) {
  // Git status for the working tree — gives us the set of modified file paths.
  // Git status paths are relative to the git REPO ROOT (e.g. "apps/server/src/config.ts"),
  // but tree entry paths are relative to the project CWD (e.g. "src/config.ts").
  // When the project CWD is a subdirectory of the repo, these don't match.
  // We build a set of all path suffixes so the comparison works regardless
  // of how deep the project CWD is nested inside the repo.
  const gitStatus = useGitStatus({ environmentId, cwd });
  const modifiedPaths = useMemo(() => {
    const files = gitStatus.data?.workingTree?.files;
    if (!files || files.length === 0) return EMPTY_MODIFIED_PATHS;
    const set = new Set<string>();
    for (const f of files) {
      // Add the full path and every suffix (stripping leading segments one
      // at a time) so that "apps/server/src/config.ts" also matches
      // "server/src/config.ts", "src/config.ts", and "config.ts".
      const parts = f.path.split("/");
      for (let i = 0; i < parts.length; i++) {
        set.add(parts.slice(i).join("/"));
      }
    }
    return set;
  }, [gitStatus.data?.workingTree?.files]);

  const expandedDirectoriesList = useWorkspaceStore(
    (state) => state.byCwd[cwd]?.expandedDirectories ?? EMPTY_EXPANDED_DIRECTORIES,
  );
  const expandedDirectories = useMemo(
    () => new Set(expandedDirectoriesList),
    [expandedDirectoriesList],
  );
  const openFile = useWorkspaceStore((state) => state.openFile);
  const toggleDirectory = useWorkspaceStore((state) => state.toggleDirectory);

  const handleContextMenu = useFileContextMenu({ environmentId, cwd, onSelectTab });

  const { rootQuery, subtreeQueries } = useDirectoryListings(
    environmentId,
    cwd,
    expandedDirectoriesList,
  );

  // Build the listings map in a single pass — never mutate a memoized value.
  const listingsByRelativePath = useMemo(() => {
    const map = new Map<string, DirectoryListingSnapshot>();
    if (rootQuery.data) {
      map.set("", { relativePath: "", entries: rootQuery.data.entries });
    }
    for (const query of subtreeQueries) {
      if (query.data) {
        map.set(query.data.relativePath, {
          relativePath: query.data.relativePath,
          entries: query.data.entries,
        });
      }
    }
    return map;
  }, [rootQuery.data, subtreeQueries]);

  const visibleRows = useMemo(
    () => buildVisibleRows({ listingsByRelativePath, expandedDirectories }),
    [listingsByRelativePath, expandedDirectories],
  );

  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const activeRelativePath = activeTab?.kind === "file" ? activeTab.relativePath : null;

  const handleNodeClick = useCallback(
    (row: (typeof visibleRows)[number]) => {
      if (row.entry.kind === "directory") {
        toggleDirectory(cwd, row.entry.path);
        return;
      }
      openFile(cwd, row.entry.path);
      onSelectTab({ kind: "file", relativePath: row.entry.path });
    },
    [cwd, onSelectTab, openFile, toggleDirectory],
  );

  if (rootQuery.isLoading) {
    return <div className="p-2 text-xs text-muted-foreground">Loading tree…</div>;
  }
  if (rootQuery.isError) {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to load directory listing. {rootQuery.error?.message ?? ""}
      </div>
    );
  }

  return (
    <div ref={scrollParentRef} className="h-full min-h-0 overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = visibleRows[virtualRow.index]!;
          const isActive = row.entry.path === activeRelativePath;
          return (
            <div
              key={row.entry.path}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FileTreeNode
                row={row}
                isActive={isActive}
                gitStatus={modifiedPaths.has(row.entry.path) ? "modified" : null}
                onClick={handleNodeClick}
                onContextMenu={handleContextMenu}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
