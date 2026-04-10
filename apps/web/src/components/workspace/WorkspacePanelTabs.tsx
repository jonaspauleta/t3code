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

function tabKey(tab: WorkspaceTabId): string {
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

export function WorkspacePanelTabs({
  tabs,
  activeTab,
  dirtyPaths,
  onSelect,
  onClose,
}: WorkspacePanelTabsProps) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/20 px-1"
    >
      {tabs.map((tab) => {
        const isActive = tabsEqual(tab, activeTab);
        // Only actual file tabs are closable. "Changes" and "Files" are
        // system tabs that always stay pinned at the start of the strip.
        const canClose = tab.kind === "file";
        const isDirty = tab.kind === "file" && dirtyPaths.has(tab.relativePath);
        return (
          <button
            key={tabKey(tab)}
            role="tab"
            aria-selected={isActive}
            type="button"
            className={cn(
              "group flex items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-2 py-1 text-[11px]",
              "hover:bg-background",
              isActive ? "border-border bg-background text-foreground" : "text-muted-foreground",
            )}
            onClick={() => onSelect(tab)}
            onAuxClick={(event) => {
              // Middle-click (button 1) closes file tabs.
              if (event.button === 1 && canClose) {
                event.preventDefault();
                onClose(tab);
              }
            }}
            title={tab.kind === "file" ? tab.relativePath : undefined}
          >
            {isDirty ? (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
            ) : null}
            <span className="max-w-[12rem] truncate">{tabLabel(tab)}</span>
            {canClose ? (
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
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
