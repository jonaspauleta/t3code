import type { ContextMenuItem, EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { readLocalApi } from "~/localApi";
import { openInPreferredEditor } from "~/editorPreferences";
import {
  useCreateDirectory,
  useCreateFile,
  useDeleteEntry,
  useRenameEntry,
} from "~/lib/workspaceReactQuery";
import { useWorkspaceStore, type WorkspaceTabId } from "~/workspace/workspaceStore";

import type { FileTreeRow } from "./FileTree.logic";

type FileContextMenuAction =
  | "newFile"
  | "newFolder"
  | "rename"
  | "delete"
  | "copyRelativePath"
  | "copyAbsolutePath"
  | "revealInFileManager"
  | "openInEditor";

function buildMenuItems(row: FileTreeRow): readonly ContextMenuItem<FileContextMenuAction>[] {
  const isDirectory = row.entry.kind === "directory";
  const items: ContextMenuItem<FileContextMenuAction>[] = [];

  if (isDirectory) {
    items.push({ id: "newFile", label: "New File" });
    items.push({ id: "newFolder", label: "New Folder" });
  }
  items.push({ id: "rename", label: "Rename" });
  items.push({ id: "delete", label: "Delete", destructive: true });
  items.push({ id: "copyRelativePath", label: "Copy Relative Path" });
  items.push({ id: "copyAbsolutePath", label: "Copy Absolute Path" });
  items.push({ id: "revealInFileManager", label: "Reveal in File Manager" });
  items.push({ id: "openInEditor", label: "Open in External Editor" });
  return items;
}

/**
 * Computes the parent path for creating new files/folders inside a directory.
 * For directories, returns the directory path itself. For files, returns the
 * parent directory path.
 */
function getTargetDirectoryPath(row: FileTreeRow): string {
  if (row.entry.kind === "directory") return row.entry.path;
  return row.entry.parentPath ?? "";
}

interface UseFileContextMenuInput {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly onSelectTab: (tab: WorkspaceTabId) => void;
}

/**
 * Hook that returns a handler for `onContextMenu` events on file tree nodes.
 *
 * Uses `localApi.contextMenu.show()` for the menu UI (native on desktop,
 * fallback in browser) and React Query mutations for file operations.
 */
export function useFileContextMenu({ environmentId, cwd, onSelectTab }: UseFileContextMenuInput) {
  const createFile = useCreateFile(environmentId);
  const createDirectory = useCreateDirectory(environmentId);
  const renameEntry = useRenameEntry(environmentId);
  const deleteEntry = useDeleteEntry(environmentId);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const renameOpenFile = useWorkspaceStore((state) => state.renameOpenFile);

  return useCallback(
    async (row: FileTreeRow, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;

      const items = buildMenuItems(row);
      const action = await api.contextMenu.show(items, position);
      if (!action) return;

      const relativePath = row.entry.path;
      const absolutePath = `${cwd}/${relativePath}`;

      switch (action) {
        case "newFile": {
          const name = window.prompt("New file name:");
          if (!name) return;
          const parentDir = getTargetDirectoryPath(row);
          const newPath = parentDir ? `${parentDir}/${name}` : name;
          const result = await createFile.mutateAsync({
            cwd,
            relativePath: newPath,
          });
          openFile(cwd, result.relativePath);
          onSelectTab({ kind: "file", relativePath: result.relativePath });
          break;
        }
        case "newFolder": {
          const name = window.prompt("New folder name:");
          if (!name) return;
          const parentDir = getTargetDirectoryPath(row);
          const newPath = parentDir ? `${parentDir}/${name}` : name;
          await createDirectory.mutateAsync({ cwd, relativePath: newPath });
          break;
        }
        case "rename": {
          const currentName = relativePath.split("/").pop() ?? relativePath;
          const newName = window.prompt("New name:", currentName);
          if (!newName || newName === currentName) return;
          const parentDir = row.entry.parentPath ?? "";
          const nextRelativePath = parentDir ? `${parentDir}/${newName}` : newName;
          const result = await renameEntry.mutateAsync({
            cwd,
            relativePath,
            nextRelativePath,
          });
          // Update any open tab for the renamed file.
          renameOpenFile(cwd, relativePath, result.relativePath);
          break;
        }
        case "delete": {
          const isDirectory = row.entry.kind === "directory";
          const label = isDirectory ? "directory" : "file";
          const confirmed = await api.dialogs.confirm(
            `Delete ${label} "${relativePath}"? This cannot be undone.`,
          );
          if (!confirmed) return;
          await deleteEntry.mutateAsync({
            cwd,
            relativePath,
            recursive: isDirectory,
          });
          // Close any open tab for the deleted file.
          closeTab(cwd, { kind: "file", relativePath });
          break;
        }
        case "copyRelativePath": {
          await navigator.clipboard.writeText(relativePath);
          break;
        }
        case "copyAbsolutePath": {
          await navigator.clipboard.writeText(absolutePath);
          break;
        }
        case "revealInFileManager": {
          await api.shell.openInEditor(absolutePath, "file-manager");
          break;
        }
        case "openInEditor": {
          await openInPreferredEditor(api, absolutePath);
          break;
        }
      }
    },
    [
      cwd,
      createFile,
      createDirectory,
      renameEntry,
      deleteEntry,
      openFile,
      closeTab,
      renameOpenFile,
      onSelectTab,
    ],
  );
}
