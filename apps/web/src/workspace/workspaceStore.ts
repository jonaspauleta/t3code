import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceTabId =
  | { readonly kind: "changes" }
  | { readonly kind: "files" }
  | { readonly kind: "file"; readonly relativePath: string };

export type FileBufferState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "text";
      readonly contents: string;
      readonly sha256: string;
      readonly size: number;
    }
  | { readonly kind: "binary"; readonly size: number }
  | { readonly kind: "tooLarge"; readonly size: number; readonly limit: number }
  | { readonly kind: "error"; readonly message: string };

export interface FileBuffer {
  readonly server: FileBufferState;
  // Layer 2 will add: editorContents, isEditMode, diskSha256, hasExternalChange, cursor
}

export interface CwdWorkspaceState {
  readonly openTabs: ReadonlyArray<WorkspaceTabId>;
  readonly fileBuffers: { readonly [relativePath: string]: FileBuffer };
  readonly expandedDirectories: ReadonlyArray<string>;
}

interface WorkspaceState {
  readonly byCwd: { readonly [cwd: string]: CwdWorkspaceState };
}

interface WorkspaceActions {
  openFile(cwd: string, relativePath: string): void;
  closeTab(cwd: string, tabId: WorkspaceTabId): void;
  setFileBuffer(cwd: string, relativePath: string, buffer: FileBuffer): void;
  toggleDirectory(cwd: string, relativePath: string): void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

const EMPTY_CWD_STATE: CwdWorkspaceState = {
  openTabs: [],
  fileBuffers: {},
  expandedDirectories: [],
};

function tabsEqual(a: WorkspaceTabId, b: WorkspaceTabId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") {
    return a.relativePath === b.relativePath;
  }
  return true;
}

function getOrInit(
  byCwd: { readonly [cwd: string]: CwdWorkspaceState },
  cwd: string,
): CwdWorkspaceState {
  return byCwd[cwd] ?? EMPTY_CWD_STATE;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      byCwd: {},

      openFile: (cwd, relativePath) =>
        set((state) => {
          const existing = getOrInit(state.byCwd, cwd);
          const tabId: WorkspaceTabId = { kind: "file", relativePath };
          if (existing.openTabs.some((tab) => tabsEqual(tab, tabId))) {
            return state;
          }
          return {
            byCwd: {
              ...state.byCwd,
              [cwd]: {
                ...existing,
                openTabs: [...existing.openTabs, tabId],
              },
            },
          };
        }),

      closeTab: (cwd, tabId) =>
        set((state) => {
          const existing = state.byCwd[cwd];
          if (!existing) return state;
          const nextTabs = existing.openTabs.filter((tab) => !tabsEqual(tab, tabId));
          if (nextTabs.length === existing.openTabs.length) return state;
          const nextBuffers = { ...existing.fileBuffers };
          if (tabId.kind === "file") {
            delete nextBuffers[tabId.relativePath];
          }
          return {
            byCwd: {
              ...state.byCwd,
              [cwd]: {
                ...existing,
                openTabs: nextTabs,
                fileBuffers: nextBuffers,
              },
            },
          };
        }),

      setFileBuffer: (cwd, relativePath, buffer) =>
        set((state) => {
          const existing = getOrInit(state.byCwd, cwd);
          return {
            byCwd: {
              ...state.byCwd,
              [cwd]: {
                ...existing,
                fileBuffers: {
                  ...existing.fileBuffers,
                  [relativePath]: buffer,
                },
              },
            },
          };
        }),

      toggleDirectory: (cwd, relativePath) =>
        set((state) => {
          const existing = getOrInit(state.byCwd, cwd);
          const isExpanded = existing.expandedDirectories.includes(relativePath);
          const nextExpanded = isExpanded
            ? existing.expandedDirectories.filter((entry) => entry !== relativePath)
            : [...existing.expandedDirectories, relativePath];
          return {
            byCwd: {
              ...state.byCwd,
              [cwd]: {
                ...existing,
                expandedDirectories: nextExpanded,
              },
            },
          };
        }),
    }),
    {
      name: "chat_workspace_state",
      // Only persist structural state — file contents are refetched on demand.
      partialize: (state) => ({
        byCwd: Object.fromEntries(
          Object.entries(state.byCwd).map(([cwd, cwdState]) => [
            cwd,
            {
              openTabs: cwdState.openTabs,
              fileBuffers: {},
              expandedDirectories: cwdState.expandedDirectories,
            },
          ]),
        ),
      }),
    },
  ),
);
