import type { EnvironmentId } from "@t3tools/contracts";
import { Suspense, lazy, useCallback, useMemo } from "react";

import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { cn } from "~/lib/utils";
import { useWorkspaceStore, type WorkspaceTabId } from "~/workspace/workspaceStore";

import { FilesTreeTab } from "./FilesTreeTab";
import { FileTab } from "./FileTab";
import { WorkspacePanelTabs } from "./WorkspacePanelTabs";

// DiffPanel is a default export (matches the existing route file's lazy import).
const LazyDiffPanel = lazy(() => import("../DiffPanel"));

interface WorkspacePanelProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId;
  readonly onSelectTab: (tab: WorkspaceTabId) => void;
}

const CHANGES_TAB: WorkspaceTabId = { kind: "changes" };
const FILES_TAB: WorkspaceTabId = { kind: "files" };

// Stable empty array reference — used as the fallback inside the zustand
// selector so that cwds without a store entry return the SAME reference
// every render. Without this, the selector would produce a fresh `[]` on
// every render and trigger "Maximum update depth exceeded" in React.
const EMPTY_OPEN_TABS: ReadonlyArray<WorkspaceTabId> = [];

// Stable empty set reference for the same reason — see dirtyPathKey
// selector below for the full stable-key pattern.
const EMPTY_DIRTY_PATHS: ReadonlySet<string> = new Set();

function tabsEqual(a: WorkspaceTabId, b: WorkspaceTabId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") {
    return a.relativePath === b.relativePath;
  }
  return true;
}

export function WorkspacePanel({
  environmentId,
  cwd,
  activeTab,
  onSelectTab,
}: WorkspacePanelProps) {
  const openTabs = useWorkspaceStore((state) => state.byCwd[cwd]?.openTabs ?? EMPTY_OPEN_TABS);
  const closeTab = useWorkspaceStore((state) => state.closeTab);

  // Stable-key selector for the dirty-paths set — see
  // commit dbc7d597 for the original L1 infinite-loop fix. We select a
  // primitive string (sorted, newline-joined) so zustand can compare it
  // with `Object.is`, then derive the Set once per string change.
  const dirtyPathKey = useWorkspaceStore((state) => {
    const cwdState = state.byCwd[cwd];
    if (!cwdState) return "";
    const parts: string[] = [];
    for (const [relativePath, buffer] of Object.entries(cwdState.fileBuffers)) {
      if (buffer.editorContents !== null) parts.push(relativePath);
    }
    return parts.toSorted().join("\n");
  });

  const dirtyPaths = useMemo(
    () => (dirtyPathKey ? new Set(dirtyPathKey.split("\n")) : EMPTY_DIRTY_PATHS),
    [dirtyPathKey],
  );

  const fullTabs = useMemo<ReadonlyArray<WorkspaceTabId>>(
    () => [CHANGES_TAB, FILES_TAB, ...openTabs],
    [openTabs],
  );

  const handleClose = useCallback(
    (tab: WorkspaceTabId) => {
      if (tab.kind === "changes") return; // Changes is not closable
      closeTab(cwd, tab);
      if (tabsEqual(tab, activeTab)) {
        onSelectTab(CHANGES_TAB);
      }
    },
    [activeTab, closeTab, cwd, onSelectTab],
  );

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-background")}>
      <WorkspacePanelTabs
        tabs={fullTabs}
        activeTab={activeTab}
        dirtyPaths={dirtyPaths}
        onSelect={onSelectTab}
        onClose={handleClose}
      />
      <div className="min-h-0 flex-1">
        {activeTab.kind === "changes" ? (
          <Suspense
            fallback={<div className="p-2 text-xs text-muted-foreground">Loading diff viewer…</div>}
          >
            <DiffWorkerPoolProvider>
              <LazyDiffPanel mode="sidebar" />
            </DiffWorkerPoolProvider>
          </Suspense>
        ) : activeTab.kind === "files" ? (
          <FilesTreeTab
            environmentId={environmentId}
            cwd={cwd}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
          />
        ) : (
          <FileTab environmentId={environmentId} cwd={cwd} relativePath={activeTab.relativePath} />
        )}
      </div>
    </div>
  );
}
