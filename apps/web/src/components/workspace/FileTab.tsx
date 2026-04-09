import type { EnvironmentId, ProjectFileEvent } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save, WrapText } from "lucide-react";
import { useCallback, useEffect } from "react";

import { cn } from "~/lib/utils";
import {
  useFileSubscription,
  useSaveFile,
  workspaceQueryKeys,
  workspaceReadFileQueryOptions,
} from "~/lib/workspaceReactQuery";
import { readLocalApi } from "~/localApi";
import { useWorkspaceStore } from "~/workspace/workspaceStore";

import { FileConflictBanner } from "./FileConflictBanner";
import { FileViewer } from "./FileViewer";

interface FileTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

export function FileTab({ environmentId, cwd, relativePath }: FileTabProps) {
  const queryClient = useQueryClient();

  // Store selectors — `buffer` is an object reference, but zustand reuses
  // the same reference across unrelated updates, so this is stable.
  const buffer = useWorkspaceStore((state) => state.byCwd[cwd]?.fileBuffers[relativePath]);
  const wordWrap = useWorkspaceStore((state) => state.byCwd[cwd]?.wordWrap ?? false);
  const setFileBuffer = useWorkspaceStore((state) => state.setFileBuffer);
  const toggleEditMode = useWorkspaceStore((state) => state.toggleEditMode);
  const setEditorContents = useWorkspaceStore((state) => state.setEditorContents);
  const setCursor = useWorkspaceStore((state) => state.setCursor);
  const markDiskSnapshot = useWorkspaceStore((state) => state.markDiskSnapshot);
  const resolveExternalChange = useWorkspaceStore((state) => state.resolveExternalChange);
  const clearDirty = useWorkspaceStore((state) => state.clearDirty);
  const setWordWrap = useWorkspaceStore((state) => state.setWordWrap);

  const query = useQuery(workspaceReadFileQueryOptions({ environmentId, cwd, relativePath }));
  const saveFile = useSaveFile(environmentId);

  // Sync the React Query result into the store, preserving in-progress
  // edit state so refetches don't clobber dirty buffers.
  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    if (data._tag === "text") {
      setFileBuffer(cwd, relativePath, {
        server: {
          kind: "text",
          contents: data.contents,
          sha256: data.sha256,
          size: data.size,
        },
        isEditMode: buffer?.isEditMode ?? false,
        editorContents: buffer?.editorContents ?? null,
        cursor: buffer?.cursor ?? null,
        diskSha256: data.sha256,
        diskSize: data.size,
        hasExternalChange: buffer?.hasExternalChange ?? false,
      });
    } else if (data._tag === "binary") {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "binary", size: data.size },
        isEditMode: false,
        editorContents: null,
        cursor: null,
        diskSha256: null,
        diskSize: data.size,
        hasExternalChange: false,
      });
    } else {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "tooLarge", size: data.size, limit: data.limit },
        isEditMode: false,
        editorContents: null,
        cursor: null,
        diskSha256: null,
        diskSize: data.size,
        hasExternalChange: false,
      });
    }
    // Intentionally omit `buffer` from deps — this effect reads buffer
    // state only to preserve edit fields on re-sync, but including it
    // would cause an infinite sync loop every time a buffer field
    // changes. The buffer snapshot is up-to-date on each query.data
    // change, which is all we care about here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, query.data, relativePath, setFileBuffer]);

  // Surface read errors through the store so the UI can render an error.
  useEffect(() => {
    if (!query.error) return;
    setFileBuffer(cwd, relativePath, {
      server: { kind: "error", message: query.error.message },
      isEditMode: false,
      editorContents: null,
      cursor: null,
      diskSha256: null,
      diskSize: null,
      hasExternalChange: false,
    });
  }, [cwd, query.error, relativePath, setFileBuffer]);

  // Live disk subscription. The callback must be stable so the subscription
  // doesn't churn on every keystroke; we read the current dirty state via
  // `useWorkspaceStore.getState()` instead of closing over `buffer`.
  const handleFileEvent = useCallback(
    (event: ProjectFileEvent) => {
      if (event._tag === "deleted") {
        markDiskSnapshot(cwd, relativePath, "deleted", 0);
        return;
      }
      markDiskSnapshot(cwd, relativePath, event.sha256, event.size);
      const currentBuffer = useWorkspaceStore.getState().byCwd[cwd]?.fileBuffers[relativePath];
      const isDirty =
        currentBuffer?.editorContents !== null && currentBuffer?.editorContents !== undefined;
      if (!isDirty) {
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.readFile(environmentId, cwd, relativePath),
        });
      }
    },
    [cwd, environmentId, markDiskSnapshot, queryClient, relativePath],
  );
  useFileSubscription(environmentId, cwd, relativePath, handleFileEvent);

  // Cmd/Ctrl+S save shortcut.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isSave =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && !event.shiftKey;
      if (!isSave) return;
      if (!buffer || buffer.editorContents === null) return;
      if (!buffer.isEditMode) return;
      event.preventDefault();
      saveFile.mutate(
        { cwd, relativePath, contents: buffer.editorContents },
        {
          onSuccess: () => clearDirty(cwd, relativePath),
        },
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [buffer, clearDirty, cwd, relativePath, saveFile]);

  // Stable editor callbacks — without `useCallback` the FileViewer's
  // `useEffect` dep array would see new functions every render and
  // re-create the CodeMirror view, thrashing focus and cursor.
  const handleContentChange = useCallback(
    (next: string) => {
      setEditorContents(cwd, relativePath, next);
    },
    [cwd, relativePath, setEditorContents],
  );
  const handleCursorChange = useCallback(
    (cursor: { line: number; column: number } | null) => {
      setCursor(cwd, relativePath, cursor);
    },
    [cwd, relativePath, setCursor],
  );

  // Non-text server states. Read from the store so a refetch can't leave
  // the UI in a stale state; fall back to loading if the store hasn't
  // synced yet.
  const serverState = buffer?.server ?? { kind: "loading" as const };

  if (query.isLoading || serverState.kind === "loading") {
    return <div className="p-2 text-xs text-muted-foreground">Loading {relativePath}…</div>;
  }
  if (query.isError && serverState.kind !== "text") {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to read {relativePath}. {query.error?.message ?? ""}
      </div>
    );
  }

  if (serverState.kind === "tooLarge") {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Too large to preview</div>
        <div className="text-muted-foreground">
          {relativePath} is {(serverState.size / (1024 * 1024)).toFixed(1)} MB. The preview limit is{" "}
          {(serverState.limit / (1024 * 1024)).toFixed(0)} MB.
        </div>
        <OpenExternallyButton cwd={cwd} relativePath={relativePath} />
      </div>
    );
  }
  if (serverState.kind === "binary") {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Binary file</div>
        <div className="text-muted-foreground">
          {relativePath} appears to be a binary file ({serverState.size.toLocaleString()} bytes) and
          cannot be previewed.
        </div>
        <OpenExternallyButton cwd={cwd} relativePath={relativePath} />
      </div>
    );
  }
  if (serverState.kind === "error") {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to read {relativePath}. {serverState.message}
      </div>
    );
  }

  // Text state — render the editor with the toolbar.
  const initialContents = buffer?.editorContents ?? serverState.contents;
  const isDirty = buffer?.editorContents !== null && buffer?.editorContents !== undefined;
  const isEditMode = buffer?.isEditMode ?? false;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1 text-[11px]">
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5",
            isEditMode ? "bg-accent" : "hover:bg-accent/50",
          )}
          onClick={() => toggleEditMode(cwd, relativePath)}
          title={isEditMode ? "Exit edit mode" : "Edit this file"}
        >
          <Pencil className="h-3 w-3" aria-hidden />
          {isEditMode ? "Editing" : "Edit"}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 hover:bg-accent/50 disabled:opacity-50"
          onClick={() => {
            if (!buffer || buffer.editorContents === null) return;
            saveFile.mutate(
              { cwd, relativePath, contents: buffer.editorContents },
              {
                onSuccess: () => clearDirty(cwd, relativePath),
              },
            );
          }}
          disabled={!isDirty || saveFile.isPending}
          title="Save (Cmd/Ctrl+S)"
        >
          <Save className="h-3 w-3" aria-hidden />
          Save
        </button>
        <button
          type="button"
          className={cn(
            "ml-auto flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5",
            wordWrap ? "bg-accent" : "hover:bg-accent/50",
          )}
          onClick={() => setWordWrap(cwd, !wordWrap)}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
        >
          <WrapText className="h-3 w-3" aria-hidden />
          Wrap
        </button>
      </div>
      {buffer?.hasExternalChange ? (
        <FileConflictBanner
          relativePath={relativePath}
          onKeepMine={() => resolveExternalChange(cwd, relativePath, "keepMine")}
          onReload={() => {
            resolveExternalChange(cwd, relativePath, "reload");
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.readFile(environmentId, cwd, relativePath),
            });
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <FileViewer
          relativePath={relativePath}
          contents={initialContents}
          isEditMode={isEditMode}
          wordWrap={wordWrap}
          onContentChange={handleContentChange}
          onCursorChange={handleCursorChange}
        />
      </div>
    </div>
  );
}

function OpenExternallyButton({
  cwd,
  relativePath,
}: {
  readonly cwd: string;
  readonly relativePath: string;
}) {
  return (
    <button
      type="button"
      className="mt-1 self-start rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
      onClick={() => {
        const api = readLocalApi();
        if (!api) return;
        const absolutePath = `${cwd}/${relativePath}`;
        void api.shell.openInEditor(absolutePath, "file-manager");
      }}
    >
      Open externally
    </button>
  );
}
