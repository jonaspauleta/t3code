# T3 Code Workspace Layer 2 (Inline Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-app file viewer editable. Clicking a file still opens it in read-only preview (per the L1 safety model), but now the file tab has an **Edit** toggle that enables writing. `Cmd/Ctrl+S` saves via existing `projects.writeFile`. Dirty buffers show a `●` dot on the tab and survive browser refresh (up to 1 MB per file). A new streaming `projects.subscribeFile` RPC watches opened files on disk; external changes either silently refresh a clean buffer or surface a conflict banner on a dirty one.

**Architecture:** Extend `WorkspaceFileSystem` service with a streaming `subscribeFile` method that wraps `FileSystem.watch` behind a **shared per-directory watcher** (R2 mitigation). Add one new RPC. On the client, extend `workspaceStore` with edit state (`isEditMode`, `editorContents`, `isDirty`, `diskSha256`, `hasExternalChange`, `cursor`, plus a per-cwd `wordWrap` preference) and persist dirty edits through zustand's `persist` middleware. `FileViewer` gains edit mode, `onChange` tracking, cursor persistence, word-wrap extension, and a `FileConflictBanner`. `FileTab` header gets an Edit/Save/Word-wrap toolbar. `useUnsavedChangesGuard` intercepts tab close / panel close / browser navigation for dirty buffers.

**Tech Stack:** Inherited from Layer 1 — Node 24 + Bun + Effect 4.0 beta + `@effect/vitest` + `@effect/platform-node` + React 19 + Vite + TanStack Router + React Query + zustand + CodeMirror 6 + oxlint + oxfmt. **No new deps.**

**Reference material:**

- Design spec: `docs/superpowers/specs/2026-04-09-t3code-file-explorer-design.md` (Layer 2 in §9, contracts in §6.3, server in §7.2, store in §8.2, risks R2 + R7 in §11)
- Layer 1 plan: `docs/superpowers/plans/2026-04-09-t3code-workspace-layer-1.md` — **follow the same patterns** for contracts/server/web boilerplate
- Existing debounce pattern for `fs.watch`: `apps/server/src/serverSettings.ts:267-283`
- Existing streaming RPC pattern: `subscribeGitStatus` in `apps/server/src/ws.ts` + `packages/contracts/src/rpc.ts`

**Pre-flight checklist (run once before Task 1.1):**

- [ ] Confirm branch: `git checkout -b feat/workspace-layer-2-editor` off `feat/workspace-layer-1-tree-preview` (or off fork `main` once L1 is merged)
- [ ] `bun install` clean
- [ ] `bun typecheck && bun lint && bun fmt:check && bun run test` all green on the base branch
- [ ] Skim spec §6.3 + §7.2 + §8.2 + §11 (R2, R7, R10)
- [ ] Read `apps/server/src/serverSettings.ts:267-283` (debounce pattern)
- [ ] Read `apps/server/src/ws.ts` search for `subscribeGitStatus` (streaming handler pattern)

---

## File structure

### Contracts (`packages/contracts/src/`)

| File              | Action | Responsibility                                                                                                                               |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.ts`      | MODIFY | Add `ProjectSubscribeFileInput`, `ProjectFileEvent`, `ProjectSubscribeFileError`.                                                            |
| `rpc.ts`          | MODIFY | Add `WS_METHODS.subscribeProjectFile` + `WsSubscribeProjectFileRpc` (streaming) + include in `WsRpcGroup`.                                   |
| `ipc.ts`          | MODIFY | Extend `EnvironmentApi.projects` with an `onFile` stream subscription method (matches the `onStatus` pattern used for git in the same file). |
| `project.test.ts` | MODIFY | Add 2-3 decode tests for the new schemas.                                                                                                    |

### Server (`apps/server/src/`)

| File                                           | Action | Responsibility                                                                                                    |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `workspace/Services/WorkspaceFileSystem.ts`    | MODIFY | Add `subscribeFile` to `WorkspaceFileSystemShape`.                                                                |
| `workspace/Layers/WorkspaceFileSystem.ts`      | MODIFY | Implement `subscribeFile` with shared per-directory watcher + debounce.                                           |
| `workspace/Layers/WorkspaceFileSystem.test.ts` | MODIFY | Add ≥4 tests: snapshot on subscribe, changed on write, deleted on unlink, multiple subscribers share one watcher. |
| `ws.ts`                                        | MODIFY | Register `subscribeProjectFile` RPC handler via `observeRpcStream`.                                               |

### Web (`apps/web/src/`)

| File                                          | Action | Responsibility                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wsRpcClient.ts`                              | MODIFY | Add `onFile` stream method on the `projects` surface (matches existing `git.onStatus` pattern).                                                                                                                                                                                                          |
| `environmentApi.ts`                           | MODIFY | Expose the new stream method via `EnvironmentApi.projects`.                                                                                                                                                                                                                                              |
| `lib/workspaceReactQuery.ts`                  | MODIFY | Add `useFileSubscription` hook (manages a single subscription per cwd+relativePath) and `useSaveFile` mutation.                                                                                                                                                                                          |
| `workspace/workspaceStore.ts`                 | MODIFY | Extend `FileBuffer` with edit state. Add per-cwd `wordWrap`. Add actions: `toggleEditMode`, `setEditorContents`, `setCursor`, `markDiskSnapshot`, `markExternalChange`, `resolveExternalChange`, `clearDirty`, `setWordWrap`. Update `partialize` to persist dirty `editorContents` up to 1 MB per file. |
| `workspace/workspaceStore.test.ts`            | MODIFY | Add edit-mode tests: toggleEditMode, setEditorContents sets dirty, clearDirty, resolveExternalChange.                                                                                                                                                                                                    |
| `hooks/useUnsavedChangesGuard.ts`             | CREATE | `beforeunload` + router navigation intercept hook that shows a confirmation when any dirty buffers exist for the active cwd.                                                                                                                                                                             |
| `components/workspace/FileViewer.tsx`         | MODIFY | Accept `isEditMode`, `initialContents`, `onContentChange`, `onCursorChange`, `wordWrap` props. Remove read-only binding when `isEditMode`. Add `EditorView.updateListener` for content + cursor changes. Add the word-wrap extension (`EditorView.lineWrapping`) conditionally.                          |
| `components/workspace/FileTab.tsx`            | MODIFY | Read edit state from store. Render a toolbar (Edit toggle, Save button, Word-wrap toggle). Wire `Cmd/Ctrl+S` keybinding. Render `FileConflictBanner` when `hasExternalChange`. Start a `useFileSubscription` subscription.                                                                               |
| `components/workspace/FileConflictBanner.tsx` | CREATE | Three buttons: **Keep mine**, **Reload from disk**, plus a "File was changed on disk" message.                                                                                                                                                                                                           |
| `components/workspace/WorkspacePanelTabs.tsx` | MODIFY | Render a `●` dirty indicator next to the file name when the buffer is dirty; read state from store.                                                                                                                                                                                                      |

---

## Phase 1 — Contracts

### Task 1.1: Add `ProjectSubscribeFile*` schemas

**File:** MODIFY `packages/contracts/src/project.ts`

**Step 1:** Append the schemas after the existing `ProjectListDirectoryError` class (added in L1):

```typescript
// ---------- Subscribe file (workspace Layer 2) ----------

export const ProjectSubscribeFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectSubscribeFileInput = typeof ProjectSubscribeFileInput.Type;

/**
 * Events emitted by `projects.subscribeFile`. "snapshot" is emitted on every
 * fresh subscription (including after a WebSocket reconnect) so clients always
 * have a baseline to reconcile against. "changed" is emitted after any
 * debounced filesystem write. "deleted" is emitted on unlink.
 */
export const ProjectFileEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("changed", {
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("deleted", {}),
]);
export type ProjectFileEvent = typeof ProjectFileEvent.Type;

export class ProjectSubscribeFileError extends Schema.TaggedErrorClass<ProjectSubscribeFileError>()(
  "ProjectSubscribeFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
```

**Step 2:** `bun run --filter @t3tools/contracts typecheck && bun run build:contracts` — expect success.

**Step 3:** Commit:

```
git add packages/contracts/src/project.ts
git commit -m "feat(contracts): add ProjectSubscribeFile schemas"
```

### Task 1.2: Register the streaming RPC in `rpc.ts`

**File:** MODIFY `packages/contracts/src/rpc.ts`

**Step 1:** Update the `./project` import block to include the new schemas:

```typescript
import {
  ProjectFileEvent,
  ProjectListDirectoryError,
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSubscribeFileError,
  ProjectSubscribeFileInput,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
```

**Step 2:** Add `subscribeProjectFile: "subscribeProjectFile"` to `WS_METHODS` alongside `subscribeGitStatus`:

```typescript
  // Streaming subscriptions
  subscribeGitStatus: "subscribeGitStatus",
  subscribeOrchestrationDomainEvents: "subscribeOrchestrationDomainEvents",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeProjectFile: "subscribeProjectFile",  // ADD
```

**Step 3:** Add the RPC definition near the other subscribe RPCs (look for `WsSubscribeGitStatusRpc` and add nearby):

```typescript
export const WsSubscribeProjectFileRpc = Rpc.make(WS_METHODS.subscribeProjectFile, {
  payload: ProjectSubscribeFileInput,
  success: ProjectFileEvent,
  error: ProjectSubscribeFileError,
  stream: true,
});
```

**Step 4:** Add `WsSubscribeProjectFileRpc` to the `WsRpcGroup = RpcGroup.make(...)` list near `WsSubscribeGitStatusRpc`.

**Step 5:** `bun run --filter @t3tools/contracts typecheck && bun run build:contracts` — expect success.

**Step 6:** Commit:

```
git add packages/contracts/src/rpc.ts
git commit -m "feat(contracts): register subscribeProjectFile streaming RPC"
```

### Task 1.3: Add `onFile` to `EnvironmentApi`

**File:** MODIFY `packages/contracts/src/ipc.ts`

**Step 1:** Update the `./project` import block to include the new types:

```typescript
import {
  ProjectFileEvent,
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSubscribeFileInput,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
```

**Step 2:** Extend `EnvironmentApi.projects`:

```typescript
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
    readFile: (input: ProjectReadFileInput) => Promise<ProjectReadFileResult>;
    listDirectory: (input: ProjectListDirectoryInput) => Promise<ProjectListDirectoryResult>;
    onFile: (
      input: ProjectSubscribeFileInput,
      callback: (event: ProjectFileEvent) => void,
      options?: { onResubscribe?: () => void },
    ) => () => void;
  };
```

The `onFile` signature matches the `onStatus` pattern in `git` on the same interface. The return is an unsubscribe function.

**Step 3:** `bun run --filter @t3tools/contracts typecheck` — expect success.

**Step 4:** Commit:

```
git add packages/contracts/src/ipc.ts
git commit -m "feat(contracts): add onFile stream subscription to EnvironmentApi"
```

### Task 1.4: Add schema decode tests

**File:** MODIFY `packages/contracts/src/project.test.ts`

**Step 1:** Add new imports + decode fns near the top:

```typescript
import {
  ProjectFileEvent,
  ProjectSubscribeFileInput,
  // ... existing imports ...
} from "./project";

const decodeSubscribeFileInput = Schema.decodeUnknownSync(ProjectSubscribeFileInput);
const decodeFileEvent = Schema.decodeUnknownSync(ProjectFileEvent);
```

**Step 2:** Add this describe block:

```typescript
describe("ProjectSubscribeFileInput", () => {
  it("accepts a cwd and relativePath", () => {
    const parsed = decodeSubscribeFileInput({
      cwd: "/repo",
      relativePath: "src/index.ts",
    });
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.relativePath).toBe("src/index.ts");
  });
});

describe("ProjectFileEvent", () => {
  it("decodes a snapshot event", () => {
    const parsed = decodeFileEvent({ _tag: "snapshot", sha256: "abc", size: 42 });
    expect(parsed._tag).toBe("snapshot");
  });

  it("decodes a changed event", () => {
    const parsed = decodeFileEvent({ _tag: "changed", sha256: "def", size: 100 });
    expect(parsed._tag).toBe("changed");
  });

  it("decodes a deleted event", () => {
    const parsed = decodeFileEvent({ _tag: "deleted" });
    expect(parsed._tag).toBe("deleted");
  });

  it("rejects an unknown tag", () => {
    expect(() => decodeFileEvent({ _tag: "mystery", sha256: "x", size: 0 })).toThrow();
  });
});
```

**Step 3:** `bun run --filter @t3tools/contracts test` — expect new tests pass, existing tests unchanged.

**Step 4:** Commit:

```
git add packages/contracts/src/project.test.ts
git commit -m "test(contracts): add schema decode tests for subscribeProjectFile"
```

### Task 1.5: Stub for `onFile` on web side

**Files:**

- MODIFY `apps/web/src/wsRpcClient.ts`
- MODIFY `apps/web/src/environmentApi.ts`

Just like the L1 Phase 1 stub cascade, adding to `EnvironmentApi` breaks typecheck for `apps/web/src/environmentApi.ts`, which must implement the interface. We can't leave it unimplemented even temporarily.

**Step 1:** Extend the `projects` section of `wsRpcClient.ts` with the `onFile` method. Use the existing `git.onStatus` implementation as a template — it already wires a streaming RPC via `observeStream` (or similar). Find the `git.onStatus` implementation in `wsRpcClient.ts` and mirror it:

```typescript
  readonly projects: {
    readonly searchEntries: RpcUnaryMethod<typeof WS_METHODS.projectsSearchEntries>;
    readonly writeFile: RpcUnaryMethod<typeof WS_METHODS.projectsWriteFile>;
    readonly readFile: RpcUnaryMethod<typeof WS_METHODS.projectsReadFile>;
    readonly listDirectory: RpcUnaryMethod<typeof WS_METHODS.projectsListDirectory>;
    readonly onFile: (
      input: RpcInput<typeof WS_METHODS.subscribeProjectFile>,
      listener: (event: ProjectFileEvent) => void,
      options?: StreamSubscriptionOptions,
    ) => () => void;
  };
```

(`RpcInput`, `StreamSubscriptionOptions`, and `ProjectFileEvent` are all imported at the top; mirror the git `onStatus` import pattern.)

**Step 2:** Implement `onFile` in the `projects` block, mirroring the existing `git.onStatus` implementation. The exact shape depends on whatever `observeStream`/`subscribe` helper is already used — **do not** write this from scratch. Find how `onStatus` is implemented and copy the structure verbatim, substituting `WS_METHODS.subscribeProjectFile` for `WS_METHODS.subscribeGitStatus` and `ProjectFileEvent` for `GitStatusResult`.

**Step 3:** Extend `environmentApi.ts` `projects` block:

```typescript
    projects: {
      searchEntries: rpcClient.projects.searchEntries,
      writeFile: rpcClient.projects.writeFile,
      readFile: rpcClient.projects.readFile,
      listDirectory: rpcClient.projects.listDirectory,
      onFile: (input, callback, options) => rpcClient.projects.onFile(input, callback, options),
    },
```

**Step 4:** `bun typecheck` — expect success across all 8 packages.

**Step 5:** Commit:

```
git add apps/web/src/wsRpcClient.ts apps/web/src/environmentApi.ts
git commit -m "feat(web): wire onFile stream subscription through wsRpcClient + environmentApi"
```

---

## Phase 2 — Server: `WorkspaceFileSystem.subscribeFile`

### Task 2.1: Extend the service interface

**File:** MODIFY `apps/server/src/workspace/Services/WorkspaceFileSystem.ts`

**Step 1:** Update imports to add the new types:

```typescript
import type {
  ProjectFileEvent,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSubscribeFileInput,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { ProjectReadFileError, ProjectSubscribeFileError } from "@t3tools/contracts";
```

**Step 2:** Import `Stream` type alongside `Effect`:

```typescript
import type { Effect, Stream } from "effect";
```

**Step 3:** Add `subscribeFile` to `WorkspaceFileSystemShape`:

```typescript
  /**
   * Subscribe to filesystem events for a single file, relative to the
   * workspace root.
   *
   * Emits a `snapshot` event immediately on subscribe (with the current
   * sha256 + size) so clients always have a baseline. Emits `changed` on
   * any debounced write. Emits `deleted` on unlink. On stream restart
   * after a WebSocket reconnect, emits a fresh `snapshot` so clients can
   * reconcile state.
   *
   * Internally uses a shared per-directory watcher (refcounted) so many
   * subscriptions for files in the same directory cost exactly one
   * `fs.watch` handle — this bounds Linux inotify watch usage.
   */
  readonly subscribeFile: (
    input: ProjectSubscribeFileInput,
  ) => Stream.Stream<ProjectFileEvent, ProjectSubscribeFileError | WorkspacePathOutsideRootError>;
```

**Step 4:** `bun run --filter t3 typecheck` — expect **failure** because the live layer doesn't implement `subscribeFile` yet. That's intentional TDD red.

**Step 5:** Do NOT commit yet — this lands together with the live implementation in Task 2.3.

### Task 2.2: Write failing tests

**File:** MODIFY `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

**Step 1:** Add imports at the top:

```typescript
import { Chunk, Fiber, Ref, Stream } from "effect";
```

(and `createHash` from `node:crypto` should already be there from L1 Phase 2).

**Step 2:** Add a new `describe("subscribeFile", ...)` block inside the existing `it.layer(TestLayer)("WorkspaceFileSystemLive", (it) => { ... })`:

```typescript
describe("subscribeFile", () => {
  it.effect("emits a snapshot event immediately on subscribe", () =>
    Effect.gen(function* () {
      const workspaceFileSystem = yield* WorkspaceFileSystem;
      const cwd = yield* makeTempDir;
      const contents = "hello\n";
      yield* writeTextFile(cwd, "src/hello.txt", contents);

      // Take the first event from the stream with a timeout.
      const first = yield* workspaceFileSystem
        .subscribeFile({ cwd, relativePath: "src/hello.txt" })
        .pipe(Stream.take(1), Stream.runCollect, Effect.timeout("2 seconds"));

      const events = Chunk.toReadonlyArray(first);
      expect(events).toHaveLength(1);
      const first0 = events[0]!;
      expect(first0._tag).toBe("snapshot");
      if (first0._tag !== "snapshot") throw new Error("unreachable");
      expect(first0.size).toBe(Buffer.byteLength(contents, "utf8"));
      expect(first0.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    }),
  );

  it.effect("emits a changed event when the file is written", () =>
    Effect.gen(function* () {
      const workspaceFileSystem = yield* WorkspaceFileSystem;
      const cwd = yield* makeTempDir;
      yield* writeTextFile(cwd, "a.txt", "original");

      // Start the subscription in the background.
      const collected = yield* Ref.make<ReadonlyArray<ProjectFileEvent>>([]);
      const fiber = yield* workspaceFileSystem.subscribeFile({ cwd, relativePath: "a.txt" }).pipe(
        Stream.take(2), // snapshot + changed
        Stream.runForEach((event) => Ref.update(collected, (events) => [...events, event])),
        Effect.fork,
      );

      // Wait for the snapshot to arrive.
      yield* Effect.sleep("150 millis");

      // Modify the file externally.
      yield* writeTextFile(cwd, "a.txt", "modified");

      // Wait for the fiber to consume both events.
      yield* Fiber.join(fiber).pipe(Effect.timeout("3 seconds"));
      const events = yield* Ref.get(collected);
      expect(events).toHaveLength(2);
      expect(events[0]?._tag).toBe("snapshot");
      expect(events[1]?._tag).toBe("changed");
    }),
  );

  it.effect("emits a deleted event when the file is unlinked", () =>
    Effect.gen(function* () {
      const workspaceFileSystem = yield* WorkspaceFileSystem;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* makeTempDir;
      yield* writeTextFile(cwd, "gone.txt", "bye");

      const collected = yield* Ref.make<ReadonlyArray<ProjectFileEvent>>([]);
      const fiber = yield* workspaceFileSystem
        .subscribeFile({ cwd, relativePath: "gone.txt" })
        .pipe(
          Stream.take(2),
          Stream.runForEach((event) => Ref.update(collected, (events) => [...events, event])),
          Effect.fork,
        );

      yield* Effect.sleep("150 millis");
      yield* fileSystem.remove(path.join(cwd, "gone.txt")).pipe(Effect.orDie);
      yield* Fiber.join(fiber).pipe(Effect.timeout("3 seconds"));

      const events = yield* Ref.get(collected);
      expect(events[0]?._tag).toBe("snapshot");
      expect(events[1]?._tag).toBe("deleted");
    }),
  );

  it.effect("multiple subscribers to files in the same directory share one watcher", () =>
    Effect.gen(function* () {
      const workspaceFileSystem = yield* WorkspaceFileSystem;
      const cwd = yield* makeTempDir;
      yield* writeTextFile(cwd, "src/a.txt", "a");
      yield* writeTextFile(cwd, "src/b.txt", "b");

      // This test doesn't directly inspect the watcher refcount map
      // (which is internal state), but it verifies that two parallel
      // subscriptions to files in the same directory both receive
      // events independently. If the implementation accidentally
      // cross-wired them, `a` events would end up in `b`'s stream or
      // vice versa.
      const aCollected = yield* Ref.make<ReadonlyArray<ProjectFileEvent>>([]);
      const bCollected = yield* Ref.make<ReadonlyArray<ProjectFileEvent>>([]);

      const aFiber = yield* workspaceFileSystem
        .subscribeFile({ cwd, relativePath: "src/a.txt" })
        .pipe(
          Stream.take(2),
          Stream.runForEach((event) => Ref.update(aCollected, (e) => [...e, event])),
          Effect.fork,
        );
      const bFiber = yield* workspaceFileSystem
        .subscribeFile({ cwd, relativePath: "src/b.txt" })
        .pipe(
          Stream.take(2),
          Stream.runForEach((event) => Ref.update(bCollected, (e) => [...e, event])),
          Effect.fork,
        );

      yield* Effect.sleep("150 millis");
      yield* writeTextFile(cwd, "src/a.txt", "a2");
      yield* writeTextFile(cwd, "src/b.txt", "b2");

      yield* Fiber.join(aFiber).pipe(Effect.timeout("3 seconds"));
      yield* Fiber.join(bFiber).pipe(Effect.timeout("3 seconds"));

      const aEvents = yield* Ref.get(aCollected);
      const bEvents = yield* Ref.get(bCollected);
      expect(aEvents).toHaveLength(2);
      expect(bEvents).toHaveLength(2);
    }),
  );
});
```

Add `type ProjectFileEvent` to the existing `@t3tools/contracts` type import at the top of the file.

**Step 3:** Run tests — expect FAILURE because `subscribeFile` is not implemented.

```
bun run --filter t3 test -- WorkspaceFileSystem
```

### Task 2.3: Implement `subscribeFile` in the live layer

**File:** MODIFY `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`

This task is the single most complex piece of Layer 2. Read the existing live layer first (`makeWorkspaceFileSystem`) so you have context for where to add code.

**Step 1:** Update imports:

```typescript
import { createHash } from "node:crypto";

import { Effect, FileSystem, Layer, Path, Ref, Stream, HashMap } from "effect";

import type {
  ProjectFileEvent,
  ProjectReadFileResult,
  ProjectSubscribeFileInput,
} from "@t3tools/contracts";
import {
  PROJECT_READ_FILE_MAX_BYTES,
  ProjectReadFileError,
  ProjectSubscribeFileError,
} from "@t3tools/contracts";
// ... existing imports ...
```

**Step 2:** Before `export const makeWorkspaceFileSystem`, add a helper that computes the sha256 + size of a file at an absolute path and wraps IO errors into `ProjectSubscribeFileError`:

```typescript
const DEBOUNCE_DURATION = "150 millis" as const;

function snapshotFile(
  fileSystem: FileSystem.FileSystem,
  absolutePath: string,
): Effect.Effect<
  { readonly sha256: string; readonly size: number } | null,
  ProjectSubscribeFileError
> {
  return fileSystem.stat(absolutePath).pipe(
    Effect.flatMap((stat) => {
      const size = Number(stat.size);
      return fileSystem.readFile(absolutePath).pipe(
        Effect.map((bytes) => {
          const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          return {
            sha256: createHash("sha256").update(buffer).digest("hex"),
            size,
          };
        }),
      );
    }),
    Effect.catchAll((cause) =>
      // Missing file is not an error from the snapshot helper — the caller
      // decides whether to emit a "deleted" event or propagate.
      "_tag" in (cause as object) && (cause as { _tag?: string })._tag === "SystemError"
        ? Effect.succeed(null)
        : Effect.fail(
            new ProjectSubscribeFileError({
              message: `Failed to snapshot workspace file: ${(cause as Error).message ?? String(cause)}`,
              cause,
            }),
          ),
    ),
  );
}
```

**Step 3:** Inside `makeWorkspaceFileSystem = Effect.gen(...)`, after the existing resolutions (`const fileSystem = yield* FileSystem.FileSystem;` etc.) but before the method definitions, add a **shared per-directory watcher map**. Because Effect's `FileSystem.watch` returns a `Stream`, we need a refcounted registry that multiplexes events from one physical watcher to many subscribers:

```typescript
// Per-directory watcher registry. Key is the absolute directory path.
// Each entry holds a `PubSub.PubSub<WatchEvent>` that all subscribers
// for files in that directory consume. Refcount tracks how many active
// subscribers are using the pub-sub so we can tear it down when the
// last subscriber leaves.
interface DirectoryWatcherEntry {
  readonly pubsub: PubSub.PubSub<WatchEvent>;
  readonly refcount: number;
  readonly fiber: Fiber.RuntimeFiber<void, never>;
}
type WatchEvent =
  | { readonly _tag: "change"; readonly absolutePath: string }
  | { readonly _tag: "remove"; readonly absolutePath: string };

const watchers = yield * Ref.make(HashMap.empty<string, DirectoryWatcherEntry>());
```

Then add three helpers: `acquireWatcher(directory)`, `releaseWatcher(directory)`, and the actual subscription builder. **Effect's `PubSub` + refcounting is fiddly** — follow this structure:

```typescript
const acquireDirectoryWatcher = (
  directory: string,
): Effect.Effect<PubSub.PubSub<WatchEvent>, ProjectSubscribeFileError> =>
  Ref.modify(watchers, (map) => {
    const existing = HashMap.get(map, directory);
    if (Option.isSome(existing)) {
      const next = { ...existing.value, refcount: existing.value.refcount + 1 };
      return [Effect.succeed(existing.value.pubsub), HashMap.set(map, directory, next)] as const;
    }
    // Return a setup effect that the caller must run to actually create
    // the watcher and pub-sub. We'll populate the map when setup completes.
    return [startDirectoryWatcher(directory), map] as const;
  }).pipe(Effect.flatten);

const startDirectoryWatcher = (
  directory: string,
): Effect.Effect<PubSub.PubSub<WatchEvent>, ProjectSubscribeFileError> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<WatchEvent>();
    // fileSystem.watch returns a Stream of FileSystem events.
    // We map each to our local WatchEvent union and publish to the pubsub.
    // Debounce within a short window (matching serverSettings.ts:267-283)
    // so bursts of writes produce one "change" event.
    const stream = fileSystem.watch(directory).pipe(
      Stream.groupedWithin(100, DEBOUNCE_DURATION),
      Stream.mapConcat((events) => {
        // Dedupe by absolutePath, last event wins.
        const byPath = new Map<string, WatchEvent>();
        for (const event of events) {
          const absolutePath = event.path; // exact field name depends on platform module
          if (event._tag === "Remove") {
            byPath.set(absolutePath, { _tag: "remove", absolutePath });
          } else {
            byPath.set(absolutePath, { _tag: "change", absolutePath });
          }
        }
        return Array.from(byPath.values());
      }),
      Stream.tap((event) => PubSub.publish(pubsub, event)),
    );
    const fiber = yield* stream.pipe(Stream.runDrain, Effect.forkScoped);

    yield* Ref.update(watchers, (map) =>
      HashMap.set(map, directory, { pubsub, refcount: 1, fiber }),
    );

    return pubsub;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ProjectSubscribeFileError({
          message: `Failed to start directory watcher: ${String(cause)}`,
          cause,
        }),
    ),
  );

const releaseDirectoryWatcher = (directory: string): Effect.Effect<void> =>
  Ref.modify(watchers, (map) => {
    const existing = HashMap.get(map, directory);
    if (Option.isNone(existing)) {
      return [Effect.void, map] as const;
    }
    const nextRefcount = existing.value.refcount - 1;
    if (nextRefcount > 0) {
      return [
        Effect.void,
        HashMap.set(map, directory, { ...existing.value, refcount: nextRefcount }),
      ] as const;
    }
    // Last subscriber — interrupt the fiber and drop the entry.
    return [
      Fiber.interrupt(existing.value.fiber).pipe(Effect.asVoid),
      HashMap.remove(map, directory),
    ] as const;
  }).pipe(Effect.flatten);
```

**Note:** the exact `fileSystem.watch` event shape and the `_tag` / `path` field names depend on `@effect/platform-node`'s `FileSystem.watch`. **Verify by searching the codebase** — `apps/server/src/serverSettings.ts:267-283` uses this API, so grep it for the event field access. Adjust the `byPath.set` calls accordingly.

**Step 4:** Now define `subscribeFile` using the registry:

```typescript
const subscribeFile: WorkspaceFileSystemShape["subscribeFile"] = (input) => {
  const effect = Effect.gen(function* () {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });
    const directory = path.dirname(target.absolutePath);
    return { target, directory };
  });

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const { target, directory } = yield* effect;
      const pubsub = yield* acquireDirectoryWatcher(directory);
      yield* Effect.addFinalizer(() => releaseDirectoryWatcher(directory));

      // Initial snapshot: compute and emit immediately, before subscribing
      // to the pubsub so clients always have a baseline.
      const initial = yield* snapshotFile(fileSystem, target.absolutePath);
      const initialEvent: ProjectFileEvent | null = initial
        ? { _tag: "snapshot", sha256: initial.sha256, size: initial.size }
        : { _tag: "deleted" };

      const dequeue = yield* PubSub.subscribe(pubsub);
      const filtered = Stream.fromQueue(dequeue).pipe(
        Stream.filter((watchEvent) => watchEvent.absolutePath === target.absolutePath),
        Stream.mapEffect(
          (watchEvent): Effect.Effect<ProjectFileEvent, ProjectSubscribeFileError> => {
            if (watchEvent._tag === "remove") {
              return Effect.succeed({ _tag: "deleted" });
            }
            return snapshotFile(fileSystem, target.absolutePath).pipe(
              Effect.map((snapshot) => {
                if (!snapshot) return { _tag: "deleted" } as const;
                return {
                  _tag: "changed" as const,
                  sha256: snapshot.sha256,
                  size: snapshot.size,
                };
              }),
            );
          },
        ),
      );

      return Stream.concat(Stream.succeed(initialEvent), filtered);
    }),
  );
};
```

**Step 5:** Add `subscribeFile` to the return:

```typescript
return { writeFile, readFile, subscribeFile } satisfies WorkspaceFileSystemShape;
```

**Step 6:** `bun run --filter t3 typecheck` — expect success. If it fails, the most likely issues are:

- Effect `PubSub` / `Fiber` / `HashMap` module paths (might need to import from `effect/PubSub` directly)
- `fileSystem.watch` return type (may be a `Stream<FileSystem.WatchEvent>` — check `@effect/platform` types)
- `Effect.forkScoped` availability (may be `Effect.forkDaemon` in this Effect version)

If you hit any of these, **ask before guessing** — some are Effect 4.0 beta API quirks.

**Step 7:** Run the tests:

```
bun run --filter t3 test -- WorkspaceFileSystem
```

Expect the 4 new `subscribeFile` tests to pass, and the existing 8 (3 writeFile + 5 readFile) to still pass.

**Step 8:** Commit the Phase 2 server work as one commit:

```
git add apps/server/src/workspace/Services/WorkspaceFileSystem.ts \
        apps/server/src/workspace/Layers/WorkspaceFileSystem.ts \
        apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts
git commit -m "feat(server): implement WorkspaceFileSystem.subscribeFile with shared per-directory watchers"
```

---

## Phase 3 — Server: RPC handler wiring

### Task 3.1: Register `subscribeProjectFile` handler in `ws.ts`

**File:** MODIFY `apps/server/src/ws.ts`

**Step 1:** Add `ProjectSubscribeFileError` to the existing `@t3tools/contracts` error import:

```typescript
import {
  // ... existing imports ...
  ProjectListDirectoryError,
  ProjectReadFileError,
  ProjectSubscribeFileError,
  ProjectSearchEntriesError,
  ProjectWriteFileError,
  // ...
} from "@t3tools/contracts";
```

**Step 2:** Find the existing `subscribeGitStatus` handler (search for `WS_METHODS.subscribeGitStatus`). Add a new handler immediately after it, following the same `observeRpcStream` pattern:

```typescript
      [WS_METHODS.subscribeProjectFile]: (input) =>
        observeRpcStream(
          WS_METHODS.subscribeProjectFile,
          workspaceFileSystem.subscribeFile(input).pipe(
            Stream.mapError((cause) => {
              if (Schema.is(ProjectSubscribeFileError)(cause)) {
                return cause;
              }
              if (Schema.is(WorkspacePathOutsideRootError)(cause)) {
                return new ProjectSubscribeFileError({
                  message: "Workspace file path must stay within the project root.",
                  cause,
                });
              }
              return new ProjectSubscribeFileError({
                message: "Failed to subscribe to workspace file",
                cause,
              });
            }),
          ),
          { "rpc.aggregate": "workspace" },
        ),
```

**Step 3:** `bun typecheck && bun run --filter t3 test` — all green.

**Step 4:** Commit:

```
git add apps/server/src/ws.ts
git commit -m "feat(server): register subscribeProjectFile RPC handler"
```

---

## Phase 4 — Web: React Query hooks for subscribe + save

### Task 4.1: Add `useFileSubscription` hook and `useSaveFile` mutation

**File:** MODIFY `apps/web/src/lib/workspaceReactQuery.ts`

**Step 1:** Add imports:

```typescript
import type {
  EnvironmentId,
  ProjectFileEvent,
  ProjectListDirectoryResult,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ensureEnvironmentApi } from "~/environmentApi";
```

**Step 2:** Add the `useFileSubscription` hook at the bottom of the file:

```typescript
/**
 * Subscribes to live filesystem events for a single workspace file. Calls
 * `onEvent` with every event (snapshot, changed, deleted). The subscription
 * is active as long as the component is mounted AND the cwd + relativePath
 * are non-null.
 */
export function useFileSubscription(
  environmentId: EnvironmentId | null,
  cwd: string | null,
  relativePath: string | null,
  onEvent: (event: ProjectFileEvent) => void,
): void {
  useEffect(() => {
    if (!environmentId || !cwd || !relativePath) return;
    const api = ensureEnvironmentApi(environmentId);
    const unsubscribe = api.projects.onFile({ cwd, relativePath }, onEvent, {
      onResubscribe: () => {
        // On reconnect, onFile resubscribes automatically and the server
        // will emit a fresh `snapshot` event that the callback handles.
      },
    });
    return unsubscribe;
  }, [environmentId, cwd, relativePath, onEvent]);
}
```

**Step 3:** Add the `useSaveFile` mutation:

```typescript
/**
 * Mutation hook that wraps `projects.writeFile`. On success, invalidates
 * the `readFile` query for the same path and the git status query so the
 * tree decorations and the diff panel stay in sync.
 */
export function useSaveFile(environmentId: EnvironmentId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      relativePath: string;
      contents: string;
    }): Promise<ProjectWriteFileResult> => {
      if (!environmentId) {
        throw new Error("Workspace file save is unavailable.");
      }
      const api = ensureEnvironmentApi(environmentId);
      return api.projects.writeFile(input as ProjectWriteFileInput);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.readFile(environmentId, variables.cwd, variables.relativePath),
      });
      // Invalidate git status so the DiffPanel refreshes.
      queryClient.invalidateQueries({ queryKey: ["git", "status"] });
    },
  });
}
```

**Step 4:** `bun run --filter @t3tools/web typecheck` — expect success.

**Step 5:** Commit:

```
git add apps/web/src/lib/workspaceReactQuery.ts
git commit -m "feat(web): add useFileSubscription and useSaveFile hooks"
```

---

## Phase 5 — Web: Extend `workspaceStore` with edit state

### Task 5.1: Extend `FileBuffer` and `CwdWorkspaceState`

**File:** MODIFY `apps/web/src/workspace/workspaceStore.ts`

**Step 1:** Replace the existing `FileBuffer` interface with:

```typescript
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
```

Add a corresponding `EMPTY_FILE_BUFFER` constant:

```typescript
const EMPTY_FILE_BUFFER: FileBuffer = {
  server: { kind: "loading" },
  isEditMode: false,
  editorContents: null,
  cursor: null,
  diskSha256: null,
  diskSize: null,
  hasExternalChange: false,
};
```

**Step 2:** Extend `CwdWorkspaceState` with a per-cwd `wordWrap` preference:

```typescript
export interface CwdWorkspaceState {
  readonly openTabs: ReadonlyArray<WorkspaceTabId>;
  readonly fileBuffers: { readonly [relativePath: string]: FileBuffer };
  readonly expandedDirectories: ReadonlyArray<string>;
  readonly wordWrap: boolean; // default false
}
```

Update `EMPTY_CWD_STATE`:

```typescript
const EMPTY_CWD_STATE: CwdWorkspaceState = {
  openTabs: [],
  fileBuffers: {},
  expandedDirectories: [],
  wordWrap: false,
};
```

**Step 3:** Extend `WorkspaceActions` with the new actions:

```typescript
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
```

**Step 4:** Implement the new actions. The existing `setFileBuffer` should be updated to merge (not replace) so it doesn't clobber edit state. Key helper:

```typescript
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
```

Then the actions (all use `set((state) => updateBuffer(state, cwd, relativePath, (buffer) => ({ ... })))`):

```typescript
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
            const serverContents =
              buffer.server.kind === "text" ? buffer.server.contents : null;
            const normalized = contents === serverContents ? null : contents;
            return { ...buffer, editorContents: normalized };
          }),
        ),

      setCursor: (cwd, relativePath, cursor) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => ({ ...buffer, cursor })),
        ),

      markDiskSnapshot: (cwd, relativePath, diskSha256, diskSize) =>
        set((state) =>
          updateBuffer(state, cwd, relativePath, (buffer) => {
            const isDirty = buffer.editorContents !== null;
            // Silent refresh for clean buffers with a mismatching hash; conflict
            // for dirty buffers with a mismatching hash.
            const serverSha =
              buffer.server.kind === "text" ? buffer.server.sha256 : null;
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
```

**Step 5:** Update the `partialize` in the `persist` middleware options so dirty `editorContents` survive refresh up to 1 MB per file:

```typescript
const EDIT_PERSIST_MAX_BYTES = 1 * 1024 * 1024;

// ... inside the `persist` call ...
      partialize: (state) => ({
        byCwd: Object.fromEntries(
          Object.entries(state.byCwd).map(([cwd, cwdState]) => [
            cwd,
            {
              openTabs: cwdState.openTabs,
              // Persist only dirty buffers, stripping the heavy server
              // contents and capping editorContents at the edit limit.
              fileBuffers: Object.fromEntries(
                Object.entries(cwdState.fileBuffers)
                  .filter(
                    ([, buffer]) =>
                      buffer.editorContents !== null &&
                      buffer.editorContents.length <= EDIT_PERSIST_MAX_BYTES,
                  )
                  .map(([relativePath, buffer]) => [
                    relativePath,
                    {
                      ...buffer,
                      // Don't persist stale server content — it'll be refetched.
                      server: { kind: "loading" as const },
                      hasExternalChange: false, // reconciled on next subscribe
                      diskSha256: null,
                      diskSize: null,
                    },
                  ]),
              ),
              expandedDirectories: cwdState.expandedDirectories,
              wordWrap: cwdState.wordWrap,
            },
          ]),
        ),
      }),
```

**Step 6:** `bun run --filter @t3tools/web typecheck` — expect success.

### Task 5.2: Update workspaceStore tests

**File:** MODIFY `apps/web/src/workspace/workspaceStore.test.ts`

**Step 1:** Add new tests for the Layer 2 actions. Before the existing describe blocks, it may be useful to add a `makeTextBuffer` helper:

```typescript
function makeTextBuffer(contents: string): FileBuffer {
  return {
    server: {
      kind: "text",
      contents,
      sha256: "abc",
      size: contents.length,
    },
    isEditMode: false,
    editorContents: null,
    cursor: null,
    diskSha256: null,
    diskSize: null,
    hasExternalChange: false,
  };
}
```

Add import: `import type { FileBuffer } from "./workspaceStore";`

**Step 2:** Add tests:

```typescript
describe("toggleEditMode", () => {
  it("flips isEditMode on an existing buffer", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.toggleEditMode("/repo/a", "src/a.ts");
    expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"]?.isEditMode).toBe(
      true,
    );
  });
});

describe("setEditorContents", () => {
  it("marks the buffer dirty when contents differ from server", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.setEditorContents("/repo/a", "src/a.ts", "hello world");
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.editorContents).toBe("hello world");
  });

  it("clears editorContents when they match server contents again", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.setEditorContents("/repo/a", "src/a.ts", "hello world");
    store.setEditorContents("/repo/a", "src/a.ts", "hello");
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.editorContents).toBeNull();
  });
});

describe("markDiskSnapshot", () => {
  it("sets hasExternalChange=true when dirty and sha mismatches", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello")); // sha = "abc"
    store.setEditorContents("/repo/a", "src/a.ts", "hello world"); // dirty
    store.markDiskSnapshot("/repo/a", "src/a.ts", "different-sha", 123);
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.hasExternalChange).toBe(true);
  });

  it("leaves hasExternalChange=false when clean and sha mismatches", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.markDiskSnapshot("/repo/a", "src/a.ts", "different-sha", 123);
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.hasExternalChange).toBe(false);
  });
});

describe("resolveExternalChange", () => {
  it("keepMine clears the banner but keeps edits", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.setEditorContents("/repo/a", "src/a.ts", "edited");
    store.markDiskSnapshot("/repo/a", "src/a.ts", "different", 10);
    store.resolveExternalChange("/repo/a", "src/a.ts", "keepMine");
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.hasExternalChange).toBe(false);
    expect(buffer?.editorContents).toBe("edited");
  });

  it("reload drops edits and clears banner", () => {
    const store = useWorkspaceStore.getState();
    store.openFile("/repo/a", "src/a.ts");
    store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
    store.setEditorContents("/repo/a", "src/a.ts", "edited");
    store.markDiskSnapshot("/repo/a", "src/a.ts", "different", 10);
    store.resolveExternalChange("/repo/a", "src/a.ts", "reload");
    const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
    expect(buffer?.hasExternalChange).toBe(false);
    expect(buffer?.editorContents).toBeNull();
  });
});

describe("setWordWrap", () => {
  it("toggles wordWrap per cwd", () => {
    const store = useWorkspaceStore.getState();
    store.setWordWrap("/repo/a", true);
    expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.wordWrap).toBe(true);
    store.setWordWrap("/repo/a", false);
    expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.wordWrap).toBe(false);
  });
});
```

**Step 3:** `bun run --filter @t3tools/web test -- workspaceStore` — all new tests pass, existing tests still pass.

**Step 4:** Commit the Phase 5 work as one commit:

```
git add apps/web/src/workspace/workspaceStore.ts apps/web/src/workspace/workspaceStore.test.ts
git commit -m "feat(web): extend workspaceStore with edit state + persisted dirty buffers"
```

---

## Phase 6 — Web: `FileViewer` edit mode

### Task 6.1: Accept edit-mode props and wire the CM6 updateListener

**File:** MODIFY `apps/web/src/components/workspace/FileViewer.tsx`

**Step 1:** Extend the props:

```typescript
interface FileViewerProps {
  readonly relativePath: string;
  readonly contents: string;
  readonly isEditMode: boolean;
  readonly wordWrap: boolean;
  readonly onContentChange: (next: string) => void;
  readonly onCursorChange: (cursor: { line: number; column: number } | null) => void;
}
```

**Step 2:** Update the existing `useEffect` that creates the `EditorView` to:

1. Remove the hardcoded `EditorState.readOnly.of(true)` and `EditorView.editable.of(false)` — instead make them conditional on `!isEditMode`:

```typescript
      ...(isEditMode
        ? []
        : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
```

2. Add `EditorView.lineWrapping` when `wordWrap` is true:

```typescript
      ...(wordWrap ? [EditorView.lineWrapping] : []),
```

3. Add an `updateListener` extension that calls `onContentChange` and `onCursorChange`:

```typescript
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChange(update.state.doc.toString());
        }
        if (update.selectionSet) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          onCursorChange({
            line: line.number,
            column: head - line.from + 1,
          });
        }
      }),
```

**Step 3:** Add `isEditMode` and `wordWrap` to the `useEffect` dependency array alongside `contents` and `languageExtension`. This means the editor is re-created when the mode flips or word-wrap changes. That's OK for L2 — if it becomes a UX problem (losing cursor on mode flip), we can use `EditorView.dispatch` with a reconfigure effect later.

**Step 4:** `bun run --filter @t3tools/web typecheck` — expect success.

### Task 6.2: Commit Phase 6 skeleton

**Step 1:** Even though `FileViewer` now accepts edit-mode props, it's not yet wired into `FileTab` (Phase 7's job). The component is still correct on its own. Commit as:

```
git add apps/web/src/components/workspace/FileViewer.tsx
git commit -m "feat(web): FileViewer edit mode + wordWrap + update listeners"
```

---

## Phase 7 — Web: `FileTab` edit UI + `FileConflictBanner` + dirty dot

### Task 7.1: Create `FileConflictBanner.tsx`

**File:** CREATE `apps/web/src/components/workspace/FileConflictBanner.tsx`

```typescript
import { AlertTriangle } from "lucide-react";

interface FileConflictBannerProps {
  readonly relativePath: string;
  readonly onKeepMine: () => void;
  readonly onReload: () => void;
}

export function FileConflictBanner({
  relativePath,
  onKeepMine,
  onReload,
}: FileConflictBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-border bg-destructive/10 px-3 py-2 text-xs"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Disk version changed</div>
        <div className="text-muted-foreground">
          {relativePath} has been modified on disk while you have unsaved edits.
        </div>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
            onClick={onKeepMine}
          >
            Keep mine
          </button>
          <button
            type="button"
            className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
            onClick={onReload}
          >
            Reload from disk
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Task 7.2: Rewire `FileTab.tsx` with edit mode + toolbar + subscription

**File:** MODIFY `apps/web/src/components/workspace/FileTab.tsx`

This is the largest client change in Phase 7. Replace the entire file body with:

```typescript
import type { EnvironmentId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save, WrapText } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";

import {
  useFileSubscription,
  useSaveFile,
  workspaceReadFileQueryOptions,
  workspaceQueryKeys,
} from "~/lib/workspaceReactQuery";
import { cn } from "~/lib/utils";
import { useWorkspaceStore } from "~/workspace/workspaceStore";
import { readLocalApi } from "~/localApi";

import { FileConflictBanner } from "./FileConflictBanner";
import { FileViewer } from "./FileViewer";

interface FileTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

export function FileTab({ environmentId, cwd, relativePath }: FileTabProps) {
  const queryClient = useQueryClient();

  // Store selectors (stable primitives / memoized)
  const buffer = useWorkspaceStore(
    (state) => state.byCwd[cwd]?.fileBuffers[relativePath],
  );
  const wordWrap = useWorkspaceStore((state) => state.byCwd[cwd]?.wordWrap ?? false);
  const setFileBuffer = useWorkspaceStore((state) => state.setFileBuffer);
  const toggleEditMode = useWorkspaceStore((state) => state.toggleEditMode);
  const setEditorContents = useWorkspaceStore((state) => state.setEditorContents);
  const setCursor = useWorkspaceStore((state) => state.setCursor);
  const markDiskSnapshot = useWorkspaceStore((state) => state.markDiskSnapshot);
  const resolveExternalChange = useWorkspaceStore((state) => state.resolveExternalChange);
  const clearDirty = useWorkspaceStore((state) => state.clearDirty);
  const setWordWrap = useWorkspaceStore((state) => state.setWordWrap);

  const query = useQuery(
    workspaceReadFileQueryOptions({ environmentId, cwd, relativePath }),
  );
  const saveFile = useSaveFile(environmentId);

  // Sync the React Query result into the store (same as L1 behavior).
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
    // Intentionally omit `buffer` from deps — we only copy server state
    // when the query data changes, not when the buffer's own edit state
    // shifts. Including `buffer` would cause infinite re-sync loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, query.data, relativePath, setFileBuffer]);

  // Live disk subscription.
  const handleFileEvent = useCallback(
    (event: Parameters<Parameters<typeof useFileSubscription>[3]>[0]) => {
      if (event._tag === "deleted") {
        // Mark buffer as externally changed. A "reload" in this case will
        // fail the next read; the UI should gracefully handle that.
        markDiskSnapshot(cwd, relativePath, "deleted", 0);
        return;
      }
      // snapshot or changed — both carry sha256 + size
      markDiskSnapshot(cwd, relativePath, event.sha256, event.size);
      // If clean, silently refresh by invalidating the read-file query.
      const isDirty = buffer?.editorContents !== null;
      if (!isDirty) {
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.readFile(environmentId, cwd, relativePath),
        });
      }
    },
    [buffer?.editorContents, cwd, environmentId, markDiskSnapshot, queryClient, relativePath],
  );
  useFileSubscription(environmentId, cwd, relativePath, handleFileEvent);

  // Cmd/Ctrl+S save shortcut
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

  // Early returns for non-text states (mirrors L1 FileTab behavior but
  // now uses the store as the source of truth instead of query.data directly)
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
          {relativePath} is {(serverState.size / (1024 * 1024)).toFixed(1)} MB. The preview limit
          is {(serverState.limit / (1024 * 1024)).toFixed(0)} MB.
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
          {relativePath} appears to be a binary file ({serverState.size.toLocaleString()} bytes)
          and cannot be previewed.
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

  // Text state — render the editor.
  const initialContents = buffer?.editorContents ?? serverState.contents;
  const isDirty = buffer?.editorContents !== null;
  const isEditMode = buffer?.isEditMode ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
            if (buffer?.editorContents === null || buffer?.editorContents === undefined) return;
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
          onContentChange={(next) => setEditorContents(cwd, relativePath, next)}
          onCursorChange={(cursor) => setCursor(cwd, relativePath, cursor)}
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
```

**Note:** The `OpenExternallyButton` is preserved verbatim from the L1 fix-up — extracted to a helper component now that it's shared between the tooLarge and binary branches.

**Step 3:** Typecheck and test:

```
bun run --filter @t3tools/web typecheck
bun run --filter @t3tools/web test
```

Both green.

### Task 7.3: Dirty dot in `WorkspacePanelTabs`

**File:** MODIFY `apps/web/src/components/workspace/WorkspacePanelTabs.tsx`

**Step 1:** Add a new prop for the dirty-set:

```typescript
interface WorkspacePanelTabsProps {
  readonly tabs: ReadonlyArray<WorkspaceTabId>;
  readonly activeTab: WorkspaceTabId;
  readonly dirtyPaths: ReadonlySet<string>;
  readonly onSelect: (tab: WorkspaceTabId) => void;
  readonly onClose: (tab: WorkspaceTabId) => void;
}
```

**Step 2:** Inside the `tabs.map((tab) => ...)` loop, compute `isDirty` for file tabs:

```typescript
const isDirty = tab.kind === "file" && dirtyPaths.has(tab.relativePath);
```

Render a small dirty dot before the tab label when `isDirty`:

```typescript
            {isDirty ? (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
            ) : null}
            <span className="max-w-[12rem] truncate">{tabLabel(tab)}</span>
```

**Step 3:** Update `WorkspacePanel.tsx` to compute `dirtyPaths` from the store and pass it:

```typescript
// Inside WorkspacePanel, alongside existing selectors:
const dirtyPaths = useWorkspaceStore((state) => {
  const cwdState = state.byCwd[cwd];
  if (!cwdState) return EMPTY_DIRTY_PATHS;
  const dirty = new Set<string>();
  for (const [relativePath, buffer] of Object.entries(cwdState.fileBuffers)) {
    if (buffer.editorContents !== null) dirty.add(relativePath);
  }
  return dirty;
});
```

**Important:** this selector returns a new `Set` on every render, which triggers the same zustand loop bug we fixed in L1 fix-up commit `dbc7d597`. **Use `useShallow`** from zustand or compute a stable key array and memoize the set:

```typescript
// At module level:
const EMPTY_DIRTY_PATHS: ReadonlySet<string> = new Set();

// Inside component — select a primitive first, then derive the Set:
const dirtyPathKey = useWorkspaceStore((state) => {
  const cwdState = state.byCwd[cwd];
  if (!cwdState) return "";
  const parts: string[] = [];
  for (const [relativePath, buffer] of Object.entries(cwdState.fileBuffers)) {
    if (buffer.editorContents !== null) parts.push(relativePath);
  }
  return parts.sort().join("\n");
});

const dirtyPaths = useMemo(
  () => (dirtyPathKey ? new Set(dirtyPathKey.split("\n")) : EMPTY_DIRTY_PATHS),
  [dirtyPathKey],
);
```

Pass `dirtyPaths` to `<WorkspacePanelTabs />`.

**Step 4:** Typecheck + test. Commit:

```
git add apps/web/src/components/workspace/FileConflictBanner.tsx \
        apps/web/src/components/workspace/FileTab.tsx \
        apps/web/src/components/workspace/WorkspacePanelTabs.tsx \
        apps/web/src/components/workspace/WorkspacePanel.tsx
git commit -m "feat(web): FileTab edit mode toolbar, conflict banner, dirty dot in tab strip"
```

---

## Phase 8 — Web: Unsaved-changes guard

### Task 8.1: Create `useUnsavedChangesGuard.ts`

**File:** CREATE `apps/web/src/hooks/useUnsavedChangesGuard.ts`

```typescript
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
        // Most browsers ignore the returnValue text, but it's still required.
        event.returnValue = "You have unsaved changes in the workspace panel.";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cwd]);
}
```

**Step 2:** Wire it into the route file (`_chat.$environmentId.$threadId.tsx`). Add an import and a call inside `ChatThreadRouteView`:

```typescript
import { useUnsavedChangesGuard } from "~/hooks/useUnsavedChangesGuard";

// Inside ChatThreadRouteView, after workspaceCwd is computed:
useUnsavedChangesGuard(workspaceCwd);
```

**Step 3:** Tab-close and panel-close unsaved guard. Extend `WorkspacePanel.handleClose` (existing) to check for dirty state before closing:

```typescript
const handleClose = useCallback(
  (tab: WorkspaceTabId) => {
    if (tab.kind === "changes") return;
    if (tab.kind === "file") {
      const isDirty = dirtyPaths.has(tab.relativePath);
      if (isDirty) {
        const confirmed = window.confirm(
          `Unsaved changes in ${tab.relativePath}. Discard and close?`,
        );
        if (!confirmed) return;
      }
    }
    closeTab(cwd, tab);
    if (tabsEqual(tab, activeTab)) {
      onSelectTab(CHANGES_TAB);
    }
  },
  [activeTab, closeTab, cwd, dirtyPaths, onSelectTab],
);
```

**Step 4:** Typecheck + test. Commit:

```
git add apps/web/src/hooks/useUnsavedChangesGuard.ts \
        apps/web/src/routes/_chat.\$environmentId.\$threadId.tsx \
        apps/web/src/components/workspace/WorkspacePanel.tsx
git commit -m "feat(web): unsaved-changes guard on tab close + browser beforeunload"
```

---

## Phase 9 — Integration + verification

### Task 9.1: Full check suite

**Step 1:** Run everything:

```
bun fmt:check
bun lint
bun typecheck
bun run test
bun run --filter @t3tools/web build
```

All green. If `bun fmt:check` fails, run `bun fmt` first.

### Task 9.2: Manual smoke test via dev-browser

**Steps to verify** (controller can run these via the dev-browser skill):

1. **Start dev server** if not already running: `bun dev`
2. **Open workspace panel**, click `Files` tab, open a small text file
3. **Click Edit button** — should flip to edit mode (button highlighted)
4. **Type something** — should see the dirty dot appear on the file tab and the Save button enable
5. **Press `Cmd+S`** — Save button briefly spins, dirty clears, file on disk is updated
6. **While tab is dirty**, edit the same file externally (e.g. via another editor or `echo ... > file`)
7. **Verify the conflict banner appears** with "Keep mine" and "Reload from disk" buttons
8. **Click "Keep mine"** — banner clears, dirty edits remain
9. **Click "Reload from disk"** — dirty edits are discarded, editor re-loads from disk
10. **Refresh browser** with dirty content — edits should still be there after reload (hot-exit persistence)
11. **Close a dirty tab** — should see a "Unsaved changes… Discard and close?" confirmation
12. **Close browser tab with dirty content** — should see a native beforeunload prompt

### Task 9.3: Push + merge

**Step 1:**

```
git push -u origin feat/workspace-layer-2-editor
```

**Step 2:** Optionally merge to fork main (self-merge via PR or ff-only merge).

**Layer 2 is done when:** all manual smoke test steps pass, all CI gates green, dirty persistence survives refresh, conflict banner resolves correctly.

---

## References

- Design spec: `docs/superpowers/specs/2026-04-09-t3code-file-explorer-design.md` (sections 6.3, 7.2, 8.2, 11 R2/R7/R10)
- L1 plan: `docs/superpowers/plans/2026-04-09-t3code-workspace-layer-1.md` — **follow the same patterns for commit shapes, file style, and TDD loops**
- Effect `FileSystem.watch` debounce precedent: `apps/server/src/serverSettings.ts:267-283`
- Streaming RPC precedent: `subscribeGitStatus` in `apps/server/src/ws.ts`
- Git `onStatus` client-side stream subscription precedent: `apps/web/src/wsRpcClient.ts`
- Existing workspace store convention: `apps/web/src/workspace/workspaceStore.ts` (added in L1)
- Known gotcha: zustand selectors returning fresh arrays/sets cause render loops (see L1 fix-up commit `dbc7d597`) — use the stable-key pattern shown in Task 7.3 for any derived collection selectors
