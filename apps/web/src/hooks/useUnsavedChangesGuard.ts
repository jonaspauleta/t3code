import { useEffect } from "react";

import { useWorkspaceStore } from "~/workspace/workspaceStore";

/**
 * Returns `true` when any workspace file buffer for the given cwd has
 * dirty (unsaved) edits.
 */
function hasUnsavedChanges(cwd: string): boolean {
  const state = useWorkspaceStore.getState();
  const cwdState = state.byCwd[cwd];
  if (!cwdState) return false;
  return Object.values(cwdState.fileBuffers).some((buffer) => buffer.editorContents !== null);
}

/**
 * Hook that registers a `beforeunload` handler so the browser shows a
 * native "unsaved changes" prompt when any workspace file buffer for the
 * current cwd has dirty edits.
 *
 * On Electron, it also responds to a main-process IPC check (Cmd+Q) via
 * `desktopBridge.onCheckUnsavedChanges`, which is more reliable because
 * `beforeunload` can be bypassed when the backend is killed first.
 */
export function useUnsavedChangesGuard(cwd: string | null): void {
  // Browser-native beforeunload guard (works in web + fallback on desktop)
  useEffect(() => {
    if (!cwd) return;

    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges(cwd)) {
        event.preventDefault();
        event.returnValue = "You have unsaved changes in the workspace panel.";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cwd]);

  // Desktop bridge: respond to main-process unsaved check on Cmd+Q
  useEffect(() => {
    if (!cwd) return;
    const bridge = window.desktopBridge;
    if (!bridge?.onCheckUnsavedChanges) return;

    return bridge.onCheckUnsavedChanges(() => {
      return hasUnsavedChanges(cwd);
    });
  }, [cwd]);
}
