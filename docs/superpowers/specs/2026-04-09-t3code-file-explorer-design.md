# T3 Code — In-app file explorer, preview & editor (workspace panel)

**Status:** Draft for review
**Date:** 2026-04-09
**Target repository:** `jonaspauleta/t3code` (personal fork of `pingdotgg/t3code`)
**Delivery model:** Long-lived personal fork. Each build layer lands on its own branch and is merged to fork `main`. No upstream PR is planned for this feature.

---

## 1. Summary

Add an in-app file explorer, file preview, and file editor to T3 Code, living entirely inside the existing togglable right panel that currently houses the diff view. The feature is accessed via the existing panel toggle and a new tab system that preserves the current `Changes` (diff) behavior as the default tab. Additional tabs host a lazy-loaded file tree and open-file viewers/editors backed by CodeMirror 6.

The backend is ~70% already built: `projects.searchEntries`, `projects.writeFile`, and `subscribeGitStatus` exist today and are reused directly. The work is mostly client-side shell + state, a small set of new server RPCs (`projects.readFile`, `projects.listDirectory`, `projects.subscribeFile`, plus L4 file operations), and a new Effect layer `WorkspaceTree` for lazy directory listing.

The feature is shipped in five sequential layers, each an independently usable branch.

## 2. Goals

- Browse the current project's tree inside the right panel, lazily (scales to thousands of files).
- Click a file to see a syntax-highlighted read-only preview.
- Toggle a file into edit mode with CodeMirror 6, save with `Cmd/Ctrl+S`, see dirty state, get unsaved-changes guards and external-change conflict banners.
- Multi-file tabs with drag reorder, `Cmd+W` close, middle-click close.
- `Cmd+P` fuzzy file finder opening files as new tabs.
- Right-click tree operations: new file, new folder, rename, delete, duplicate, copy path, reveal in file manager, open in external editor.
- Git status decorations in the tree (M / A / ? / !) reusing the existing `subscribeGitStatus` stream.
- Preserve today's "right panel hidden by default, opens on demand" behavior and every existing bookmark with `?diff=1`.

## 3. Non-goals

- Replace an external editor (Cursor, Zed, VS Code). This is a convenience surface for mid-chat edits, not a full IDE.
- IntelliSense, LSP integration, language-server-powered hover, go-to-definition, or refactoring.
- Multi-cursor and other advanced IDE editing features beyond what CodeMirror 6 provides out of the box.
- Source control operations (staging, committing, branch switching) beyond displaying status.
- Remote / SSH / container workspace browsing.
- Snippet libraries, extensions, themes-as-extensions.
- Visual diff between an edited buffer and disk (the existing `DiffPanel` covers the chat-scoped case).

## 4. Constraints

From `AGENTS.md` and project inspection:

- **Performance first. Reliability first.** Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).
- **`bun fmt`, `bun lint`, `bun typecheck`, `bun run test`** must pass on every layer branch before merge. Never run `bun test`.
- **Long-term maintainability.** Extract shared logic. No duplicate logic across files.
- **Schema-only contracts.** `packages/contracts/` contains no runtime logic.
- **Explicit subpath exports in `packages/shared/`.** No barrel index.
- **`.logic.ts` + `.logic.test.ts` + `.tsx` split** for components with non-trivial logic (existing convention: `ChatView`, `Sidebar`, `GitActionsControl`).
- **Effect services with `Services/` + `Layers/` split** on the server (existing convention: `WorkspaceFileSystem`, `WorkspaceEntries`, `WorkspacePaths`).
- **Long-lived personal fork.** Minimize diff footprint against upstream to reduce merge friction. Prefer new files over edits to existing files; where edits are unavoidable (the route file), keep them minimal and localized.
- **Explicitly NOT modified:** `apps/web/src/components/DiffPanel.tsx`, `apps/web/src/components/DiffPanelShell.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/ChatView.logic.ts`, `packages/contracts/src/editor.ts`, `apps/web/src/diffRouteSearch.ts`.

## 5. Architecture overview

### 5.1 Naming conventions

- **"workspace"** = the in-app file explorer / preview / editor feature. Used in all new UI module paths (`components/workspace/`, `workspaceStore.ts`, `WorkspacePanel.tsx`, etc.).
- **"editor"** = external editor launchers only. `packages/contracts/src/editor.ts` and `shell.openInEditor` semantics are unchanged.
- **`projects.*` RPC namespace** for all new backend RPCs. They operate on projects, and the namespace is already in use (`projects.searchEntries`, `projects.writeFile`).

### 5.2 Layout model

The existing togglable right panel becomes a tabbed workspace view. The panel's open/closed behavior (via `?diff=1` URL search param) is preserved exactly. A new `?tab=` URL search param selects the active tab:

- `?diff=1` — open, default tab is `changes` (exact current behavior).
- `?diff=1&tab=changes` — explicit changes tab.
- `?diff=1&tab=files` — file tree tab.
- `?diff=1&tab=<url-encoded-relative-path>` — a specific open file tab.

The `Changes` tab mounts the existing `<DiffPanel mode="sidebar" />` verbatim. The `Files` tab renders a lazy-loaded tree. Each open file is its own tab hosting a CodeMirror 6 viewer/editor.

Responsive behavior mirrors the existing diff panel: `(max-width: 1180px)` → sheet mode; wider → inline sidebar.

### 5.3 Module layout

```
packages/contracts/src/
├── project.ts                   EXTEND: read/list/watch/file-ops schemas (colocated with searchEntries/writeFile)
└── rpc.ts                       EXTEND: new RPCs added to WS_METHODS + WsRpcGroup

apps/server/src/workspace/
├── Services/
│   └── WorkspaceFileSystem.ts   EXTEND: add readFile + subscribeFile to the service interface
├── Layers/
│   ├── WorkspaceFileSystem.ts      EXTEND: implement readFile + subscribeFile + (L4) create/rename/delete
│   ├── WorkspaceFileSystem.test.ts EXTEND
│   ├── WorkspaceTree.ts            NEW: lazy directory listing (sibling to WorkspaceEntries)
│   └── WorkspaceTree.test.ts       NEW
apps/server/src/wsServer.ts      EXTEND: register new RPC handlers

apps/web/src/
├── routes/
│   └── _chat.$environmentId.$threadId.tsx   EXTEND: swap DiffPanelInlineSidebar → WorkspacePanelSidebar,
│                                                     add tab search param validator
├── components/workspace/
│   ├── WorkspacePanel.tsx                 NEW: the tab shell + resizable sidebar
│   ├── WorkspacePanelTabs.tsx             NEW: tab strip (Changes + Files + open files)
│   ├── FilesTreeTab.tsx                   NEW: tree view tab content (L1)
│   ├── FileTab.tsx                        NEW: a single file's tab content (L1–L2)
│   ├── FileViewer.tsx                     NEW: CodeMirror 6 wrapper, read-only / editable modes
│   ├── FileConflictBanner.tsx             NEW (L2): external-change conflict UI
│   ├── FileTree.tsx                       NEW: virtualized tree (using @tanstack/react-virtual)
│   ├── FileTree.logic.ts                  NEW: pure tree logic (expansion, sort, path normalization)
│   ├── FileTree.logic.test.ts             NEW
│   ├── FileTreeNode.tsx                   NEW: single row, rename mode (L4), git decorations (L5)
│   ├── CommandPalette.tsx                 NEW (L3): Cmd+P fuzzy finder
│   ├── CommandPalette.logic.ts            NEW (L3): fuzzy scoring, selection navigation
│   ├── CommandPalette.logic.test.ts       NEW (L3)
│   ├── CommandPalette.browser.tsx         NEW (L3): browser test
│   ├── FileContextMenu.tsx                NEW (L4): right-click actions
│   ├── FileViewer.browser.tsx             NEW (L2): CM6 dirty-state browser test
│   ├── FileTree.browser.tsx               NEW (L1): virtualized scroll browser test
│   └── resolveLanguage.ts                 NEW: extension → CM6 language pack (dynamic import)
├── workspace/
│   ├── workspaceStore.ts                  NEW: zustand store for tabs, tree, buffers (persisted)
│   ├── workspaceStore.test.ts             NEW
│   ├── workspaceRouteSearch.ts            NEW: TanStack Router search param parser for tab state
│   ├── workspaceRouteSearch.test.ts       NEW
│   └── useWorkspaceQueries.ts             NEW: React Query hooks wrapping new RPCs
└── hooks/                                 (no additions — resize guard stays inline in the route file and is passed as a prop)
```

## 6. Contracts

All new schemas are added to `packages/contracts/src/project.ts` alongside the existing `ProjectSearchEntries*` and `ProjectWriteFile*` schemas. All new RPCs are added to `packages/contracts/src/rpc.ts` `WS_METHODS` constant and the `WsRpcGroup`.

### 6.1 Read file

```typescript
export const PROJECT_READ_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB preview limit
export const PROJECT_EDIT_FILE_MAX_BYTES = 1 * 1024 * 1024; // 1 MB edit limit

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});

// Discriminated union — "can't show this" is a normal result, not an error.
// Errors are reserved for IO failures, permission denied, and path escape.
export const ProjectReadFileResult = Schema.Union([
  Schema.TaggedStruct("text", {
    contents: Schema.String,
    size: NonNegativeInt,
    sha256: Schema.String,
  }),
  Schema.TaggedStruct("binary", {
    size: NonNegativeInt,
    mime: Schema.optional(Schema.String),
  }),
  Schema.TaggedStruct("tooLarge", {
    size: NonNegativeInt,
    limit: NonNegativeInt,
  }),
]);

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}
```

### 6.2 List directory

```typescript
export const ProjectListDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: Schema.String, // "" for workspace root
  includeHidden: Schema.optional(Schema.Boolean), // default false, .gitignore always respected
});

export const ProjectListDirectoryResult = Schema.Struct({
  relativePath: Schema.String,
  entries: Schema.Array(ProjectEntry), // REUSE existing ProjectEntry schema
  truncated: Schema.Boolean,
});

export class ProjectListDirectoryError extends Schema.TaggedErrorClass<ProjectListDirectoryError>()(
  "ProjectListDirectoryError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}
```

### 6.3 Subscribe to a single file

```typescript
export const ProjectSubscribeFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});

export const ProjectFileEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    // emitted on initial subscribe and on reconnect
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("changed", {
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("deleted", {}),
]);

export class ProjectSubscribeFileError extends Schema.TaggedErrorClass<ProjectSubscribeFileError>()(
  "ProjectSubscribeFileError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}
```

### 6.4 File operations (L4)

```typescript
export const ProjectCreateFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.optional(Schema.String), // default ""
  overwrite: Schema.optional(Schema.Boolean), // default false
});
export const ProjectCreateFileResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });
export class ProjectCreateFileError extends Schema.TaggedErrorClass<ProjectCreateFileError>()(
  "ProjectCreateFileError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}

export const ProjectCreateDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export const ProjectCreateDirectoryResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });
export class ProjectCreateDirectoryError extends Schema.TaggedErrorClass<ProjectCreateDirectoryError>()(
  "ProjectCreateDirectoryError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}

export const ProjectRenameEntryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  nextRelativePath: TrimmedNonEmptyString.check(
    Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH),
  ),
});
export const ProjectRenameEntryResult = Schema.Struct({
  previousRelativePath: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString,
});
export class ProjectRenameEntryError extends Schema.TaggedErrorClass<ProjectRenameEntryError>()(
  "ProjectRenameEntryError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}

export const ProjectDeleteEntryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  recursive: Schema.optional(Schema.Boolean), // required for non-empty directories
});
export const ProjectDeleteEntryResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });
export class ProjectDeleteEntryError extends Schema.TaggedErrorClass<ProjectDeleteEntryError>()(
  "ProjectDeleteEntryError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect) },
) {}
```

### 6.5 New WS_METHODS and RPCs

```typescript
// Additions to packages/contracts/src/rpc.ts WS_METHODS
projectsReadFile:         "projects.readFile",
projectsListDirectory:    "projects.listDirectory",
subscribeProjectFile:     "subscribeProjectFile",
projectsCreateFile:       "projects.createFile",      // L4
projectsCreateDirectory:  "projects.createDirectory", // L4
projectsRenameEntry:      "projects.renameEntry",     // L4
projectsDeleteEntry:      "projects.deleteEntry",     // L4
```

Each RPC is defined via `Rpc.make(...)` following the existing pattern for `WsProjectsSearchEntriesRpc` / `WsProjectsWriteFileRpc`, and added to `WsRpcGroup`.

### 6.6 Why `projects.writeFile` is NOT modified

Client-side conflict detection (using `subscribeProjectFile` events + the buffer's `serverSha256`) protects against overwriting external changes. Before any save, the client compares `diskSha256` (latest from watch events) with `serverSha256` (what was originally read). On mismatch with a dirty buffer, the save is short-circuited and the conflict banner is shown instead.

This avoids any schema change to an existing RPC. If the race window (tens of milliseconds between the client check and the server write) becomes a problem, an optional `baseSha256` field can be added to `ProjectWriteFileInput` in a later layer as a backward-compatible schema extension.

## 7. Server

### 7.1 `WorkspaceFileSystem` service extension

`apps/server/src/workspace/Services/WorkspaceFileSystem.ts`:

```typescript
export interface WorkspaceFileSystemShape {
  // Existing
  readonly writeFile: (
    input: ProjectWriteFileInput,
  ) => Effect.Effect<
    ProjectWriteFileResult,
    WorkspaceFileSystemError | WorkspacePathOutsideRootError
  >;

  // L1
  readonly readFile: (
    input: ProjectReadFileInput,
  ) => Effect.Effect<ProjectReadFileResult, ProjectReadFileError | WorkspacePathOutsideRootError>;

  // L2
  readonly subscribeFile: (
    input: ProjectSubscribeFileInput,
  ) => Stream.Stream<ProjectFileEvent, ProjectSubscribeFileError | WorkspacePathOutsideRootError>;

  // L4
  readonly createFile: (
    input: ProjectCreateFileInput,
  ) => Effect.Effect<
    ProjectCreateFileResult,
    ProjectCreateFileError | WorkspacePathOutsideRootError
  >;

  readonly createDirectory: (
    input: ProjectCreateDirectoryInput,
  ) => Effect.Effect<
    ProjectCreateDirectoryResult,
    ProjectCreateDirectoryError | WorkspacePathOutsideRootError
  >;

  readonly renameEntry: (
    input: ProjectRenameEntryInput,
  ) => Effect.Effect<
    ProjectRenameEntryResult,
    ProjectRenameEntryError | WorkspacePathOutsideRootError
  >;

  readonly deleteEntry: (
    input: ProjectDeleteEntryInput,
  ) => Effect.Effect<
    ProjectDeleteEntryResult,
    ProjectDeleteEntryError | WorkspacePathOutsideRootError
  >;
}
```

### 7.2 Live layer implementation

`apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`:

- **`readFile`**: `WorkspacePaths.resolve` → `fs.stat` → size check → `fs.readFile` → binary detection on first 8 KB (scan for `\0` bytes, check UTF-16/UTF-32 BOMs) → compute `sha256` (via Node's `crypto` or the shared hash utility) → return tagged result.
- **`subscribeFile`**: **shared per-directory watcher** implementation (see R2). Internally, the `WorkspaceFileSystem` live layer maintains a refcounted map of `absoluteDirectory → { watcher, subscribers }`. A new subscription either joins an existing watcher for the file's parent directory or starts a new one via `@effect/platform-node`'s `FileSystem.watch` (`fs.watch(absoluteDirectory)`). Events are filtered by path and routed to matching subscribers. The last unsubscribe from a directory closes its watcher. Uses the debounce-and-sync pattern from `apps/server/src/serverSettings.ts:267-283` because `fs.watch` can fire before the file write is flushed. Emits a `snapshot` event immediately on subscribe (with current sha256 + size) so clients always have a baseline. Emits `changed` on debounced write events, `deleted` on unlink. On stream restart after a WebSocket reconnect, emits a fresh `snapshot` so clients can reconcile state.
- **`createFile`**, **`createDirectory`**, **`renameEntry`**, **`deleteEntry`**: straightforward `fs` operations wrapped in `Effect.tryPromise`, with path safety via `WorkspacePaths`. `renameEntry` uses `fs.rename` (atomic within a filesystem). `deleteEntry` uses `fs.rm` with the `recursive` flag from the input; non-recursive delete on a non-empty directory returns a tagged error.

### 7.3 New `WorkspaceTree` layer

`apps/server/src/workspace/Layers/WorkspaceTree.ts` (new file, sibling to `WorkspaceEntries`):

```typescript
export interface WorkspaceTreeShape {
  readonly listDirectory: (
    input: ProjectListDirectoryInput,
  ) => Effect.Effect<
    ProjectListDirectoryResult,
    ProjectListDirectoryError | WorkspacePathOutsideRootError
  >;
}
```

Implementation:

- Resolves the directory via `WorkspacePaths`.
- `fs.readdir` with `withFileTypes: true` for one directory level.
- Filters against `.git/` and any `.gitignore` rules using the **same mechanism used by `WorkspaceEntries`** (to be verified during L1 — if `WorkspaceEntries` uses a shared helper, extract it to `packages/shared/src/gitignore.ts` with an explicit subpath export; if it uses an inlined helper, copy the pattern into `WorkspaceTree` and file a follow-up to extract).
- `includeHidden` defaults to `false` and filters dotfiles.
- Sorts: directories first (alphabetical), then files (alphabetical). Stable.
- Enforces a per-call limit of **2000 entries**; if exceeded, `truncated: true` and the first 2000 (after sort) are returned. Intentionally higher than `searchEntries`'s 200 cap — a single directory rarely has thousands of files, and the tree is lazy so the limit is per-level, not global.

### 7.4 `wsServer.ts` handler registration

Three handlers wired in L1 (read, listDirectory, subscribe), then four more in L4 (createFile, createDirectory, renameEntry, deleteEntry). All follow the existing registration pattern used for `projects.searchEntries` and `projects.writeFile`.

## 8. Frontend

### 8.1 `WorkspacePanel`

`apps/web/src/components/workspace/WorkspacePanel.tsx` replaces the body of `DiffPanelInlineSidebar` in the route file. It uses the same shadcn `<Sidebar side="right" collapsible="offcanvas">` wrapper, the same `DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY` (`"chat_diff_sidebar_width"`) / resizable props so the right-panel width persists across the migration, and renders:

1. **Tab strip** — `WorkspacePanelTabs`, horizontally scrollable, `Changes` always first.
2. **Active tab content**, dispatched by `activeTab.kind`:
   - `"changes"` → `<LazyDiffPanel mode="sidebar" />` — existing code, unchanged.
   - `"files"` → `<FilesTreeTab cwd={...} />` — the tree view.
   - `"file"` → `<FileTab cwd={...} relativePath={activeTab.relativePath} />` — CM6 viewer/editor.

Responsive handling: `useMediaQuery("(max-width: 1180px)")` selects sheet vs sidebar, mirroring `_chat.$environmentId.$threadId.tsx`'s existing logic. On sheet mode the tab strip lives at the top of the sheet popup.

The existing composer-width-aware resize guard (`shouldAcceptInlineSidebarWidth`, currently inline in the route file at lines ~94-138) **is left in place, unmodified**, and passed to `WorkspacePanel` as a `shouldAcceptWidth` prop. This avoids deleting code from the route file, which would create phantom merge conflicts against any upstream edits to that guard. Both the legacy diff-panel code path (if we kept it for any reason) and the new `WorkspacePanel` use the same function instance via prop passing. Zero behavior change.

### 8.2 `workspaceStore`

`apps/web/src/workspace/workspaceStore.ts` — zustand store with the `persist` middleware.

```typescript
type WorkspaceTabId =
  | { kind: "changes" }
  | { kind: "files" }
  | { kind: "file"; relativePath: string };

type FileBuffer = {
  // From projects.readFile
  serverState: "loading" | "text" | "binary" | "tooLarge" | "error";
  serverContents: string | null;   // populated only when serverState === "text"
  serverSha256: string | null;
  serverSize: number | null;

  // Client-side edit state
  editorContents: string | null;   // null = clean (matches serverContents)
  isEditMode: boolean;             // default false
  isDirty: boolean;                // derived: editorContents !== null && editorContents !== serverContents
  cursor: { line: number; column: number } | null;

  // Conflict state (from subscribeProjectFile)
  diskSha256: string | null;
  diskSize: number | null;
  hasExternalChange: boolean;
};

type CwdState = {
  openTabs: WorkspaceTabId[];
  fileBuffers: Record<string, FileBuffer>; // key = relativePath
  treeExpansion: string[];                  // expanded directory relative paths
  wordWrap: boolean;                        // global per-cwd editor preference
};

type WorkspaceStore = {
  byCwd: Record<string, CwdState>;

  // Tab actions
  openFile(cwd: string, relativePath: string): void;
  closeTab(cwd: string, tabId: WorkspaceTabId): void;
  moveTab(cwd: string, fromIndex: number, toIndex: number): void;

  // Buffer actions
  setServerState(cwd: string, relativePath: string, state: /* ... */): void;
  setEditorContents(cwd: string, relativePath: string, contents: string | null): void;
  toggleEditMode(cwd: string, relativePath: string): void;

  // Tree actions
  toggleTreeNode(cwd: string, relativePath: string): void;

  // Conflict actions
  markExternalChange(cwd: string, relativePath: string, diskSha256: string, diskSize: number): void;
  resolveExternalChange(cwd: string, relativePath: string, choice: "keepMine" | "reload"): void;

  // Preferences
  setWordWrap(cwd: string, enabled: boolean): void;
};
```

**Persistence:** `persist` middleware writes `byCwd` to `localStorage` under key `chat_workspace_state` (matching the existing `chat_*` naming convention used by `chat_thread_sidebar_width` and `chat_diff_sidebar_width`). Dirty `editorContents` are persisted up to the edit limit (1 MB) per file. Buffers above that limit are stripped from persisted state (a warning is shown in the UI).

**Keyed by `cwd`**, not thread: open tabs survive thread switches within the same project. Switching projects implicitly swaps state via a different `cwd` key.

**Buffer eviction (deferred to post-L2):** an LRU policy that drops `serverContents` + `editorContents` from cold tabs (oldest non-dirty tabs, minimum 5 tabs kept hot). Lazy rehydration on tab re-activation via `projects.readFile`. Only implemented if empirically needed — start without it.

### 8.3 `workspaceRouteSearch`

`apps/web/src/workspace/workspaceRouteSearch.ts` — TanStack Router search param validator for the `tab` param:

```typescript
export type WorkspaceRouteSearch = {
  tab?: { kind: "changes" } | { kind: "files" } | { kind: "file"; relativePath: string };
};

export function parseWorkspaceRouteSearch(search: Record<string, unknown>): WorkspaceRouteSearch {
  /* ... */
}
```

The route file combines this parser with the existing `parseDiffRouteSearch`:

```typescript
export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => ({
    ...parseDiffRouteSearch(search),
    ...parseWorkspaceRouteSearch(search),
  }),
  // ...
});
```

`diffRouteSearch.ts` is **not modified**. The `diff=1` param continues to mean "right panel is open." If `diff=1` and `tab` is absent, the active tab defaults to `changes` — exact current behavior.

### 8.4 `useWorkspaceQueries`

`apps/web/src/workspace/useWorkspaceQueries.ts`:

```typescript
// L1
export function useFileContents(cwd: string, relativePath: string) {
  return useQuery({
    queryKey: ["workspace", cwd, "file", relativePath],
    queryFn: () => /* call projects.readFile via existing WS client */,
    // Updates workspaceStore.fileBuffers[relativePath].serverState / serverContents / serverSha256 in onSuccess/onError
  });
}

export function useDirectoryListing(cwd: string, relativePath: string) {
  return useQuery({
    queryKey: ["workspace", cwd, "dir", relativePath],
    queryFn: () => /* call projects.listDirectory */,
  });
}

// L2
export function useFileSubscription(cwd: string, relativePath: string) {
  // Manages the streaming projects.subscribeFile RPC.
  // On "snapshot" event during reconnect: compare sha256 with buffer.serverSha256.
  //   If different AND buffer.isDirty: mark hasExternalChange = true.
  //   If different AND NOT dirty: silent refresh (invalidate the file query).
  // On "changed": same logic.
  // On "deleted": mark the tab as stale, show banner.
}

export function useSaveFile() {
  return useMutation({
    mutationFn: ({ cwd, relativePath, contents }) => /* call projects.writeFile */,
    onSuccess: (_, { cwd, relativePath }) => {
      // Invalidate file query, invalidate git status query,
      // update buffer.serverSha256 to the new hash, clear isDirty.
    },
  });
}

// L4
export function useCreateFile() { /* mutation wrapping projects.createFile */ }
export function useCreateDirectory() { /* ... */ }
export function useRenameEntry() { /* ... */ }
export function useDeleteEntry() { /* ... */ }
```

### 8.5 `resolveLanguage`

`apps/web/src/components/workspace/resolveLanguage.ts` — extension → CodeMirror 6 language pack via dynamic import. All language packs are code-split; only loaded on demand.

```typescript
export async function resolveLanguage(relativePath: string): Promise<LanguageSupport | null> {
  const ext = relativePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return (await import("@codemirror/lang-javascript")).javascript({
        typescript: ext === "ts" || ext === "tsx",
        jsx: ext === "tsx" || ext === "jsx",
      });
    case "py":
      return (await import("@codemirror/lang-python")).python();
    case "md":
    case "markdown":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "html":
      return (await import("@codemirror/lang-html")).html();
    case "css":
      return (await import("@codemirror/lang-css")).css();
    case "yml":
    case "yaml":
      return (await import("@codemirror/lang-yaml")).yaml();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    case "rs":
      return (await import("@codemirror/lang-rust")).rust();
    case "go":
      return (await import("@codemirror/lang-go")).go();
    default:
      return null; // plain text fallback
  }
}
```

Additional language packs can be added as needed. Each new import must be a dynamic import to keep the base panel chunk small.

## 9. Layer-by-layer build plan

Each layer is its own branch off fork `main`, merged to fork `main` when the layer's "Done when" criteria pass and all checks (`bun fmt`, `bun lint`, `bun typecheck`, `bun run test`) are green.

### Layer 1 — Tree + Read-only Preview

**Branch:** `feat/workspace-layer-1-tree-preview`

**Scope:**

- Contracts: `projects.readFile`, `projects.listDirectory`
- Server: `WorkspaceFileSystem.readFile`, new `WorkspaceTree` layer, handler registration
- Web dependencies: add `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/search`, `@codemirror/language`, plus the language packs used by `resolveLanguage` (each loaded via dynamic import)
- Web shell: `WorkspacePanel`, `WorkspacePanelTabs`, `workspaceStore` (open tabs, tree expansion, basic file buffers), `workspaceRouteSearch`, `useFileContents`, `useDirectoryListing`
- Web content: `FilesTreeTab`, `FileTree` + `.logic`, `FileTreeNode` (no git decorations), `FileTab`, `FileViewer` (read-only only), `resolveLanguage`
- Route change: swap `DiffPanelInlineSidebar` for `WorkspacePanelSidebar`, add tab search param
- Tests: contract schema round-trips, `WorkspaceFileSystem.readFile` cases (text, binary, too-large, path escape), `WorkspaceTree.listDirectory` cases (root, nested, gitignore, truncation, path escape), `FileTree.logic` tests, `workspaceStore` tests

**Done when:** Open a thread, toggle the workspace panel (existing diff button), click the `Files` tab, expand `src/`, click a file, see its contents with syntax highlighting. Large files show "Too large to preview (N MB). Open externally." Binary files show "Binary file" with an "Open externally" button wired to `shell.openInEditor` with `editor: "file-manager"`. `bun run build` succeeds and the produced CodeMirror chunks are code-split by language (inspect `apps/web/dist/assets/`).

### Layer 2 — Inline Editor

**Branch:** `feat/workspace-layer-2-editor`

**Scope:**

- Contracts: `projects.subscribeFile` (streaming)
- Server: `WorkspaceFileSystem.subscribeFile` using `FileSystem.watch` + debounce pattern from `serverSettings.ts`
- Web: `FileViewer` extended with edit mode, save handler, dirty tracking, cursor persistence, word-wrap toggle; `FileConflictBanner`; `useFileSubscription`; `useSaveFile`; `useUnsavedChangesGuard`; `workspaceStore` gains `isEditMode`, `editorContents`, `diskSha256`, `hasExternalChange`, `resolveExternalChange`; persisted dirty buffers
- Tests: `WorkspaceFileSystem.subscribeFile` (emits snapshot on subscribe, emits changed on write, emits deleted on unlink, behaves correctly on reconnect), `FileViewer.browser.tsx` (dirty tracking, save shortcut, conflict banner), `workspaceStore` edit-mode tests

**Done when:** Open a file, click Edit, type, see dirty dot (`●`), press `Cmd+S`, dirty cleared, disk updated. Modify the file externally while the tab is dirty → conflict banner appears; click "Keep mine" → banner clears but dirty stays; click "Reload from disk" → buffer refreshes from disk. Modify the file externally while the tab is clean → silent refresh. Close a dirty tab → unsaved-changes dialog. Refresh the browser → dirty content (within 1 MB) is preserved.

### Layer 3 — Navigation (Tabs polish + Cmd+P)

**Branch:** `feat/workspace-layer-3-navigation`

**Scope:**

- Web: `CommandPalette` + `.logic` + `.browser` tests, `useCommandPalette` hook, tab drag-reorder via `@dnd-kit/sortable`, middle-click tab close, `Cmd+W` close, global `Cmd+P` keybinding
- Reuses existing `projects.searchEntries` — **zero new backend work**
- Keybinding registration via the existing system (investigate pattern in `apps/server/src/keybindings.ts` and `packages/contracts/src/keybindings.ts`)
- Tests: `CommandPalette.logic.test.ts` (fuzzy scoring, selection navigation, recency boost), `CommandPalette.browser.tsx` (keyboard nav, Enter opens tab)

**Done when:** `Cmd+P` opens the palette, typing "auth" filters results, arrow keys navigate, `Enter` opens the file as a new tab in the workspace panel (opening the panel first if closed). Drag a tab to reorder. `Cmd+W` closes the active tab; if no file tabs remain, active tab falls back to `Changes`. Middle-click closes any tab. Empty query shows recent files from the store.

### Layer 4 — File Operations

**Branch:** `feat/workspace-layer-4-file-ops`

**Scope:**

- Contracts: `projects.createFile`, `projects.createDirectory`, `projects.renameEntry`, `projects.deleteEntry`
- Server: four new methods on `WorkspaceFileSystem` (live layer), each with path safety via `WorkspacePaths`
- Web: `FileContextMenu` (shadcn `ContextMenu`), inline rename mode in `FileTreeNode`, destructive confirmation via shadcn `AlertDialog`, `useFileOperations` hook bundling the mutations, reveal/open-externally via existing `shell.openInEditor`
- Tests: server tests for each new RPC (happy, overwrite-without-flag, escape, non-empty recursive delete, non-existent source), logic tests for rename validation

**Done when:** Right-click a folder in the tree → New File → enter name → file appears in the tree and opens as a new tab. Rename a file → tree updates, any open tab for that file updates its relativePath in the store. Delete a file → confirmation dialog → file removed, associated tab closed. Duplicate, copy relative path, copy absolute path, reveal in file manager, open in external editor all work.

### Layer 5 — Git Decorations

**Branch:** `feat/workspace-layer-5-git-decorations`

**Scope:**

- Web: `useGitStatusMap` hook consuming the existing `subscribeGitStatus` streaming RPC; `FileTreeNode` renders status badges (`M` / `A` / `?` / `!`) with color classes matching the existing `DiffPanel` git palette; new store slice for the status map, scoped per `cwd`
- **Zero new backend work** — `subscribeGitStatus` already exists
- Tests: `useGitStatusMap.logic.test.ts` (map maintenance on added/removed/updated files)

**Done when:** Modify a file (via the editor or externally) → its tree row shows `M` with modified color. Create a new untracked file → `?` with untracked color. Stage the file → `A` with added color. Switch branches → the tree reflects the new baseline within one debounce window.

## 10. Testing strategy

Matches t3code's existing test conventions — no new infrastructure.

- **Contracts:** at minimum, add schema decode/encode tests for each new RPC's input/success/error. If contract tests are currently sparse, do not expand the scope beyond what the feature adds.
- **Server:** Effect-based layer tests in sibling `.test.ts` files. Pattern matches `WorkspaceFileSystem.test.ts` and `WorkspaceEntries.test.ts`. Use layer overrides to provide temp-directory filesystems. Cover happy paths, binary detection, too-large, path escape, gitignore respect, watch-emits-on-write, watch-emits-on-delete, snapshot-on-reconnect, and directory truncation.
- **Web pure logic:** `.logic.test.ts` files colocated with each `.logic.ts` module. Vitest, no DOM. Tree logic, command palette scoring, store actions, workspace route search parsing, git status map maintenance.
- **Web browser:** `.browser.tsx` files for interactions that require a real DOM, kept minimal. `FileTree.browser.tsx` (virtualized scroll, expand/collapse, drag), `FileViewer.browser.tsx` (CM6 dirty-state, save shortcut, word-wrap toggle), `CommandPalette.browser.tsx` (keyboard nav, selection).

**CI gates per layer branch:** `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` all green. Required.

## 11. Risks & mitigations

### R1 — CodeMirror 6 bundle bloat via eager language pack imports

**Impact:** slow panel open; large initial chunk.
**Mitigation:** every language pack goes behind `import()` in `resolveLanguage`. Vite's default chunking splits them automatically. Verify during L1 by building and inspecting `apps/web/dist/assets/` — each language pack should appear as its own small chunk. Fail the L1 done-criteria if the workspace panel's initial JS bundle exceeds 400 KB compressed.

### R2 — Linux inotify watch limit exhaustion

**Impact:** new file subscriptions silently fail after ~8K active watches per user on Linux.
**Mitigation:** `subscribeFile` implementation uses a **shared per-directory watcher** internally. One `fs.watch` per unique directory containing open files, with server-side routing of events to subscribers by path. Refcounted: the last unsubscribe closes the watcher. Watch count is bounded to "number of unique directories with open files" — dozens at most, not thousands.

### R3 — Binary detection false positives on UTF-16 / UTF-32

**Impact:** legitimate UTF-16-encoded text files show as "binary."
**Mitigation:** sniff first 8 KB for `\0` bytes AND check for UTF-16 / UTF-32 BOMs (`\xFF\xFE`, `\xFE\xFF`, `\x00\x00\xFE\xFF`, `\xFF\xFE\x00\x00`). If BOM is present, decode with the matching encoding and return as `text`. Covered by a unit test in `WorkspaceFileSystem.test.ts`.

### R4 — Upstream merge conflicts on the route file

**Impact:** `_chat.$environmentId.$threadId.tsx` is the one existing React file we modify, and it is actively developed upstream.
**Mitigation:** the change to this file is deliberately **minimal and localized** — swap `DiffPanelInlineSidebar` → `WorkspacePanelSidebar`, add one search param validator. Everything else stays identical. Upstream changes to `ChatView` integration, resize logic, or responsive behavior flow through cleanly because our diff footprint is a single component replacement plus a search parser addition.

### R5 — Many open tabs eat memory

**Impact:** 50 tabs with multi-MB buffers = hundreds of MB in browser.
**Mitigation:** Deferred buffer eviction. L1–L2 keep all buffers hot. If empirically needed, add an LRU policy: store holds full contents for the 5 most recently accessed tabs; older non-dirty tabs drop `serverContents` + `editorContents` and lazy-rehydrate on re-activation. Dirty buffers are pinned.

### R6 — CodeMirror 6 key capture conflicts with existing t3code shortcuts

**Impact:** `Cmd+K`, `Cmd+Enter`, `Cmd+P`, etc. might be captured by CM6 when the editor has focus.
**Mitigation:** configure CM6's keymap to explicitly `run: () => false` (bubble up) on any key registered in t3code's keybinding system. The keybinding registry exposes the active shortcut set. Tested in `FileViewer.browser.tsx`.

### R7 — Race: user clicks Save → file is modified externally → writeFile overwrites

**Impact:** external edit silently lost.
**Mitigation:** client-side precondition check **just before** the `projects.writeFile` call. Compare `buffer.diskSha256` (latest from `subscribeFile`) with `buffer.serverSha256` (what was originally read). If they differ AND the buffer is dirty, short-circuit the save and set `hasExternalChange = true`. User gets the conflict banner instead of an overwrite. Race window reduced to tens of milliseconds between the client check and the server write — acceptable for a single-user dev tool. If this becomes a problem, add an optional `baseSha256` field to `ProjectWriteFileInput` in a follow-up.

### R8 — Path separators on Windows

**Impact:** relative paths stored with forward slashes but OS uses backslashes — tree expansion keys mismatch.
**Mitigation:** normalize to forward slashes at every boundary — contracts, store keys, React Query keys, URL params. Server path operations happen on absolute OS paths inside `WorkspacePaths`; forward-slash relative paths are the public boundary. Primary development on macOS; Windows is verified manually during L4 (when file operations introduce rename/create).

### R9 — `projects.searchEntries` semantics may be insufficient for Cmd+P

**Impact:** L3 may need a new backend RPC.
**Verification:** at start of L3, read `WorkspaceEntries` layer to confirm (a) empty-or-wildcard query semantics, (b) result ordering, (c) whether it walks the whole tree or only a subtree. If insufficient, extend `WorkspaceEntries` or add `projects.fuzzyFind` within L3 scope.

### R10 — Dirty buffer persistence vs localStorage quota

**Impact:** large in-progress edits could exceed the ~5-10 MB localStorage budget.
**Mitigation:** cap persisted dirty buffers at 1 MB per file (matches the edit limit). Above that, don't persist; show a UI hint ("Unsaved changes in this file won't survive a refresh — save to persist"). IndexedDB is an escape hatch if this becomes painful.

## 12. Open items to resolve during L1 implementation

These are not blocking for the design, but need to be answered before L1 implementation can progress:

1. **`.gitignore` parsing reuse.** Does `WorkspaceEntries` use a library (e.g. the `ignore` npm package) or a hand-rolled mechanism? `WorkspaceTree` must use the same. If there is a shared helper, reuse; if not, extract the pattern during L1 and file a follow-up to share.
2. **SHA-256 utility.** Is there an existing utility in `packages/shared/`? If yes, reuse; if not, add `packages/shared/src/hash.ts` exported via explicit subpath (`@t3tools/shared/hash`). No barrel.
3. **Contract schema test convention.** Existing contracts appear to have light-to-no test coverage. Match the convention: add minimal decode/encode tests only for the new schemas; do not expand existing coverage as part of this work.
4. **`@effect/platform-node` `FileSystem.watch` error semantics.** Confirm debounce + sync-on-reconnect pattern during L2 implementation by reading `apps/server/src/serverSettings.ts:267-283` closely.

## 13. References

- `pingdotgg/t3code#763` — open feature request for file explorer + preview.
- `pingdotgg/t3code#1494` — prior attempt (closed, 5760 additions / 34 files, self-closed without merge). Worth reading during L1 implementation for its client-side approach to Monaco integration, but the backend portion is obsoleted by existing RPCs.
- `pingdotgg/t3code#1333` — small earlier fix for file-explorer-related issues, closed because the author accidentally opened the PR.
- `AGENTS.md` (root of repo) — project conventions and priorities.
- Upstream `DiffPanelShell` modes and the existing `?diff=1` responsive behavior: `apps/web/src/routes/_chat.$environmentId.$threadId.tsx`.
- Effect `FileSystem.watch` pattern: `apps/server/src/serverSettings.ts:267-283`.
- CodeMirror 6 documentation: https://codemirror.net/
