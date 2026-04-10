import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";

import type { FileTreeRow } from "./FileTree.logic";

interface FileTreeNodeProps {
  readonly row: FileTreeRow;
  readonly isActive: boolean;
  readonly gitStatus: "modified" | null;
  readonly onClick: (row: FileTreeRow, event: MouseEvent<HTMLButtonElement>) => void;
  readonly onContextMenu?: (row: FileTreeRow, position: { x: number; y: number }) => void;
}

export function FileTreeNode({
  row,
  isActive,
  gitStatus,
  onClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const { entry, depth, hasChildren, isExpanded } = row;
  const name = entry.path.split("/").pop() ?? entry.path;
  const Icon = hasChildren ? (isExpanded ? FolderOpen : Folder) : File;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-xs",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive && "bg-accent text-accent-foreground",
        gitStatus === "modified" && "text-yellow-500",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={(event) => onClick(row, event)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(row, { x: event.clientX, y: event.clientY });
      }}
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      {hasChildren ? (
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", isExpanded && "rotate-90")}
          aria-hidden
        />
      ) : (
        <span className="inline-block h-3 w-3 shrink-0" aria-hidden />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{name}</span>
      {gitStatus === "modified" ? (
        <span
          className="ml-auto shrink-0 text-[10px] font-medium text-yellow-500"
          aria-label="Modified"
        >
          M
        </span>
      ) : null}
    </button>
  );
}
