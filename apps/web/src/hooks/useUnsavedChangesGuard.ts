import { useEffect } from "react";

import { useWorkspaceStore } from "~/workspace/workspaceStore";

/**
 * Hook that registers a `beforeunload` handler so the browser shows a
 * native "unsaved changes" prompt when any workspace file buffer for the
 * current cwd has dirty edits.
 */
export function useUnsavedChangesGuard(cwd: string | null): void {
  useEffect(() => {
    if (!cwd) return;

    const handler = (event: BeforeUnloadEvent) => {
      const state = useWorkspaceStore.getState();
      const cwdState = state.byCwd[cwd];
      if (!cwdState) return;
      const hasDirty = Object.values(cwdState.fileBuffers).some(
        (buffer) => buffer.editorContents !== null,
      );
      if (hasDirty) {
        event.preventDefault();
        event.returnValue = "You have unsaved changes in the workspace panel.";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cwd]);
}
