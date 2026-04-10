import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import type { EnvironmentId } from "@t3tools/contracts";
import { Suspense, lazy, useCallback, useEffect, useMemo } from "react";

import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { cn } from "~/lib/utils";
import { useWorkspaceStore, type WorkspaceTabId } from "~/workspace/workspaceStore";

import { FilesTreeTab } from "./FilesTreeTab";
import { FileTab } from "./FileTab";
import { WorkspacePanelTabs, tabKey } from "./WorkspacePanelTabs";

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
  const moveTab = useWorkspaceStore((state) => state.moveTab);

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
      if (tab.kind === "file") {
        const isDirty = dirtyPaths.has(tab.relativePath);
        if (isDirty) {
          const confirmed = window.confirm(
            `Unsaved changes in ${tab.relativePath}. Discard and close?`,
          );
          if (!confirmed) return;
        }
      }
      closeTab(cwd, tab);
      if (tabsEqual(tab, activeTab)) {
        onSelectTab(CHANGES_TAB);
      }
    },
    [activeTab, closeTab, cwd, dirtyPaths, onSelectTab],
  );

  // Cmd+W / Ctrl+W closes the active file tab. Does nothing if the active
  // tab is Changes or Files (system tabs). Uses the same handleClose logic
  // that the × button uses, so dirty-file confirmation is preserved.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCloseTab =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w" && !event.shiftKey;
      if (!isCloseTab) return;
      if (activeTab.kind !== "file") return;
      event.preventDefault();
      handleClose(activeTab);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, handleClose]);

  // ---- dnd-kit: Tab drag-to-reorder ----
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Only file tabs are sortable. openTabs contains ONLY file tabs
      // (system tabs are prepended in fullTabs but live outside openTabs).
      const fileTabs = openTabs.filter((t) => t.kind === "file");
      const fromIndex = fileTabs.findIndex((t) => tabKey(t) === active.id);
      const toIndex = fileTabs.findIndex((t) => tabKey(t) === over.id);
      if (fromIndex === -1 || toIndex === -1) return;

      moveTab(cwd, fromIndex, toIndex);
    },
    [cwd, moveTab, openTabs],
  );

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-background")}>
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <WorkspacePanelTabs
          tabs={fullTabs}
          activeTab={activeTab}
          dirtyPaths={dirtyPaths}
          onSelect={onSelectTab}
          onClose={handleClose}
        />
      </DndContext>
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
