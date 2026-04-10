import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";
import type { WorkspaceTabId } from "~/workspace/workspaceStore";

interface WorkspacePanelTabsProps {
  readonly tabs: ReadonlyArray<WorkspaceTabId>;
  readonly activeTab: WorkspaceTabId;
  readonly dirtyPaths: ReadonlySet<string>;
  readonly onSelect: (tab: WorkspaceTabId) => void;
  readonly onClose: (tab: WorkspaceTabId) => void;
}

function tabLabel(tab: WorkspaceTabId): string {
  if (tab.kind === "changes") return "Changes";
  if (tab.kind === "files") return "Files";
  return tab.relativePath.split("/").pop() ?? tab.relativePath;
}

export function tabKey(tab: WorkspaceTabId): string {
  if (tab.kind === "changes") return "changes";
  if (tab.kind === "files") return "files";
  return `file:${tab.relativePath}`;
}

function tabsEqual(a: WorkspaceTabId, b: WorkspaceTabId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") {
    return a.relativePath === b.relativePath;
  }
  return true;
}

// ---- Individual sortable file tab ----

function SortableFileTab({
  tab,
  isActive,
  isDirty,
  onSelect,
  onClose,
}: {
  tab: WorkspaceTabId & { kind: "file" };
  isActive: boolean;
  isDirty: boolean;
  onSelect: (tab: WorkspaceTabId) => void;
  onClose: (tab: WorkspaceTabId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tabKey(tab),
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      type="button"
      className={cn(
        "group flex items-center gap-1.5 rounded-t-sm border border-b-0 border-transparent px-3 py-2 text-xs",
        "hover:bg-background",
        isActive ? "border-border bg-background text-foreground" : "text-muted-foreground",
        isDragging ? "z-20 opacity-80" : "",
      )}
      onClick={() => onSelect(tab)}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          onClose(tab);
        }
      }}
      title={tab.relativePath}
    >
      {isDirty ? (
        <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      ) : null}
      <span className="max-w-[12rem] truncate">{tabLabel(tab)}</span>
      <span
        role="button"
        aria-label={`Close ${tabLabel(tab)}`}
        tabIndex={-1}
        className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 aria-selected:opacity-100"
        onClick={(event: MouseEvent<HTMLSpanElement>) => {
          event.stopPropagation();
          onClose(tab);
        }}
      >
        <X className="h-2.5 w-2.5" aria-hidden />
      </span>
    </button>
  );
}

// ---- Static (pinned) system tab ----

function SystemTab({
  tab,
  isActive,
  onSelect,
}: {
  tab: WorkspaceTabId;
  isActive: boolean;
  onSelect: (tab: WorkspaceTabId) => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      type="button"
      className={cn(
        "group flex items-center gap-1.5 rounded-t-sm border border-b-0 border-transparent px-3 py-2 text-xs",
        "hover:bg-background",
        isActive ? "border-border bg-background text-foreground" : "text-muted-foreground",
      )}
      onClick={() => onSelect(tab)}
    >
      <span className="max-w-[12rem] truncate">{tabLabel(tab)}</span>
    </button>
  );
}

export function WorkspacePanelTabs({
  tabs,
  activeTab,
  dirtyPaths,
  onSelect,
  onClose,
}: WorkspacePanelTabsProps) {
  // Split tabs: system tabs (Changes, Files) are pinned, file tabs are sortable.
  const systemTabs = tabs.filter((tab) => tab.kind !== "file");
  const fileTabs = tabs.filter(
    (tab): tab is WorkspaceTabId & { kind: "file" } => tab.kind === "file",
  );
  const sortableIds = fileTabs.map((tab) => tabKey(tab));

  return (
    <div
      role="tablist"
      className="flex h-[52px] shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/20 px-2"
    >
      {/* Pinned system tabs */}
      {systemTabs.map((tab) => (
        <SystemTab
          key={tabKey(tab)}
          tab={tab}
          isActive={tabsEqual(tab, activeTab)}
          onSelect={onSelect}
        />
      ))}

      {/* Sortable file tabs */}
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        {fileTabs.map((tab) => (
          <SortableFileTab
            key={tabKey(tab)}
            tab={tab}
            isActive={tabsEqual(tab, activeTab)}
            isDirty={dirtyPaths.has(tab.relativePath)}
            onSelect={onSelect}
            onClose={onClose}
          />
        ))}
      </SortableContext>
    </div>
  );
}
