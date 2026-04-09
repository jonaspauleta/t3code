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

  // Layer 2: editor state. Null means "no edit activity yet".
  readonly isEditMode: boolean;
  readonly editorContents: string | null; // when !== null, reflects user edits
  readonly cursor: { readonly line: number; readonly column: number } | null;

  // Layer 2: disk-change tracking from subscribeFile.
  readonly diskSha256: string | null;
  readonly diskSize: number | null;
  readonly hasExternalChange: boolean;
}

export interface CwdWorkspaceState {
  readonly openTabs: ReadonlyArray<WorkspaceTabId>;
  readonly fileBuffers: { readonly [relativePath: string]: FileBuffer };
  readonly expandedDirectories: ReadonlyArray<string>;
  readonly wordWrap: boolean; // default false
}

interface WorkspaceState {
  readonly byCwd: { readonly [cwd: string]: CwdWorkspaceState };
}

interface WorkspaceActions {
  openFile(cwd: string, relativePath: string): void;
  closeTab(cwd: string, tabId: WorkspaceTabId): void;
  setFileBuffer(cwd: string, relativePath: string, buffer: FileBuffer): void;
  toggleDirectory(cwd: string, relativePath: string): void;

  // Layer 2
  toggleEditMode(cwd: string, relativePath: string): void;
  setEditorContents(cwd: string, relativePath: string, contents: string): void;
  setCursor(
    cwd: string,
    relativePath: string,
    cursor: { line: number; column: number } | null,
  ): void;
  markDiskSnapshot(cwd: string, relativePath: string, diskSha256: string, diskSize: number): void;
  resolveExternalChange(cwd: string, relativePath: string, choice: "keepMine" | "reload"): void;
  clearDirty(cwd: string, relativePath: string): void;
  setWordWrap(cwd: string, wordWrap: boolean): void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

const EMPTY_FILE_BUFFER: FileBuffer = {
  server: { kind: "loading" },
  isEditMode: false,
  editorContents: null,
  cursor: null,
  diskSha256: null,
  diskSize: null,
  hasExternalChange: false,
};

const EMPTY_CWD_STATE: CwdWorkspaceState = {
  openTabs: [],
  fileBuffers: {},
  expandedDirectories: [],
  wordWrap: false,
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

function updateBuffer(
  state: WorkspaceState,
  cwd: string,
  relativePath: string,
  updater: (buffer: FileBuffer) => FileBuffer,
): WorkspaceState {
  const existing = getOrInit(state.byCwd, cwd);
  const current = existing.fileBuffers[relativePath] ?? EMPTY_FILE_BUFFER;
  const next = updater(current);
  if (next === current) return state;
  return {
    byCwd: {
      ...state.byCwd,
      [cwd]: {
        ...existing,
        fileBuffers: { ...existing.fileBuffers, [relativePath]: next },
      },
    },
  };
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

      toggleEditMode: (cwd, relativePath) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => ({
            ...buffer,
            isEditMode: !buffer.isEditMode,
          })),
        ),

      setEditorContents: (cwd, relativePath, contents) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => {
            // Dirty = editorContents differs from server contents
            const serverContents = buffer.server.kind === "text" ? buffer.server.contents : null;
            const normalized = contents === serverContents ? null : contents;
            return { ...buffer, editorContents: normalized };
          }),
        ),

      setCursor: (cwd, relativePath, cursor) =>
        set((state) => updateBuffer(state, cwd, relativePath, (buffer) => ({ ...buffer, cursor }))),

      markDiskSnapshot: (cwd, relativePath, diskSha256, diskSize) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => {
            const isDirty = buffer.editorContents !== null;
            // Silent refresh for clean buffers with a mismatching hash; conflict
            // for dirty buffers with a mismatching hash.
            const serverSha = buffer.server.kind === "text" ? buffer.server.sha256 : null;
            const diskDiffers = diskSha256 !== serverSha;
            const hasExternalChange = isDirty && diskDiffers;
            return { ...buffer, diskSha256, diskSize, hasExternalChange };
          }),
        ),

      resolveExternalChange: (cwd, relativePath, choice) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => {
            if (choice === "keepMine") {
              return { ...buffer, hasExternalChange: false };
            }
            // "reload": drop dirty buffer and pretend it was never dirty.
            // The next read-file fetch will replace `buffer.server` with
            // fresh contents; React Query invalidation is the caller's job.
            return {
              ...buffer,
              editorContents: null,
              hasExternalChange: false,
            };
          }),
        ),

      clearDirty: (cwd, relativePath) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => ({
            ...buffer,
            editorContents: null,
            hasExternalChange: false,
          })),
        ),

      setWordWrap: (cwd, wordWrap) =>
        set((state) => {
          const existing = getOrInit(state.byCwd, cwd);
          if (existing.wordWrap === wordWrap) return state;
          return {
            byCwd: {
              ...state.byCwd,
              [cwd]: { ...existing, wordWrap },
            },
          };
        }),
    }),
    {
      name: "chat_workspace_state",
      // Persist structural state ONLY — tab layout, tree expansion, word-wrap.
      // File buffers (including dirty editor contents) are NEVER persisted,
      // because rehydrating them without reconciling against the current
      // server sha256 causes stale `editorContents` from previous sessions
      // to resurface as phantom "dirty" buffers whose contents don't match
      // any real file state. Hot-exit (surviving a browser refresh with
      // unsaved edits) would need a proper reconciliation pass — tracked
      // as a Layer 2 follow-up, not shipping in the initial L2 drop.
      partialize: (state) =>
        ({
          byCwd: Object.fromEntries(
            Object.entries(state.byCwd).map(([cwd, cwdState]) => [
              cwd,
              {
                openTabs: cwdState.openTabs,
                fileBuffers: {},
                expandedDirectories: cwdState.expandedDirectories,
                wordWrap: cwdState.wordWrap,
              },
            ]),
          ),
        }) as { byCwd: Record<string, CwdWorkspaceState> },
    },
  ),
);
