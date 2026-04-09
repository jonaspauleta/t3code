# T3 Code Workspace Layer 1 (Tree + Read-only Preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file tree + read-only file preview to t3code's existing togglable right panel by introducing a new tabbed "workspace" container that keeps the current diff view as the default tab and adds `Files` and per-file tabs alongside it. This is Layer 1 of 5 (see `docs/superpowers/specs/2026-04-09-t3code-file-explorer-design.md`).

**Architecture:** Extend the existing `WorkspaceFileSystem` Effect service with a `readFile` method. Add a new `WorkspaceTree` Effect service+layer for single-directory listing (sibling to `WorkspaceEntries`). Register two new RPCs (`projects.readFile`, `projects.listDirectory`) in `ws.ts`. On the client, add a `WorkspacePanel` that wraps the existing `<DiffPanel />` as a `Changes` tab and hosts `Files` / `file:*` tabs; state lives in a new zustand store keyed by `cwd`; active tab is reflected in the URL alongside the existing `?diff=1` param. **No existing React components are modified except the route file.**

**Tech Stack:** Node 24.13.1 + Bun 1.3.9 (pm only) · Effect 4.0 beta · `@effect/vitest` · `@effect/platform-node` · React 19 + Vite 8 · TanStack Router (file-based) · `@tanstack/react-query` · `@tanstack/react-virtual` · zustand 5 · CodeMirror 6 (new dep, dynamic-imported lang packs) · oxlint · oxfmt · vitest + vitest-browser-react.

**Pre-flight checklist (run once before Task 1.1):**

- [ ] Confirm you are on branch `feat/workspace-layer-1-tree-preview` (created off `feat/workspace-file-explorer-design` or off `main` after the design branch is merged to main)
- [ ] Confirm `bun install` completes cleanly
- [ ] Confirm `bun typecheck && bun lint && bun run test` are green on the base branch
- [ ] Skim `docs/superpowers/specs/2026-04-09-t3code-file-explorer-design.md` sections 5-8

---

## File structure

### Contracts (`packages/contracts/src/`)

| File         | Action | Responsibility                                                                                                                                                       |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.ts` | MODIFY | Add `ProjectReadFile*` and `ProjectListDirectory*` schemas colocated with the existing `ProjectSearchEntries*` / `ProjectWriteFile*`. Reuse existing `ProjectEntry`. |
| `rpc.ts`     | MODIFY | Add `WS_METHODS.projectsReadFile`, `projectsListDirectory`; add `WsProjectsReadFileRpc`, `WsProjectsListDirectoryRpc`; include both in `WsRpcGroup`.                 |
| `ipc.ts`     | MODIFY | Add `readFile` and `listDirectory` signatures to the `EnvironmentApi.projects` section.                                                                              |

### Server (`apps/server/src/workspace/`)

| File                                 | Action | Responsibility                                                                                      |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `Services/WorkspaceFileSystem.ts`    | MODIFY | Add `readFile` to `WorkspaceFileSystemShape` interface.                                             |
| `Layers/WorkspaceFileSystem.ts`      | MODIFY | Implement `readFile` in the live layer alongside the existing `writeFile`.                          |
| `Layers/WorkspaceFileSystem.test.ts` | MODIFY | Add `readFile` test cases (text, too-large, binary, UTF-16 BOM, path escape).                       |
| `Services/WorkspaceTree.ts`          | CREATE | New Effect service for `listDirectory`.                                                             |
| `Layers/WorkspaceTree.ts`            | CREATE | Live layer implementation.                                                                          |
| `Layers/WorkspaceTree.test.ts`       | CREATE | Test cases (happy path, sort order, ignored dirs, gitignore, truncation, path escape, nonexistent). |

### Server — RPC wiring (`apps/server/src/`)

| File    | Action | Responsibility                                                                                                                                                                                                                                                                 |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ws.ts` | MODIFY | Register `projects.readFile` and `projects.listDirectory` handlers in the `WsRpcGroup.of({ ... })` block around line 588 (near the existing `projectsSearchEntries` / `projectsWriteFile` handlers). Add a provision for `WorkspaceTree` in the surrounding layer composition. |

### Web dependencies (`apps/web/`)

| File           | Action | Responsibility                                                                                                                                                                          |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` | MODIFY | Add CodeMirror 6 deps: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, and the language packs used by `resolveLanguage`. |

### Web — RPC client + API wrapping (`apps/web/src/`)

| File                         | Action | Responsibility                                                                         |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `wsRpcClient.ts`             | MODIFY | Add `readFile` and `listDirectory` to the `projects` interface and the implementation. |
| `environmentApi.ts`          | MODIFY | Wire the two new methods through `createEnvironmentApi`.                               |
| `lib/workspaceReactQuery.ts` | CREATE | Query options + query keys for `readFile` and `listDirectory`.                         |

### Web — Workspace state + routing (`apps/web/src/workspace/`)

| File                           | Action | Responsibility                                                                                  |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| `workspaceStore.ts`            | CREATE | Zustand store with `persist`. Keyed by `cwd`. Holds `openTabs`, `fileBuffers`, `treeExpansion`. |
| `workspaceStore.test.ts`       | CREATE | Pure store action tests.                                                                        |
| `workspaceRouteSearch.ts`      | CREATE | TanStack Router search param parser for the `tab` param.                                        |
| `workspaceRouteSearch.test.ts` | CREATE | Parser tests.                                                                                   |

### Web — Components (`apps/web/src/components/workspace/`)

| File                     | Action | Responsibility                                                                  |
| ------------------------ | ------ | ------------------------------------------------------------------------------- |
| `resolveLanguage.ts`     | CREATE | Extension → dynamic-imported CodeMirror language pack.                          |
| `FileTree.logic.ts`      | CREATE | Pure tree logic: entry sorting, path normalization.                             |
| `FileTree.logic.test.ts` | CREATE | Unit tests.                                                                     |
| `FileTreeNode.tsx`       | CREATE | Single tree row (stateless).                                                    |
| `FileTree.tsx`           | CREATE | Virtualized tree container via `@tanstack/react-virtual`.                       |
| `FilesTreeTab.tsx`       | CREATE | The `Files` tab content (wraps `FileTree`).                                     |
| `FileViewer.tsx`         | CREATE | CodeMirror 6 read-only wrapper with dynamic language resolution.                |
| `FileTab.tsx`            | CREATE | Single-file tab content (wraps `FileViewer`).                                   |
| `WorkspacePanelTabs.tsx` | CREATE | Tab strip rendered above the active tab's content.                              |
| `WorkspacePanel.tsx`     | CREATE | Top-level container: shadcn right sidebar + tab strip + dispatched tab content. |

### Web — Route integration (`apps/web/src/routes/`)

| File                                 | Action | Responsibility                                                                                                                                                                                                                           |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_chat.$environmentId.$threadId.tsx` | MODIFY | Replace `DiffPanelInlineSidebar` with the new `WorkspacePanel` component. Combine `parseDiffRouteSearch` with the new `parseWorkspaceRouteSearch` in `validateSearch`. Leave `shouldAcceptInlineSidebarWidth` inline and pass as a prop. |

---

## Phase 1 — Contracts (schema-only, foundational)

### Task 1.1: Add `ProjectReadFile*` schemas

**Files:**

- Modify: `packages/contracts/src/project.ts`

- [ ] **Step 1: Open `packages/contracts/src/project.ts` and add these constants + schemas at the bottom of the file (after the existing `ProjectWriteFileError`):**

```typescript
// ---------- Read file (workspace Layer 1) ----------

export const PROJECT_READ_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB preview limit
export const PROJECT_EDIT_FILE_MAX_BYTES = 1 * 1024 * 1024; // 1 MB edit limit (consumed in Layer 2)

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

/**
 * Discriminated union result. "binary" and "tooLarge" are normal responses, not
 * errors — the UI renders them differently. Errors are reserved for real IO
 * failures (permission denied, read mid-stream, path escape).
 */
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
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
```

- [ ] **Step 2: Run the contracts typecheck and make sure it passes**

Run: `bun run --filter @t3tools/contracts typecheck`
Expected: no errors.

- [ ] **Step 3: Run the contracts build**

Run: `bun run build:contracts`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/project.ts
git commit -m "feat(contracts): add ProjectReadFile schemas"
```

### Task 1.2: Add `ProjectListDirectory*` schemas

**Files:**

- Modify: `packages/contracts/src/project.ts`

- [ ] **Step 1: Append these schemas after the `ProjectReadFileError` class you added in Task 1.1:**

```typescript
// ---------- List directory (workspace Layer 1) ----------

export const PROJECT_LIST_DIRECTORY_MAX_ENTRIES = 2000;

export const ProjectListDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: Schema.String, // "" for workspace root
  includeHidden: Schema.optional(Schema.Boolean), // default false
});
export type ProjectListDirectoryInput = typeof ProjectListDirectoryInput.Type;

export const ProjectListDirectoryResult = Schema.Struct({
  relativePath: Schema.String,
  entries: Schema.Array(ProjectEntry), // reuse existing ProjectEntry schema
  truncated: Schema.Boolean,
});
export type ProjectListDirectoryResult = typeof ProjectListDirectoryResult.Type;

export class ProjectListDirectoryError extends Schema.TaggedErrorClass<ProjectListDirectoryError>()(
  "ProjectListDirectoryError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `bun run --filter @t3tools/contracts typecheck && bun run build:contracts`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/project.ts
git commit -m "feat(contracts): add ProjectListDirectory schemas"
```

### Task 1.3: Register new RPCs in `rpc.ts`

**Files:**

- Modify: `packages/contracts/src/rpc.ts`

- [ ] **Step 1: Add imports for the new schemas**

Open `packages/contracts/src/rpc.ts`. Update the existing import block from `./project`:

```typescript
import {
  ProjectListDirectoryError,
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
```

- [ ] **Step 2: Add the new entries to `WS_METHODS`**

Inside the `WS_METHODS` object, in the `// Project registry methods` block, add two lines:

```typescript
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsWriteFile: "projects.writeFile",
  projectsReadFile: "projects.readFile",              // ADD
  projectsListDirectory: "projects.listDirectory",    // ADD
```

- [ ] **Step 3: Add the RPC definitions near the existing `WsProjectsWriteFileRpc`**

After the existing `WsProjectsWriteFileRpc` declaration, add:

```typescript
export const WsProjectsReadFileRpc = Rpc.make(WS_METHODS.projectsReadFile, {
  payload: ProjectReadFileInput,
  success: ProjectReadFileResult,
  error: ProjectReadFileError,
});

export const WsProjectsListDirectoryRpc = Rpc.make(WS_METHODS.projectsListDirectory, {
  payload: ProjectListDirectoryInput,
  success: ProjectListDirectoryResult,
  error: ProjectListDirectoryError,
});
```

- [ ] **Step 4: Add both RPCs to `WsRpcGroup`**

In the `WsRpcGroup = RpcGroup.make(...)` list at the bottom of the file, add them near `WsProjectsWriteFileRpc`:

```typescript
  WsProjectsSearchEntriesRpc,
  WsProjectsWriteFileRpc,
  WsProjectsReadFileRpc,         // ADD
  WsProjectsListDirectoryRpc,    // ADD
  WsShellOpenInEditorRpc,
  // ...
```

- [ ] **Step 5: Typecheck + build**

Run: `bun run --filter @t3tools/contracts typecheck && bun run build:contracts`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/rpc.ts
git commit -m "feat(contracts): register projects.readFile and projects.listDirectory RPCs"
```

### Task 1.4: Add methods to `EnvironmentApi`

**Files:**

- Modify: `packages/contracts/src/ipc.ts`

- [ ] **Step 1: Update the imports at the top of `ipc.ts`**

Find the import block for `./project` and add the new types:

```typescript
import {
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
```

- [ ] **Step 2: Extend `EnvironmentApi.projects`**

Around line 185, the existing `projects` block reads:

```typescript
projects: {
  searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
  writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
}
```

Replace with:

```typescript
projects: {
  searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
  writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  readFile: (input: ProjectReadFileInput) => Promise<ProjectReadFileResult>;
  listDirectory: (input: ProjectListDirectoryInput) => Promise<ProjectListDirectoryResult>;
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @t3tools/contracts typecheck`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/ipc.ts
git commit -m "feat(contracts): add readFile and listDirectory to EnvironmentApi"
```

### Task 1.5: Add minimal schema decode tests for the new contracts

**Files:**

- Create: `packages/contracts/src/project.test.ts`

The convention (see `git.test.ts`, `terminal.test.ts`, `orchestration.test.ts`) is to use `Schema.decodeUnknownSync` per schema with one or two representative cases each. Do NOT expand coverage to the pre-existing `ProjectSearchEntries*` / `ProjectWriteFile*` schemas — only test the new ones.

- [ ] **Step 1: Create the test file:**

```typescript
import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  PROJECT_READ_FILE_MAX_BYTES,
} from "./project";

const decodeReadFileInput = Schema.decodeUnknownSync(ProjectReadFileInput);
const decodeReadFileResult = Schema.decodeUnknownSync(ProjectReadFileResult);
const decodeListDirectoryInput = Schema.decodeUnknownSync(ProjectListDirectoryInput);
const decodeListDirectoryResult = Schema.decodeUnknownSync(ProjectListDirectoryResult);

describe("ProjectReadFileInput", () => {
  it("accepts a cwd and relativePath", () => {
    const parsed = decodeReadFileInput({
      cwd: "/repo",
      relativePath: "src/index.ts",
    });
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.relativePath).toBe("src/index.ts");
  });

  it("rejects blank relativePath", () => {
    expect(() => decodeReadFileInput({ cwd: "/repo", relativePath: "" })).toThrow();
  });
});

describe("ProjectReadFileResult", () => {
  it("decodes a text result", () => {
    const parsed = decodeReadFileResult({
      _tag: "text",
      contents: "hello\n",
      size: 6,
      sha256: "abc123",
    });
    expect(parsed._tag).toBe("text");
    if (parsed._tag !== "text") throw new Error("unreachable");
    expect(parsed.contents).toBe("hello\n");
  });

  it("decodes a binary result with no mime", () => {
    const parsed = decodeReadFileResult({
      _tag: "binary",
      size: 128,
    });
    expect(parsed._tag).toBe("binary");
  });

  it("decodes a tooLarge result", () => {
    const parsed = decodeReadFileResult({
      _tag: "tooLarge",
      size: PROJECT_READ_FILE_MAX_BYTES + 1,
      limit: PROJECT_READ_FILE_MAX_BYTES,
    });
    expect(parsed._tag).toBe("tooLarge");
  });

  it("rejects an unknown tag", () => {
    expect(() => decodeReadFileResult({ _tag: "mystery", contents: "" })).toThrow();
  });
});

describe("ProjectListDirectoryInput", () => {
  it("accepts an empty relativePath for the workspace root", () => {
    const parsed = decodeListDirectoryInput({
      cwd: "/repo",
      relativePath: "",
    });
    expect(parsed.relativePath).toBe("");
    expect(parsed.includeHidden).toBeUndefined();
  });

  it("accepts includeHidden=true", () => {
    const parsed = decodeListDirectoryInput({
      cwd: "/repo",
      relativePath: "src",
      includeHidden: true,
    });
    expect(parsed.includeHidden).toBe(true);
  });
});

describe("ProjectListDirectoryResult", () => {
  it("decodes an empty listing", () => {
    const parsed = decodeListDirectoryResult({
      relativePath: "",
      entries: [],
      truncated: false,
    });
    expect(parsed.entries).toEqual([]);
    expect(parsed.truncated).toBe(false);
  });

  it("decodes a populated listing", () => {
    const parsed = decodeListDirectoryResult({
      relativePath: "src",
      entries: [
        { path: "src/index.ts", kind: "file", parentPath: "src" },
        { path: "src/lib", kind: "directory", parentPath: "src" },
      ],
      truncated: false,
    });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]?.kind).toBe("file");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun run --filter @t3tools/contracts test`
Expected: PASS for all new test cases.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/project.test.ts
git commit -m "test(contracts): add schema decode tests for projects.readFile and projects.listDirectory"
```

---

## Phase 2 — Server: `WorkspaceFileSystem.readFile`

### Task 2.1: Add `readFile` to the service contract

**Files:**

- Modify: `apps/server/src/workspace/Services/WorkspaceFileSystem.ts`

- [ ] **Step 1: Open the file and update the import block at the top**

Current:

```typescript
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectWriteFileInput, ProjectWriteFileResult } from "@t3tools/contracts";
import { WorkspacePathOutsideRootError } from "./WorkspacePaths.ts";
```

Replace with:

```typescript
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type {
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { ProjectReadFileError } from "@t3tools/contracts";
import { WorkspacePathOutsideRootError } from "./WorkspacePaths.ts";
```

- [ ] **Step 2: Extend `WorkspaceFileSystemShape`**

The existing interface has a single `writeFile` method. Add `readFile`:

```typescript
export interface WorkspaceFileSystemShape {
  /**
   * Write a file relative to the workspace root.
   *
   * Creates parent directories as needed and rejects paths that escape the
   * workspace root.
   */
  readonly writeFile: (
    input: ProjectWriteFileInput,
  ) => Effect.Effect<
    ProjectWriteFileResult,
    WorkspaceFileSystemError | WorkspacePathOutsideRootError
  >;

  /**
   * Read a file relative to the workspace root.
   *
   * Returns a tagged result: `text` (under the 5MB limit), `binary`
   * (non-UTF-8/16/32 content detected), or `tooLarge` (above the 5MB limit).
   * Errors are reserved for real IO failures and path escape.
   */
  readonly readFile: (
    input: ProjectReadFileInput,
  ) => Effect.Effect<ProjectReadFileResult, ProjectReadFileError | WorkspacePathOutsideRootError>;
}
```

- [ ] **Step 3: Typecheck the server**

Run: `bun run --filter t3 typecheck`
Expected: **should fail** because `WorkspaceFileSystemLive` doesn't implement `readFile` yet. This is intentional — we want the type system to drive us to the next task. Confirm the error message mentions `readFile`.

- [ ] **Step 4: (Do NOT commit yet — commit after Task 2.5 when readFile is implemented and tests pass)**

### Task 2.2: Write failing test — reads a text file and returns sha256

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

- [ ] **Step 1: Add an import for `crypto.createHash` at the top (we'll compare hashes in assertions):**

Under the existing imports block, add:

```typescript
import { createHash } from "node:crypto";
```

- [ ] **Step 2: Inside the existing `it.layer(TestLayer)("WorkspaceFileSystemLive", (it) => { ... })` block, add a new `describe("readFile", ...)` block below the existing `describe("writeFile", ...)`:**

```typescript
describe("readFile", () => {
  it.effect("reads a text file relative to the workspace root", () =>
    Effect.gen(function* () {
      const workspaceFileSystem = yield* WorkspaceFileSystem;
      const cwd = yield* makeTempDir;
      const contents = "export const answer = 42;\n";
      const expectedSha256 = createHash("sha256").update(contents, "utf8").digest("hex");
      yield* writeTextFile(cwd, "src/answer.ts", contents);

      const result = yield* workspaceFileSystem.readFile({
        cwd,
        relativePath: "src/answer.ts",
      });

      expect(result._tag).toBe("text");
      if (result._tag !== "text") {
        throw new Error("unreachable: expected text result");
      }
      expect(result.contents).toBe(contents);
      expect(result.size).toBe(Buffer.byteLength(contents, "utf8"));
      expect(result.sha256).toBe(expectedSha256);
    }),
  );
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: **FAIL** with a type error about `workspaceFileSystem.readFile` not being a function (or a runtime error). This is the "red" step of red-green-refactor.

### Task 2.3: Implement `readFile` in the live layer

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`

- [ ] **Step 1: Update imports at the top of the file.**

Current:

```typescript
import { Effect, FileSystem, Layer, Path } from "effect";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";
```

Replace with:

```typescript
import { createHash } from "node:crypto";

import { Effect, FileSystem, Layer, Path } from "effect";

import {
  PROJECT_READ_FILE_MAX_BYTES,
  ProjectReadFileError,
  type ProjectReadFileResult,
} from "@t3tools/contracts";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";
```

- [ ] **Step 2: Inside `makeWorkspaceFileSystem = Effect.gen(function* () { ... })`, add the `readFile` implementation immediately before the `return { writeFile } satisfies WorkspaceFileSystemShape;` line.**

Insert this before the return statement:

```typescript
const readFile: WorkspaceFileSystemShape["readFile"] = Effect.fn("WorkspaceFileSystem.readFile")(
  function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    const stat = yield* fileSystem.stat(target.absolutePath).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectReadFileError({
            message: `Failed to stat workspace file: ${cause.message}`,
            cause,
          }),
      ),
    );

    const size = Number(stat.size);

    if (size > PROJECT_READ_FILE_MAX_BYTES) {
      const result: ProjectReadFileResult = {
        _tag: "tooLarge",
        size,
        limit: PROJECT_READ_FILE_MAX_BYTES,
      };
      return result;
    }

    const bytes = yield* fileSystem.readFile(target.absolutePath).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectReadFileError({
            message: `Failed to read workspace file: ${cause.message}`,
            cause,
          }),
      ),
    );

    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (detectIsBinary(buffer)) {
      const result: ProjectReadFileResult = {
        _tag: "binary",
        size,
      };
      return result;
    }

    const contents = decodeText(buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const result: ProjectReadFileResult = {
      _tag: "text",
      contents,
      size,
      sha256,
    };
    return result;
  },
);
```

- [ ] **Step 3: Add two helper functions at the top of the file (outside `makeWorkspaceFileSystem`), before `export const makeWorkspaceFileSystem`:**

```typescript
const BINARY_SNIFF_BYTE_COUNT = 8 * 1024;

const UTF16_LE_BOM: ReadonlyArray<number> = [0xff, 0xfe];
const UTF16_BE_BOM: ReadonlyArray<number> = [0xfe, 0xff];
const UTF32_LE_BOM: ReadonlyArray<number> = [0xff, 0xfe, 0x00, 0x00];
const UTF32_BE_BOM: ReadonlyArray<number> = [0x00, 0x00, 0xfe, 0xff];

function hasBom(buffer: Buffer, bom: ReadonlyArray<number>): boolean {
  if (buffer.byteLength < bom.length) return false;
  for (let index = 0; index < bom.length; index += 1) {
    if (buffer[index] !== bom[index]) return false;
  }
  return true;
}

function detectEncoding(buffer: Buffer): "utf8" | "utf16le" | "utf16be" | "utf32le" | "utf32be" {
  // Check 4-byte BOMs before 2-byte BOMs (UTF-32 LE starts with UTF-16 LE).
  if (hasBom(buffer, UTF32_LE_BOM)) return "utf32le";
  if (hasBom(buffer, UTF32_BE_BOM)) return "utf32be";
  if (hasBom(buffer, UTF16_LE_BOM)) return "utf16le";
  if (hasBom(buffer, UTF16_BE_BOM)) return "utf16be";
  return "utf8";
}

function detectIsBinary(buffer: Buffer): boolean {
  // If we see a recognized text BOM, it's text.
  const encoding = detectEncoding(buffer);
  if (encoding !== "utf8") {
    return false;
  }
  // Otherwise scan the first BINARY_SNIFF_BYTE_COUNT bytes for NUL bytes.
  const scanLength = Math.min(buffer.byteLength, BINARY_SNIFF_BYTE_COUNT);
  for (let index = 0; index < scanLength; index += 1) {
    if (buffer[index] === 0x00) {
      return true;
    }
  }
  return false;
}

function decodeText(buffer: Buffer): string {
  const encoding = detectEncoding(buffer);
  if (encoding === "utf8") {
    return buffer.toString("utf8");
  }
  if (encoding === "utf16le") {
    return buffer.subarray(UTF16_LE_BOM.length).toString("utf16le");
  }
  if (encoding === "utf16be") {
    // Node has no native "utf16be" decoder; swap bytes and decode as LE.
    const payload = buffer.subarray(UTF16_BE_BOM.length);
    const swapped = Buffer.alloc(payload.byteLength);
    for (let index = 0; index + 1 < payload.byteLength; index += 2) {
      swapped[index] = payload[index + 1]!;
      swapped[index + 1] = payload[index]!;
    }
    return swapped.toString("utf16le");
  }
  // UTF-32 is rare; fall back to "latin1" to avoid crashing; callers can
  // extend this later if it becomes a real use case.
  return buffer.toString("latin1");
}
```

- [ ] **Step 4: Return `readFile` from the service's `satisfies` block**

Change the final return statement from:

```typescript
return { writeFile } satisfies WorkspaceFileSystemShape;
```

to:

```typescript
return { writeFile, readFile } satisfies WorkspaceFileSystemShape;
```

- [ ] **Step 5: Run the test from Task 2.2 and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: **PASS** for `reads a text file relative to the workspace root`. The existing `writeFile` tests should also still pass.

### Task 2.4: Test — `tooLarge` response for files above the size limit

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

- [ ] **Step 1: Import the size constant**

Add to the imports at the top:

```typescript
import { PROJECT_READ_FILE_MAX_BYTES } from "@t3tools/contracts";
```

- [ ] **Step 2: Add a test inside the `describe("readFile", ...)` block:**

```typescript
it.effect("returns tooLarge for files above the preview limit", () =>
  Effect.gen(function* () {
    const workspaceFileSystem = yield* WorkspaceFileSystem;
    const cwd = yield* makeTempDir;
    // One byte above the limit.
    const size = PROJECT_READ_FILE_MAX_BYTES + 1;
    const contents = "x".repeat(size);
    yield* writeTextFile(cwd, "huge.txt", contents);

    const result = yield* workspaceFileSystem.readFile({
      cwd,
      relativePath: "huge.txt",
    });

    expect(result).toEqual({
      _tag: "tooLarge",
      size,
      limit: PROJECT_READ_FILE_MAX_BYTES,
    });
  }),
);
```

- [ ] **Step 3: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: PASS.

### Task 2.5: Test — `binary` response for NUL-containing files

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

- [ ] **Step 1: Add this test inside the `describe("readFile", ...)` block:**

```typescript
it.effect("detects binary files by NUL bytes in the first 8KB", () =>
  Effect.gen(function* () {
    const workspaceFileSystem = yield* WorkspaceFileSystem;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* makeTempDir;

    // Build a small "binary" buffer containing a NUL byte early.
    const buffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01, 0x02, 0x03]);
    const absolutePath = path.join(cwd, "program.bin");
    yield* fileSystem.writeFile(absolutePath, buffer).pipe(Effect.orDie);

    const result = yield* workspaceFileSystem.readFile({
      cwd,
      relativePath: "program.bin",
    });

    expect(result._tag).toBe("binary");
    if (result._tag !== "binary") {
      throw new Error("unreachable: expected binary result");
    }
    expect(result.size).toBe(buffer.byteLength);
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: PASS.

### Task 2.6: Test — UTF-16 BOM is decoded as text, not flagged as binary

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

- [ ] **Step 1: Add this test inside `describe("readFile", ...)`:**

```typescript
it.effect("treats a UTF-16 LE BOM file as text", () =>
  Effect.gen(function* () {
    const workspaceFileSystem = yield* WorkspaceFileSystem;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* makeTempDir;

    const text = "hello\n";
    // UTF-16 LE BOM + payload.
    const payload = Buffer.from(text, "utf16le");
    const bom = Buffer.from([0xff, 0xfe]);
    const buffer = Buffer.concat([bom, payload]);
    const absolutePath = path.join(cwd, "utf16.txt");
    yield* fileSystem.writeFile(absolutePath, buffer).pipe(Effect.orDie);

    const result = yield* workspaceFileSystem.readFile({
      cwd,
      relativePath: "utf16.txt",
    });

    expect(result._tag).toBe("text");
    if (result._tag !== "text") {
      throw new Error("unreachable: expected text result");
    }
    expect(result.contents).toBe(text);
    expect(result.size).toBe(buffer.byteLength);
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: PASS.

### Task 2.7: Test — rejects paths outside the workspace root

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`

- [ ] **Step 1: Add this test inside `describe("readFile", ...)`:**

```typescript
it.effect("rejects reads outside the workspace root", () =>
  Effect.gen(function* () {
    const workspaceFileSystem = yield* WorkspaceFileSystem;
    const cwd = yield* makeTempDir;

    const error = yield* workspaceFileSystem
      .readFile({
        cwd,
        relativePath: "../escape.md",
      })
      .pipe(Effect.flip);

    expect(error.message).toContain(
      "Workspace file path must be relative to the project root: ../escape.md",
    );
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceFileSystem`
Expected: PASS. The error bubbles up from `WorkspacePaths.resolveRelativePathWithinRoot` — no new code needed.

### Task 2.8: Commit Phase 2

- [ ] **Step 1: Confirm everything is green**

Run: `bun run --filter t3 typecheck && bun run --filter t3 test -- WorkspaceFileSystem && bun fmt:check`

Expected: all green.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/workspace/Services/WorkspaceFileSystem.ts \
        apps/server/src/workspace/Layers/WorkspaceFileSystem.ts \
        apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts
git commit -m "feat(server): implement WorkspaceFileSystem.readFile with binary + tooLarge + UTF-16 handling"
```

---

## Phase 3 — Server: `WorkspaceTree.listDirectory`

### Task 3.1: Create the `WorkspaceTree` service contract

**Files:**

- Create: `apps/server/src/workspace/Services/WorkspaceTree.ts`

- [ ] **Step 1: Create the new file with this exact content:**

```typescript
/**
 * WorkspaceTree - Effect service contract for lazy per-directory listing.
 *
 * Complements `WorkspaceEntries` (which owns the full workspace index for
 * fuzzy search) by serving single directory levels for the file tree UI.
 *
 * @module WorkspaceTree
 */
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectListDirectoryInput, ProjectListDirectoryResult } from "@t3tools/contracts";

import { WorkspacePathOutsideRootError } from "./WorkspacePaths.ts";

export class WorkspaceTreeError extends Schema.TaggedErrorClass<WorkspaceTreeError>()(
  "WorkspaceTreeError",
  {
    cwd: Schema.String,
    relativePath: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

/**
 * WorkspaceTreeShape - Service API for per-directory workspace listing.
 */
export interface WorkspaceTreeShape {
  /**
   * List one directory level (non-recursive) relative to the workspace root.
   *
   * Filters `.git/` and the other hardcoded ignored directory names. Also
   * respects `.gitignore` when the workspace is inside a git work tree.
   *
   * Caps the response at 2000 entries per call; sets `truncated: true` if the
   * cap is exceeded.
   */
  readonly listDirectory: (
    input: ProjectListDirectoryInput,
  ) => Effect.Effect<
    ProjectListDirectoryResult,
    WorkspaceTreeError | WorkspacePathOutsideRootError
  >;
}

/**
 * WorkspaceTree - Service tag for per-directory workspace listing.
 */
export class WorkspaceTree extends ServiceMap.Service<WorkspaceTree, WorkspaceTreeShape>()(
  "t3/workspace/Services/WorkspaceTree",
) {}
```

- [ ] **Step 2: Typecheck the server**

Run: `bun run --filter t3 typecheck`
Expected: success (the service contract has no implementation yet, but it's self-contained).

- [ ] **Step 3: Do NOT commit yet — commit after the live layer lands (Task 3.3).**

### Task 3.2: Write failing test — lists the workspace root

**Files:**

- Create: `apps/server/src/workspace/Layers/WorkspaceTree.test.ts`

- [ ] **Step 1: Create the test file with this exact content:**

```typescript
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import { ServerConfig } from "../../config.ts";
import { GitCoreLive } from "../../git/Layers/GitCore.ts";
import { WorkspaceTree } from "../Services/WorkspaceTree.ts";
import { WorkspacePathsLive } from "./WorkspacePaths.ts";
import { WorkspaceTreeLive } from "./WorkspaceTree.ts";

const TreeLayer = WorkspaceTreeLive.pipe(Layer.provide(WorkspacePathsLive));

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(TreeLayer),
  Layer.provideMerge(WorkspacePathsLive),
  Layer.provideMerge(GitCoreLive),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-workspace-tree-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3code-workspace-tree-",
  });
});

const writeTextFile = Effect.fn("writeTextFile")(function* (
  cwd: string,
  relativePath: string,
  contents = "",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.join(cwd, relativePath);
  yield* fileSystem
    .makeDirectory(path.dirname(absolutePath), { recursive: true })
    .pipe(Effect.orDie);
  yield* fileSystem.writeFileString(absolutePath, contents).pipe(Effect.orDie);
});

const makeDir = Effect.fn("makeDir")(function* (cwd: string, relativePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem
    .makeDirectory(path.join(cwd, relativePath), { recursive: true })
    .pipe(Effect.orDie);
});

it.layer(TestLayer)("WorkspaceTreeLive", (it) => {
  describe("listDirectory", () => {
    it.effect("lists the workspace root with directories first", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        yield* writeTextFile(cwd, "README.md", "# hi\n");
        yield* writeTextFile(cwd, "package.json", "{}\n");
        yield* makeDir(cwd, "src");
        yield* makeDir(cwd, "tests");

        const result = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
        });

        expect(result.relativePath).toBe("");
        expect(result.truncated).toBe(false);
        expect(result.entries.map((entry) => entry.path)).toEqual([
          "src",
          "tests",
          "README.md",
          "package.json",
        ]);
        expect(result.entries.map((entry) => entry.kind)).toEqual([
          "directory",
          "directory",
          "file",
          "file",
        ]);
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: **FAIL** — `WorkspaceTreeLive` is not defined yet.

### Task 3.3: Implement `WorkspaceTreeLive`

**Files:**

- Create: `apps/server/src/workspace/Layers/WorkspaceTree.ts`

- [ ] **Step 1: Create the live layer with this exact content:**

```typescript
import fsPromises from "node:fs/promises";
import type { Dirent } from "node:fs";

import { Effect, Layer, Option, Path } from "effect";

import type { ProjectEntry, ProjectListDirectoryResult } from "@t3tools/contracts";
import { PROJECT_LIST_DIRECTORY_MAX_ENTRIES } from "@t3tools/contracts";

import { GitCore } from "../../git/Services/GitCore.ts";
import {
  WorkspaceTree,
  WorkspaceTreeError,
  type WorkspaceTreeShape,
} from "../Services/WorkspaceTree.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

/**
 * Kept in sync with `IGNORED_DIRECTORY_NAMES` in `WorkspaceEntries.ts`. If this
 * list ever needs to diverge, extract to a shared constant in
 * `packages/shared/src/workspaceIgnoredDirectories.ts`.
 */
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".convex",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
]);

function toPosixPath(input: string): string {
  return input.replaceAll("\\", "/");
}

function joinRelativePath(parent: string, child: string): string {
  if (parent.length === 0) return child;
  return `${parent}/${child}`;
}

export const makeWorkspaceTree = Effect.gen(function* () {
  const path = yield* Path.Path;
  const gitOption = yield* Effect.serviceOption(GitCore);
  const workspacePaths = yield* WorkspacePaths;

  const isInsideGitWorkTree = (cwd: string): Effect.Effect<boolean> =>
    Option.match(gitOption, {
      onSome: (git) => git.isInsideWorkTree(cwd).pipe(Effect.catch(() => Effect.succeed(false))),
      onNone: () => Effect.succeed(false),
    });

  const filterGitIgnoredPaths = (
    cwd: string,
    relativePaths: string[],
  ): Effect.Effect<string[], never> =>
    Option.match(gitOption, {
      onSome: (git) =>
        git.filterIgnoredPaths(cwd, relativePaths).pipe(
          Effect.map((paths) => [...paths]),
          Effect.catch(() => Effect.succeed(relativePaths)),
        ),
      onNone: () => Effect.succeed(relativePaths),
    });

  const listDirectory: WorkspaceTreeShape["listDirectory"] = Effect.fn(
    "WorkspaceTree.listDirectory",
  )(function* (input) {
    const normalizedRelative = toPosixPath(input.relativePath).replace(/^\/+|\/+$/g, "");

    // Resolve the directory safely. Use a sentinel relative path for the root
    // because `resolveRelativePathWithinRoot` rejects empty strings.
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: normalizedRelative.length === 0 ? "." : normalizedRelative,
    });

    const dirents = yield* Effect.tryPromise({
      try: () => fsPromises.readdir(target.absolutePath, { withFileTypes: true }),
      catch: (cause) =>
        new WorkspaceTreeError({
          cwd: input.cwd,
          relativePath: normalizedRelative,
          operation: "WorkspaceTree.readdir",
          detail: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    });

    const includeHidden = input.includeHidden ?? false;

    // Partition into directories and files, applying ignored-dir filter and
    // the optional hidden-file filter.
    const allowedDirectoryEntries: Dirent[] = [];
    const allowedFileEntries: Dirent[] = [];

    for (const entry of dirents) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
        allowedDirectoryEntries.push(entry);
      } else if (entry.isFile()) {
        allowedFileEntries.push(entry);
      }
    }

    // Sort each partition alphabetically (case-insensitive).
    const byName = (left: Dirent, right: Dirent) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    allowedDirectoryEntries.sort(byName);
    allowedFileEntries.sort(byName);

    // Build relative paths for the gitignore filter (files only).
    const candidateFileRelativePaths = allowedFileEntries.map((entry) =>
      joinRelativePath(normalizedRelative, entry.name),
    );
    const filteredFileRelativePaths = (yield* isInsideGitWorkTree(input.cwd))
      ? new Set(yield* filterGitIgnoredPaths(input.cwd, candidateFileRelativePaths))
      : new Set(candidateFileRelativePaths);

    const entries: ProjectEntry[] = [];
    for (const entry of allowedDirectoryEntries) {
      if (entries.length >= PROJECT_LIST_DIRECTORY_MAX_ENTRIES) break;
      entries.push({
        path: joinRelativePath(normalizedRelative, entry.name),
        kind: "directory",
        parentPath: normalizedRelative.length === 0 ? undefined : normalizedRelative,
      });
    }
    for (const entry of allowedFileEntries) {
      if (entries.length >= PROJECT_LIST_DIRECTORY_MAX_ENTRIES) break;
      const relativePath = joinRelativePath(normalizedRelative, entry.name);
      if (!filteredFileRelativePaths.has(relativePath)) continue;
      entries.push({
        path: relativePath,
        kind: "file",
        parentPath: normalizedRelative.length === 0 ? undefined : normalizedRelative,
      });
    }

    const totalCandidates = allowedDirectoryEntries.length + filteredFileRelativePaths.size;
    const truncated = totalCandidates > PROJECT_LIST_DIRECTORY_MAX_ENTRIES;

    const result: ProjectListDirectoryResult = {
      relativePath: normalizedRelative,
      entries,
      truncated,
    };
    return result;
  });

  return { listDirectory } satisfies WorkspaceTreeShape;
});

export const WorkspaceTreeLive = Layer.effect(WorkspaceTree, makeWorkspaceTree);
```

- [ ] **Step 2: Run the Task 3.2 test and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: PASS for `lists the workspace root with directories first`.

### Task 3.4: Test — respects ignored directory names

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceTree.test.ts`

- [ ] **Step 1: Add this test inside the `describe("listDirectory", ...)` block:**

```typescript
it.effect("filters out ignored directories like node_modules and .git", () =>
  Effect.gen(function* () {
    const workspaceTree = yield* WorkspaceTree;
    const cwd = yield* makeTempDir;

    yield* makeDir(cwd, "src");
    yield* makeDir(cwd, "node_modules/react");
    yield* makeDir(cwd, ".git/objects");
    yield* makeDir(cwd, "dist");
    yield* writeTextFile(cwd, "README.md", "# hi\n");

    const result = yield* workspaceTree.listDirectory({
      cwd,
      relativePath: "",
    });

    const paths = result.entries.map((entry) => entry.path);
    expect(paths).toEqual(["src", "README.md"]);
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: PASS.

### Task 3.5: Test — respects `.gitignore` when inside a git work tree

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceTree.test.ts`

- [ ] **Step 1: Add this test inside `describe("listDirectory", ...)`:**

```typescript
it.effect("respects .gitignore inside a git work tree", () =>
  Effect.gen(function* () {
    const workspaceTree = yield* WorkspaceTree;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* makeTempDir;

    // Initialize a git repo in the temp dir. Using raw fs + fsPromises via
    // the GitCoreLive layer would be heavier — instead, just spawn `git init`
    // via `fileSystem.exec` to keep this test fast.
    yield* Effect.tryPromise({
      try: async () => {
        const { spawn } = await import("node:child_process");
        await new Promise<void>((resolve, reject) => {
          const child = spawn("git", ["init", "--quiet"], { cwd });
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`git init exited ${code}`)),
          );
          child.on("error", reject);
        });
      },
      catch: (cause) => new Error(`git init failed: ${String(cause)}`),
    }).pipe(Effect.orDie);

    yield* writeTextFile(cwd, ".gitignore", "secrets.env\n");
    yield* writeTextFile(cwd, "README.md", "# hi\n");
    yield* writeTextFile(cwd, "secrets.env", "TOKEN=xyz\n");

    const result = yield* workspaceTree.listDirectory({
      cwd,
      relativePath: "",
    });

    const paths = result.entries.map((entry) => entry.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain(".gitignore"); // dotfiles with includeHidden=false should still be filtered...
  }),
);
```

**Note:** the final assertion is wrong on purpose — `.gitignore` is a dotfile and should be filtered out by `includeHidden: false`. This test will fail on that assertion, which is fine because we only care about the `secrets.env` behavior. Fix the test in Step 2.

- [ ] **Step 2: Fix the assertions:**

Replace the final two `expect` lines with:

```typescript
expect(paths).toContain("README.md");
expect(paths).not.toContain("secrets.env"); // gitignored
expect(paths).not.toContain(".gitignore"); // dotfile, excluded by includeHidden=false default
```

- [ ] **Step 3: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: PASS. If `.gitignore` filtering doesn't work, investigate `GitCore.filterIgnoredPaths` semantics (it may require the repo to have at least one commit).

### Task 3.6: Test — rejects paths outside the workspace root

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceTree.test.ts`

- [ ] **Step 1: Add this test inside `describe("listDirectory", ...)`:**

```typescript
it.effect("rejects paths outside the workspace root", () =>
  Effect.gen(function* () {
    const workspaceTree = yield* WorkspaceTree;
    const cwd = yield* makeTempDir;

    const error = yield* workspaceTree
      .listDirectory({
        cwd,
        relativePath: "../escape",
      })
      .pipe(Effect.flip);

    expect(error.message).toContain(
      "Workspace file path must be relative to the project root: ../escape",
    );
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: PASS.

### Task 3.7: Test — `includeHidden: true` shows dotfiles

**Files:**

- Modify: `apps/server/src/workspace/Layers/WorkspaceTree.test.ts`

- [ ] **Step 1: Add this test inside `describe("listDirectory", ...)`:**

```typescript
it.effect("includes dotfiles when includeHidden is true", () =>
  Effect.gen(function* () {
    const workspaceTree = yield* WorkspaceTree;
    const cwd = yield* makeTempDir;

    yield* writeTextFile(cwd, ".env", "PORT=3000\n");
    yield* writeTextFile(cwd, "README.md", "# hi\n");

    const resultHidden = yield* workspaceTree.listDirectory({
      cwd,
      relativePath: "",
      includeHidden: true,
    });
    const hiddenPaths = resultHidden.entries.map((entry) => entry.path);
    expect(hiddenPaths).toContain(".env");
    expect(hiddenPaths).toContain("README.md");

    const resultDefault = yield* workspaceTree.listDirectory({
      cwd,
      relativePath: "",
    });
    const defaultPaths = resultDefault.entries.map((entry) => entry.path);
    expect(defaultPaths).toContain("README.md");
    expect(defaultPaths).not.toContain(".env");
  }),
);
```

- [ ] **Step 2: Run and confirm it passes**

Run: `bun run --filter t3 test -- WorkspaceTree`
Expected: PASS.

### Task 3.8: Commit Phase 3

- [ ] **Step 1: Run all server checks**

Run: `bun run --filter t3 typecheck && bun run --filter t3 test && bun fmt:check`
Expected: all green.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/workspace/Services/WorkspaceTree.ts \
        apps/server/src/workspace/Layers/WorkspaceTree.ts \
        apps/server/src/workspace/Layers/WorkspaceTree.test.ts
git commit -m "feat(server): add WorkspaceTree service + layer for per-directory listing"
```

---

## Phase 4 — Server: Register RPC handlers in `ws.ts`

### Task 4.1: Wire `projects.readFile` and `projects.listDirectory` into `WsRpcGroup.of`

**Files:**

- Modify: `apps/server/src/ws.ts`

- [ ] **Step 1: Update imports at the top of `ws.ts`.**

Find the existing import block from `@t3tools/contracts` and add the new error types:

```typescript
import {
  // ... existing imports ...
  ProjectListDirectoryError,
  ProjectReadFileError,
  ProjectSearchEntriesError,
  ProjectWriteFileError,
  // ... existing imports ...
} from "@t3tools/contracts";
```

Also add the `WorkspaceTree` service import from the workspace module:

```typescript
import { WorkspaceTree } from "./workspace/Services/WorkspaceTree.ts";
```

And import the live layer from its Layers file:

```typescript
import { WorkspaceTreeLive } from "./workspace/Layers/WorkspaceTree.ts";
```

- [ ] **Step 2: Find where `WorkspaceFileSystem` is pulled from the service registry inside the generator passed to `WsRpcGroup.toLayer`.**

Search for `workspaceFileSystem = yield* WorkspaceFileSystem;` and add the `WorkspaceTree` lookup immediately after:

```typescript
const workspaceFileSystem = yield * WorkspaceFileSystem;
const workspaceTree = yield * WorkspaceTree;
```

- [ ] **Step 3: Find the `WsRpcGroup.of({ ... })` block (around line 406) and locate the existing `projects.writeFile` handler (around line 602). Immediately after that handler, add the two new ones:**

```typescript
      [WS_METHODS.projectsReadFile]: (input) =>
        observeRpcEffect(
          WS_METHODS.projectsReadFile,
          workspaceFileSystem.readFile(input).pipe(
            Effect.mapError((cause) => {
              if (Schema.is(ProjectReadFileError)(cause)) {
                return cause;
              }
              if (Schema.is(WorkspacePathOutsideRootError)(cause)) {
                return new ProjectReadFileError({
                  message: "Workspace file path must stay within the project root.",
                  cause,
                });
              }
              return new ProjectReadFileError({
                message: "Failed to read workspace file",
                cause,
              });
            }),
          ),
          { "rpc.aggregate": "workspace" },
        ),
      [WS_METHODS.projectsListDirectory]: (input) =>
        observeRpcEffect(
          WS_METHODS.projectsListDirectory,
          workspaceTree.listDirectory(input).pipe(
            Effect.mapError((cause) => {
              if (Schema.is(WorkspacePathOutsideRootError)(cause)) {
                return new ProjectListDirectoryError({
                  message: "Workspace file path must stay within the project root.",
                  cause,
                });
              }
              return new ProjectListDirectoryError({
                message: `Failed to list workspace directory: ${cause.detail}`,
                cause,
              });
            }),
          ),
          { "rpc.aggregate": "workspace" },
        ),
```

- [ ] **Step 4: Find the outer layer composition that provides `WorkspaceFileSystemLive` (search for `WorkspaceFileSystemLive`).**

It will be somewhere in a `Layer.provide(...)` / `Layer.provideMerge(...)` pipeline. Add `WorkspaceTreeLive.pipe(Layer.provide(WorkspacePathsLive))` in the same pipeline. Example (may differ slightly in existing code):

```typescript
    Layer.provideMerge(WorkspaceFileSystemLive.pipe(Layer.provide(WorkspacePathsLive))),
    Layer.provideMerge(WorkspaceTreeLive.pipe(Layer.provide(WorkspacePathsLive))),
```

If the exact composition differs, make the minimal change needed so `WorkspaceTree` is resolvable at the point `workspaceTree = yield* WorkspaceTree` runs.

- [ ] **Step 5: Typecheck + test**

Run: `bun run --filter t3 typecheck && bun run --filter t3 test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ws.ts
git commit -m "feat(server): register projects.readFile and projects.listDirectory RPC handlers"
```

---

## Phase 5 — Web: RPC client plumbing

### Task 5.1: Add CodeMirror 6 dependencies

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the CodeMirror 6 core + language packs via bun (from the repo root):**

```bash
cd apps/web
bun add @codemirror/state@^6 \
        @codemirror/view@^6 \
        @codemirror/commands@^6 \
        @codemirror/language@^6 \
        @codemirror/search@^6 \
        @codemirror/lang-javascript@^6 \
        @codemirror/lang-python@^6 \
        @codemirror/lang-markdown@^6 \
        @codemirror/lang-json@^6 \
        @codemirror/lang-html@^6 \
        @codemirror/lang-css@^6 \
        @codemirror/lang-yaml@^6 \
        @codemirror/lang-sql@^6 \
        @codemirror/lang-rust@^6 \
        @codemirror/lang-go@^6
cd ../..
```

- [ ] **Step 2: Verify `bun install` at the root is still clean**

Run: `bun install`
Expected: no changes, no errors.

- [ ] **Step 3: Typecheck + lint to verify nothing broke**

Run: `bun typecheck && bun lint`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "feat(web): add CodeMirror 6 dependencies for workspace file viewer"
```

### Task 5.2: Extend the RPC client's `projects` interface

**Files:**

- Modify: `apps/web/src/wsRpcClient.ts`

- [ ] **Step 1: Find the `projects` interface block (around line 64-66) and extend it:**

```typescript
  readonly projects: {
    readonly searchEntries: RpcUnaryMethod<typeof WS_METHODS.projectsSearchEntries>;
    readonly writeFile: RpcUnaryMethod<typeof WS_METHODS.projectsWriteFile>;
    readonly readFile: RpcUnaryMethod<typeof WS_METHODS.projectsReadFile>;
    readonly listDirectory: RpcUnaryMethod<typeof WS_METHODS.projectsListDirectory>;
  };
```

- [ ] **Step 2: Find the implementation block around line 291 where the existing `projects` methods are wired, and add the two new methods:**

```typescript
      projects: {
        searchEntries: (input) =>
          transport.request((client) => client[WS_METHODS.projectsSearchEntries](input)),
        writeFile: (input) =>
          transport.request((client) => client[WS_METHODS.projectsWriteFile](input)),
        readFile: (input) =>
          transport.request((client) => client[WS_METHODS.projectsReadFile](input)),
        listDirectory: (input) =>
          transport.request((client) => client[WS_METHODS.projectsListDirectory](input)),
      },
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/wsRpcClient.ts
git commit -m "feat(web): expose readFile and listDirectory in wsRpcClient"
```

### Task 5.3: Wire through `environmentApi`

**Files:**

- Modify: `apps/web/src/environmentApi.ts`

- [ ] **Step 1: Update the `projects` block inside `createEnvironmentApi`:**

```typescript
    projects: {
      searchEntries: rpcClient.projects.searchEntries,
      writeFile: rpcClient.projects.writeFile,
      readFile: rpcClient.projects.readFile,
      listDirectory: rpcClient.projects.listDirectory,
    },
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/environmentApi.ts
git commit -m "feat(web): expose readFile and listDirectory via environmentApi"
```

### Task 5.4: Create `workspaceReactQuery.ts`

**Files:**

- Create: `apps/web/src/lib/workspaceReactQuery.ts`

- [ ] **Step 1: Create the file with this exact content:**

```typescript
import type {
  EnvironmentId,
  ProjectListDirectoryResult,
  ProjectReadFileResult,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";

import { ensureEnvironmentApi } from "~/environmentApi";

export const workspaceQueryKeys = {
  all: ["workspace"] as const,
  readFile: (environmentId: EnvironmentId | null, cwd: string | null, relativePath: string) =>
    ["workspace", "read-file", environmentId ?? null, cwd, relativePath] as const,
  listDirectory: (environmentId: EnvironmentId | null, cwd: string | null, relativePath: string) =>
    ["workspace", "list-directory", environmentId ?? null, cwd, relativePath] as const,
};

const READ_FILE_STALE_TIME_MS = 30_000;
const LIST_DIRECTORY_STALE_TIME_MS = 15_000;

const EMPTY_LIST_DIRECTORY_RESULT: ProjectListDirectoryResult = {
  relativePath: "",
  entries: [],
  truncated: false,
};

export function workspaceReadFileQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  relativePath: string;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: workspaceQueryKeys.readFile(input.environmentId, input.cwd, input.relativePath),
    queryFn: async (): Promise<ProjectReadFileResult> => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace file read is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.readFile({
        cwd: input.cwd,
        relativePath: input.relativePath,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.relativePath.length > 0,
    staleTime: input.staleTime ?? READ_FILE_STALE_TIME_MS,
  });
}

export function workspaceListDirectoryQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  relativePath: string;
  includeHidden?: boolean;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: workspaceQueryKeys.listDirectory(input.environmentId, input.cwd, input.relativePath),
    queryFn: async (): Promise<ProjectListDirectoryResult> => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Workspace directory listing is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.listDirectory({
        cwd: input.cwd,
        relativePath: input.relativePath,
        includeHidden: input.includeHidden ?? false,
      });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null && input.cwd !== null,
    staleTime: input.staleTime ?? LIST_DIRECTORY_STALE_TIME_MS,
    placeholderData: (previous) => previous ?? EMPTY_LIST_DIRECTORY_RESULT,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/workspaceReactQuery.ts
git commit -m "feat(web): add React Query options for workspace read-file and list-directory"
```

---

## Phase 6 — Web: Workspace state + route search

### Task 6.1: Create `workspaceStore.ts`

**Files:**

- Create: `apps/web/src/workspace/workspaceStore.ts`

- [ ] **Step 1: Create the directory and file. Exact content:**

```typescript
import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";

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

function getOrInit(byCwd: { [cwd: string]: CwdWorkspaceState }, cwd: string): CwdWorkspaceState {
  return byCwd[cwd] ?? EMPTY_CWD_STATE;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      byCwd: {},

      openFile: (cwd, relativePath) =>
        set((state) => {
          const existing = getOrInit(state.byCwd as { [cwd: string]: CwdWorkspaceState }, cwd);
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
          const existing = getOrInit(state.byCwd as { [cwd: string]: CwdWorkspaceState }, cwd);
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
          const existing = getOrInit(state.byCwd as { [cwd: string]: CwdWorkspaceState }, cwd);
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
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 6.2: Write `workspaceStore` unit tests

**Files:**

- Create: `apps/web/src/workspace/workspaceStore.test.ts`

- [ ] **Step 1: Create the test file:**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "./workspaceStore";

function resetStore() {
  useWorkspaceStore.setState({ byCwd: {} });
}

describe("workspaceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  describe("openFile", () => {
    it("adds a file tab keyed by cwd", () => {
      useWorkspaceStore.getState().openFile("/repo/a", "src/index.ts");
      const state = useWorkspaceStore.getState().byCwd["/repo/a"];
      expect(state?.openTabs).toEqual([{ kind: "file", relativePath: "src/index.ts" }]);
    });

    it("is idempotent for an already-open file", () => {
      const { openFile } = useWorkspaceStore.getState();
      openFile("/repo/a", "src/index.ts");
      openFile("/repo/a", "src/index.ts");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.openTabs).toHaveLength(1);
    });

    it("keeps cwds isolated", () => {
      const { openFile } = useWorkspaceStore.getState();
      openFile("/repo/a", "src/a.ts");
      openFile("/repo/b", "src/b.ts");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.openTabs).toEqual([
        { kind: "file", relativePath: "src/a.ts" },
      ]);
      expect(useWorkspaceStore.getState().byCwd["/repo/b"]?.openTabs).toEqual([
        { kind: "file", relativePath: "src/b.ts" },
      ]);
    });
  });

  describe("closeTab", () => {
    it("removes the tab and drops its buffer", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/index.ts");
      store.setFileBuffer("/repo/a", "src/index.ts", {
        server: { kind: "text", contents: "// ...", sha256: "abc", size: 6 },
      });
      store.closeTab("/repo/a", { kind: "file", relativePath: "src/index.ts" });
      const state = useWorkspaceStore.getState().byCwd["/repo/a"];
      expect(state?.openTabs).toEqual([]);
      expect(state?.fileBuffers["src/index.ts"]).toBeUndefined();
    });
  });

  describe("toggleDirectory", () => {
    it("toggles expansion state for a directory", () => {
      const { toggleDirectory } = useWorkspaceStore.getState();
      toggleDirectory("/repo/a", "src");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.expandedDirectories).toEqual(["src"]);
      toggleDirectory("/repo/a", "src");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.expandedDirectories).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun run --filter @t3tools/web test -- workspaceStore`
Expected: PASS.

- [ ] **Step 3: Commit Phase 6 so far**

```bash
git add apps/web/src/workspace/workspaceStore.ts apps/web/src/workspace/workspaceStore.test.ts
git commit -m "feat(web): add workspaceStore with per-cwd tab + tree state"
```

### Task 6.3: Create `workspaceRouteSearch.ts`

**Files:**

- Create: `apps/web/src/workspace/workspaceRouteSearch.ts`

- [ ] **Step 1: Create the file:**

```typescript
/**
 * TanStack Router search parameter handling for the workspace panel tab state.
 *
 * The existing `?diff=1` param (from `diffRouteSearch.ts`) controls whether
 * the right panel is open. This module adds a `?tab=` param that picks which
 * tab is active when the panel is open. Missing `tab` with `diff=1` means
 * "changes" — preserving the exact current behavior.
 */

import type { WorkspaceTabId } from "./workspaceStore";

const CHANGES_TAB_TOKEN = "changes" as const;
const FILES_TAB_TOKEN = "files" as const;
const FILE_TAB_PREFIX = "file:";

export interface WorkspaceRouteSearch {
  tab?: WorkspaceTabId;
}

export function parseWorkspaceRouteSearch(search: Record<string, unknown>): WorkspaceRouteSearch {
  const raw = search.tab;
  if (typeof raw !== "string" || raw.length === 0) {
    return {};
  }
  if (raw === CHANGES_TAB_TOKEN) {
    return { tab: { kind: "changes" } };
  }
  if (raw === FILES_TAB_TOKEN) {
    return { tab: { kind: "files" } };
  }
  if (raw.startsWith(FILE_TAB_PREFIX)) {
    const encoded = raw.slice(FILE_TAB_PREFIX.length);
    try {
      const relativePath = decodeURIComponent(encoded);
      if (relativePath.length === 0) return {};
      return { tab: { kind: "file", relativePath } };
    } catch {
      return {};
    }
  }
  return {};
}

export function serializeWorkspaceTab(tab: WorkspaceTabId): string {
  if (tab.kind === "changes") return CHANGES_TAB_TOKEN;
  if (tab.kind === "files") return FILES_TAB_TOKEN;
  return `${FILE_TAB_PREFIX}${encodeURIComponent(tab.relativePath)}`;
}

export function stripWorkspaceSearchParams(
  search: Record<string, unknown>,
): Record<string, unknown> {
  const { tab: _tab, ...rest } = search;
  return rest;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 6.4: Write `workspaceRouteSearch` tests

**Files:**

- Create: `apps/web/src/workspace/workspaceRouteSearch.test.ts`

- [ ] **Step 1: Create the test file:**

```typescript
import { describe, expect, it } from "vitest";

import {
  parseWorkspaceRouteSearch,
  serializeWorkspaceTab,
  stripWorkspaceSearchParams,
} from "./workspaceRouteSearch";

describe("parseWorkspaceRouteSearch", () => {
  it("returns empty when tab is missing", () => {
    expect(parseWorkspaceRouteSearch({})).toEqual({});
    expect(parseWorkspaceRouteSearch({ diff: "1" })).toEqual({});
  });

  it("parses the changes token", () => {
    expect(parseWorkspaceRouteSearch({ tab: "changes" })).toEqual({
      tab: { kind: "changes" },
    });
  });

  it("parses the files token", () => {
    expect(parseWorkspaceRouteSearch({ tab: "files" })).toEqual({
      tab: { kind: "files" },
    });
  });

  it("parses an encoded file path", () => {
    expect(parseWorkspaceRouteSearch({ tab: "file:src%2Findex.ts" })).toEqual({
      tab: { kind: "file", relativePath: "src/index.ts" },
    });
  });

  it("handles nested file paths", () => {
    expect(parseWorkspaceRouteSearch({ tab: "file:apps%2Fweb%2Fsrc%2Findex.tsx" })).toEqual({
      tab: { kind: "file", relativePath: "apps/web/src/index.tsx" },
    });
  });

  it("returns empty on malformed input", () => {
    expect(parseWorkspaceRouteSearch({ tab: "" })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: 123 })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: "file:" })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: "file:%E0%A4%A" })).toEqual({}); // broken %-escape
  });
});

describe("serializeWorkspaceTab", () => {
  it("round-trips every tab kind", () => {
    const cases = [
      { kind: "changes" } as const,
      { kind: "files" } as const,
      { kind: "file", relativePath: "src/index.ts" } as const,
      { kind: "file", relativePath: "apps/web/src/index.tsx" } as const,
    ];
    for (const tab of cases) {
      const roundTripped = parseWorkspaceRouteSearch({ tab: serializeWorkspaceTab(tab) }).tab;
      expect(roundTripped).toEqual(tab);
    }
  });
});

describe("stripWorkspaceSearchParams", () => {
  it("removes only the tab key", () => {
    expect(stripWorkspaceSearchParams({ diff: "1", tab: "changes", other: "x" })).toEqual({
      diff: "1",
      other: "x",
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun run --filter @t3tools/web test -- workspaceRouteSearch`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/workspace/workspaceRouteSearch.ts apps/web/src/workspace/workspaceRouteSearch.test.ts
git commit -m "feat(web): add workspace route search param parser and serializer"
```

---

## Phase 7 — Web: Pure logic + language resolver

### Task 7.1: Create `FileTree.logic.ts` with pure functions

**Files:**

- Create: `apps/web/src/components/workspace/FileTree.logic.ts`

- [ ] **Step 1: Create the directory and file:**

```typescript
import type { ProjectEntry } from "@t3tools/contracts";

/**
 * Flattened row for rendering a virtualized tree. Computed from the set of
 * expanded directories plus each expanded directory's listing.
 */
export interface FileTreeRow {
  readonly entry: ProjectEntry;
  readonly depth: number;
  readonly hasChildren: boolean; // true for directories (we don't know if they're empty until loaded)
  readonly isExpanded: boolean;
}

export interface DirectoryListingSnapshot {
  readonly relativePath: string;
  readonly entries: ReadonlyArray<ProjectEntry>;
}

/**
 * Build the flattened list of visible rows given a set of directory listings
 * and a set of expanded directory relative paths.
 *
 * Root listing key is the empty string "".
 */
export function buildVisibleRows(input: {
  readonly listingsByRelativePath: ReadonlyMap<string, DirectoryListingSnapshot>;
  readonly expandedDirectories: ReadonlySet<string>;
}): ReadonlyArray<FileTreeRow> {
  const rows: FileTreeRow[] = [];

  const visit = (relativePath: string, depth: number): void => {
    const listing = input.listingsByRelativePath.get(relativePath);
    if (!listing) return;
    for (const entry of listing.entries) {
      const isDirectory = entry.kind === "directory";
      const isExpanded = isDirectory && input.expandedDirectories.has(entry.path);
      rows.push({
        entry,
        depth,
        hasChildren: isDirectory,
        isExpanded,
      });
      if (isExpanded) {
        visit(entry.path, depth + 1);
      }
    }
  };

  visit("", 0);
  return rows;
}

/**
 * Compare two relative paths for alphabetical display. Stable.
 */
export function compareEntriesForDisplay(left: ProjectEntry, right: ProjectEntry): number {
  // Directories first.
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.path.localeCompare(right.path, undefined, { sensitivity: "base" });
}

/**
 * Normalize a relative path to forward-slash form. Used at every UI boundary
 * so tree-expansion keys stay consistent across platforms.
 */
export function toForwardSlashes(input: string): string {
  return input.replaceAll("\\", "/");
}
```

### Task 7.2: Write `FileTree.logic` tests

**Files:**

- Create: `apps/web/src/components/workspace/FileTree.logic.test.ts`

- [ ] **Step 1: Create the test file:**

```typescript
import { describe, expect, it } from "vitest";

import type { ProjectEntry } from "@t3tools/contracts";

import {
  buildVisibleRows,
  compareEntriesForDisplay,
  toForwardSlashes,
  type DirectoryListingSnapshot,
} from "./FileTree.logic";

const rootListing: DirectoryListingSnapshot = {
  relativePath: "",
  entries: [
    { path: "src", kind: "directory", parentPath: undefined },
    { path: "tests", kind: "directory", parentPath: undefined },
    { path: "README.md", kind: "file", parentPath: undefined },
  ],
};

const srcListing: DirectoryListingSnapshot = {
  relativePath: "src",
  entries: [
    { path: "src/index.ts", kind: "file", parentPath: "src" },
    { path: "src/lib", kind: "directory", parentPath: "src" },
  ],
};

const srcLibListing: DirectoryListingSnapshot = {
  relativePath: "src/lib",
  entries: [{ path: "src/lib/util.ts", kind: "file", parentPath: "src/lib" }],
};

describe("buildVisibleRows", () => {
  it("returns the root listing when nothing is expanded", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([["", rootListing]]),
      expandedDirectories: new Set(),
    });
    expect(rows.map((row) => row.entry.path)).toEqual(["src", "tests", "README.md"]);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
  });

  it("inlines a child listing when a directory is expanded", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([
        ["", rootListing],
        ["src", srcListing],
      ]),
      expandedDirectories: new Set(["src"]),
    });
    expect(rows.map((row) => row.entry.path)).toEqual([
      "src",
      "src/index.ts",
      "src/lib",
      "tests",
      "README.md",
    ]);
    const srcRow = rows[0];
    const srcIndexRow = rows[1];
    expect(srcRow?.depth).toBe(0);
    expect(srcRow?.isExpanded).toBe(true);
    expect(srcIndexRow?.depth).toBe(1);
    expect(srcIndexRow?.isExpanded).toBe(false);
  });

  it("recursively inlines nested expansions", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([
        ["", rootListing],
        ["src", srcListing],
        ["src/lib", srcLibListing],
      ]),
      expandedDirectories: new Set(["src", "src/lib"]),
    });
    expect(rows.map((row) => row.entry.path)).toEqual([
      "src",
      "src/index.ts",
      "src/lib",
      "src/lib/util.ts",
      "tests",
      "README.md",
    ]);
    expect(rows[3]?.depth).toBe(2);
  });

  it("skips expanded directories whose listing hasn't loaded yet", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([["", rootListing]]),
      expandedDirectories: new Set(["src"]), // listing not yet loaded
    });
    expect(rows.map((row) => row.entry.path)).toEqual(["src", "tests", "README.md"]);
    expect(rows[0]?.isExpanded).toBe(true);
  });
});

describe("compareEntriesForDisplay", () => {
  it("places directories before files", () => {
    const dir: ProjectEntry = { path: "src", kind: "directory" };
    const file: ProjectEntry = { path: "abc.md", kind: "file" };
    expect(compareEntriesForDisplay(dir, file)).toBeLessThan(0);
    expect(compareEntriesForDisplay(file, dir)).toBeGreaterThan(0);
  });

  it("sorts same-kind entries alphabetically, case-insensitive", () => {
    const alpha: ProjectEntry = { path: "Alpha.ts", kind: "file" };
    const beta: ProjectEntry = { path: "beta.ts", kind: "file" };
    expect(compareEntriesForDisplay(alpha, beta)).toBeLessThan(0);
  });
});

describe("toForwardSlashes", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(toForwardSlashes("src\\index.ts")).toBe("src/index.ts");
  });
  it("leaves forward slashes alone", () => {
    expect(toForwardSlashes("src/index.ts")).toBe("src/index.ts");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun run --filter @t3tools/web test -- FileTree.logic`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/FileTree.logic.ts apps/web/src/components/workspace/FileTree.logic.test.ts
git commit -m "feat(web): add FileTree pure logic for virtualized tree rendering"
```

### Task 7.3: Create `resolveLanguage.ts`

**Files:**

- Create: `apps/web/src/components/workspace/resolveLanguage.ts`

- [ ] **Step 1: Create the file:**

```typescript
import type { Extension } from "@codemirror/state";

/**
 * Map a relative path to a dynamically-imported CodeMirror 6 language extension.
 *
 * Every import is `import()` so Vite splits each language pack into its own
 * chunk, keeping the base workspace panel bundle small.
 */
export async function resolveLanguage(relativePath: string): Promise<Extension | null> {
  const match = relativePath.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1] ?? null;
  if (!ext) return null;

  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript({
        typescript: ext === "ts" || ext === "tsx",
        jsx: ext === "tsx" || ext === "jsx",
      });
    }
    case "py": {
      const mod = await import("@codemirror/lang-python");
      return mod.python();
    }
    case "md":
    case "markdown": {
      const mod = await import("@codemirror/lang-markdown");
      return mod.markdown();
    }
    case "json": {
      const mod = await import("@codemirror/lang-json");
      return mod.json();
    }
    case "html":
    case "htm": {
      const mod = await import("@codemirror/lang-html");
      return mod.html();
    }
    case "css": {
      const mod = await import("@codemirror/lang-css");
      return mod.css();
    }
    case "yml":
    case "yaml": {
      const mod = await import("@codemirror/lang-yaml");
      return mod.yaml();
    }
    case "sql": {
      const mod = await import("@codemirror/lang-sql");
      return mod.sql();
    }
    case "rs": {
      const mod = await import("@codemirror/lang-rust");
      return mod.rust();
    }
    case "go": {
      const mod = await import("@codemirror/lang-go");
      return mod.go();
    }
    default:
      return null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/resolveLanguage.ts
git commit -m "feat(web): add dynamic CodeMirror 6 language resolver"
```

---

## Phase 8 — Web: Components (bottom-up)

### Task 8.1: Create `FileTreeNode.tsx`

**Files:**

- Create: `apps/web/src/components/workspace/FileTreeNode.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { MouseEvent } from "react";

import type { FileTreeRow } from "./FileTree.logic";
import { cn } from "~/lib/utils";

interface FileTreeNodeProps {
  readonly row: FileTreeRow;
  readonly isActive: boolean;
  readonly onClick: (row: FileTreeRow, event: MouseEvent<HTMLButtonElement>) => void;
}

export function FileTreeNode({ row, isActive, onClick }: FileTreeNodeProps) {
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
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={(event) => onClick(row, event)}
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
      <span className="truncate">{name}</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.2: Create `FileTree.tsx` (virtualized container)

**Files:**

- Create: `apps/web/src/components/workspace/FileTree.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import type { EnvironmentId } from "@t3tools/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef } from "react";

import { workspaceListDirectoryQueryOptions } from "~/lib/workspaceReactQuery";
import { useWorkspaceStore, type WorkspaceTabId } from "~/workspace/workspaceStore";
import { buildVisibleRows, type DirectoryListingSnapshot } from "./FileTree.logic";
import { FileTreeNode } from "./FileTreeNode";

interface FileTreeProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId | null;
}

const ROW_HEIGHT = 22;

/**
 * Custom hook: fetches listings for the workspace root plus every currently
 * expanded directory. `useQueries` tolerates a dynamically-sized array, so
 * the hook count stays stable across renders.
 */
function useDirectoryListings(
  environmentId: EnvironmentId,
  cwd: string,
  expandedDirectoriesList: ReadonlyArray<string>,
) {
  const rootQuery = useQuery(
    workspaceListDirectoryQueryOptions({ environmentId, cwd, relativePath: "" }),
  );
  const subtreeQueries = useQueries({
    queries: expandedDirectoriesList.map((relativePath) =>
      workspaceListDirectoryQueryOptions({ environmentId, cwd, relativePath }),
    ),
  });
  return { rootQuery, subtreeQueries };
}

export function FileTree({ environmentId, cwd, activeTab }: FileTreeProps) {
  const expandedDirectoriesList = useWorkspaceStore(
    (state) => state.byCwd[cwd]?.expandedDirectories ?? [],
  );
  const expandedDirectories = useMemo(
    () => new Set(expandedDirectoriesList),
    [expandedDirectoriesList],
  );
  const openFile = useWorkspaceStore((state) => state.openFile);
  const toggleDirectory = useWorkspaceStore((state) => state.toggleDirectory);

  const { rootQuery, subtreeQueries } = useDirectoryListings(
    environmentId,
    cwd,
    expandedDirectoriesList,
  );

  // Build the listings map in a single pass — never mutate a memoized value.
  const listingsByRelativePath = useMemo(() => {
    const map = new Map<string, DirectoryListingSnapshot>();
    if (rootQuery.data) {
      map.set("", { relativePath: "", entries: rootQuery.data.entries });
    }
    for (const query of subtreeQueries) {
      if (query.data) {
        map.set(query.data.relativePath, {
          relativePath: query.data.relativePath,
          entries: query.data.entries,
        });
      }
    }
    return map;
  }, [rootQuery.data, subtreeQueries]);

  const visibleRows = useMemo(
    () => buildVisibleRows({ listingsByRelativePath, expandedDirectories }),
    [listingsByRelativePath, expandedDirectories],
  );

  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const activeRelativePath =
    activeTab?.kind === "file" ? activeTab.relativePath : null;

  const handleNodeClick = useCallback(
    (row: (typeof visibleRows)[number]) => {
      if (row.entry.kind === "directory") {
        toggleDirectory(cwd, row.entry.path);
        return;
      }
      openFile(cwd, row.entry.path);
    },
    [cwd, openFile, toggleDirectory],
  );

  if (rootQuery.isLoading) {
    return <div className="p-2 text-xs text-muted-foreground">Loading tree…</div>;
  }
  if (rootQuery.isError) {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to load directory listing. {rootQuery.error?.message ?? ""}
      </div>
    );
  }

  return (
    <div ref={scrollParentRef} className="h-full min-h-0 overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = visibleRows[virtualRow.index]!;
          const isActive = row.entry.path === activeRelativePath;
          return (
            <div
              key={row.entry.path}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FileTreeNode row={row} isActive={isActive} onClick={handleNodeClick} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.3: Create `FilesTreeTab.tsx`

**Files:**

- Create: `apps/web/src/components/workspace/FilesTreeTab.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import type { EnvironmentId } from "@t3tools/contracts";

import { FileTree } from "./FileTree";
import type { WorkspaceTabId } from "~/workspace/workspaceStore";

interface FilesTreeTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId | null;
}

export function FilesTreeTab({ environmentId, cwd, activeTab }: FilesTreeTabProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Files
      </div>
      <div className="min-h-0 flex-1">
        <FileTree environmentId={environmentId} cwd={cwd} activeTab={activeTab} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.4: Create `FileViewer.tsx` (CodeMirror 6 read-only)

**Files:**

- Create: `apps/web/src/components/workspace/FileViewer.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import { defaultKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { resolveLanguage } from "./resolveLanguage";

interface FileViewerProps {
  readonly relativePath: string;
  readonly contents: string;
}

export function FileViewer({ relativePath, contents }: FileViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);

  // Resolve the language extension whenever the file path changes.
  useEffect(() => {
    let cancelled = false;
    resolveLanguage(relativePath).then((extension) => {
      if (!cancelled) setLanguageExtension(extension);
    });
    return () => {
      cancelled = true;
    };
  }, [relativePath]);

  // Create or recreate the editor whenever the language or contents change.
  useEffect(() => {
    if (!hostRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      search({ top: true }),
      keymap.of(defaultKeymap),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono, monospace)" },
      }),
    ];
    if (languageExtension) {
      extensions.push(languageExtension);
    }

    const state = EditorState.create({
      doc: contents,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [contents, languageExtension]);

  return <div ref={hostRef} className="h-full min-h-0 w-full" />;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.5: Create `FileTab.tsx`

**Files:**

- Create: `apps/web/src/components/workspace/FileTab.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import type { EnvironmentId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { workspaceReadFileQueryOptions } from "~/lib/workspaceReactQuery";
import { useWorkspaceStore } from "~/workspace/workspaceStore";
import { FileViewer } from "./FileViewer";

interface FileTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

export function FileTab({ environmentId, cwd, relativePath }: FileTabProps) {
  const setFileBuffer = useWorkspaceStore((state) => state.setFileBuffer);
  const query = useQuery(
    workspaceReadFileQueryOptions({
      environmentId,
      cwd,
      relativePath,
    }),
  );

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
      });
    } else if (data._tag === "binary") {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "binary", size: data.size },
      });
    } else {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "tooLarge", size: data.size, limit: data.limit },
      });
    }
  }, [cwd, query.data, relativePath, setFileBuffer]);

  useEffect(() => {
    if (!query.error) return;
    setFileBuffer(cwd, relativePath, {
      server: { kind: "error", message: query.error.message },
    });
  }, [cwd, query.error, relativePath, setFileBuffer]);

  if (query.isLoading) {
    return <div className="p-2 text-xs text-muted-foreground">Loading {relativePath}…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to read {relativePath}. {query.error?.message ?? ""}
      </div>
    );
  }

  const data = query.data;
  if (data._tag === "tooLarge") {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Too large to preview</div>
        <div className="text-muted-foreground">
          {relativePath} is {(data.size / (1024 * 1024)).toFixed(1)} MB. The preview limit is{" "}
          {(data.limit / (1024 * 1024)).toFixed(0)} MB.
        </div>
      </div>
    );
  }
  if (data._tag === "binary") {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Binary file</div>
        <div className="text-muted-foreground">
          {relativePath} appears to be a binary file ({data.size.toLocaleString()} bytes) and
          cannot be previewed.
        </div>
      </div>
    );
  }

  return <FileViewer relativePath={relativePath} contents={data.contents} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.6: Create `WorkspacePanelTabs.tsx`

**Files:**

- Create: `apps/web/src/components/workspace/WorkspacePanelTabs.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import { X } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";
import type { WorkspaceTabId } from "~/workspace/workspaceStore";

interface WorkspacePanelTabsProps {
  readonly tabs: ReadonlyArray<WorkspaceTabId>;
  readonly activeTab: WorkspaceTabId;
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
        const canClose = tab.kind !== "changes";
        return (
          <button
            key={tabKey(tab)}
            role="tab"
            aria-selected={isActive}
            type="button"
            className={cn(
              "group flex items-center gap-1 rounded-t-sm border border-b-0 border-transparent px-2 py-1 text-[11px]",
              "hover:bg-background",
              isActive
                ? "border-border bg-background text-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onSelect(tab)}
            title={tab.kind === "file" ? tab.relativePath : undefined}
          >
            <span className="truncate max-w-[12rem]">{tabLabel(tab)}</span>
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
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success.

### Task 8.7: Create `WorkspacePanel.tsx`

**Files:**

- Create: `apps/web/src/components/workspace/WorkspacePanel.tsx`

- [ ] **Step 1: Create the file:**

```typescript
import type { EnvironmentId } from "@t3tools/contracts";
import { Suspense, lazy, useCallback, useMemo } from "react";

import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { cn } from "~/lib/utils";
import type { WorkspaceTabId } from "~/workspace/workspaceStore";
import { useWorkspaceStore } from "~/workspace/workspaceStore";
import { FilesTreeTab } from "./FilesTreeTab";
import { FileTab } from "./FileTab";
import { WorkspacePanelTabs } from "./WorkspacePanelTabs";

// DiffPanel is a default export (see the existing route file's lazy import).
const LazyDiffPanel = lazy(() => import("../DiffPanel"));

interface WorkspacePanelProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId;
  readonly onSelectTab: (tab: WorkspaceTabId) => void;
}

const CHANGES_TAB: WorkspaceTabId = { kind: "changes" };
const FILES_TAB: WorkspaceTabId = { kind: "files" };

function tabsEqual(a: WorkspaceTabId, b: WorkspaceTabId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "file" && b.kind === "file") {
    return a.relativePath === b.relativePath;
  }
  return true;
}

export function WorkspacePanel({
  environmentId,
  cwd,
  activeTab,
  onSelectTab,
}: WorkspacePanelProps) {
  const openTabs = useWorkspaceStore((state) => state.byCwd[cwd]?.openTabs ?? []);
  const closeTab = useWorkspaceStore((state) => state.closeTab);

  const fullTabs = useMemo<ReadonlyArray<WorkspaceTabId>>(
    () => [CHANGES_TAB, FILES_TAB, ...openTabs],
    [openTabs],
  );

  const handleClose = useCallback(
    (tab: WorkspaceTabId) => {
      if (tab.kind === "changes") return; // Changes is not closable
      closeTab(cwd, tab);
      if (tabsEqual(tab, activeTab)) {
        onSelectTab(CHANGES_TAB);
      }
    },
    [activeTab, closeTab, cwd, onSelectTab],
  );

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-background")}>
      <WorkspacePanelTabs
        tabs={fullTabs}
        activeTab={activeTab}
        onSelect={onSelectTab}
        onClose={handleClose}
      />
      <div className="min-h-0 flex-1">
        {activeTab.kind === "changes" ? (
          <Suspense fallback={<div className="p-2 text-xs text-muted-foreground">Loading diff viewer…</div>}>
            <DiffWorkerPoolProvider>
              <LazyDiffPanel mode="sidebar" />
            </DiffWorkerPoolProvider>
          </Suspense>
        ) : activeTab.kind === "files" ? (
          <FilesTreeTab environmentId={environmentId} cwd={cwd} activeTab={activeTab} />
        ) : (
          <FileTab
            environmentId={environmentId}
            cwd={cwd}
            relativePath={activeTab.relativePath}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success. If the DiffPanel import path needs adjustment (e.g. it's a default vs named export), mirror what the route file currently does.

- [ ] **Step 3: Commit Phase 8**

```bash
git add apps/web/src/components/workspace/
git commit -m "feat(web): add WorkspacePanel components with tab shell, tree, and read-only viewer"
```

---

## Phase 9 — Route integration + verification

### Task 9.1: Modify the chat thread route to use `WorkspacePanel`

**Files:**

- Modify: `apps/web/src/routes/_chat.$environmentId.$threadId.tsx`

- [ ] **Step 1: Update imports**

At the top of the file, add:

```typescript
import { WorkspacePanel } from "../components/workspace/WorkspacePanel";
import {
  parseWorkspaceRouteSearch,
  type WorkspaceRouteSearch,
} from "../workspace/workspaceRouteSearch";
```

- [ ] **Step 2: Combine the search param validator**

Near the bottom of the file, the current `Route` export looks like:

```typescript
export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
```

Replace with:

```typescript
export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search): DiffRouteSearch & WorkspaceRouteSearch => ({
    ...parseDiffRouteSearch(search),
    ...parseWorkspaceRouteSearch(search),
  }),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch & WorkspaceRouteSearch>(["diff", "tab"])],
  },
  component: ChatThreadRouteView,
});
```

- [ ] **Step 3: Rewire the sidebar content inside `DiffPanelInlineSidebar`**

Find the `DiffPanelInlineSidebar` component (around line 77). Inside its `<Sidebar ...>` body, the current content is:

```typescript
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
```

Replace with:

```typescript
        {renderDiffContent ? (
          <WorkspacePanel
            environmentId={props.environmentId}
            cwd={props.cwd}
            activeTab={props.activeTab}
            onSelectTab={props.onSelectTab}
          />
        ) : null}
```

- [ ] **Step 4: Propagate the new props to `DiffPanelInlineSidebar`**

Update the `DiffPanelInlineSidebar` props type:

```typescript
const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
  environmentId: EnvironmentId;
  cwd: string;
  activeTab: WorkspaceTabId;
  onSelectTab: (tab: WorkspaceTabId) => void;
}) => {
```

(add `EnvironmentId` and `WorkspaceTabId` imports at the top if they're not already present)

- [ ] **Step 5: Resolve `workspaceCwd` inside `ChatThreadRouteView`**

Find how the existing code derives the project's cwd. Look for `serverThread` and check its shape — if it already carries a `cwd` field, use it. Add this line near the top of `ChatThreadRouteView`:

```typescript
const workspaceCwd = serverThread?.cwd ?? "";
```

If `serverThread` does not directly have a `cwd` field, trace `selectThreadByRef` and `createThreadSelectorByRef` to find the canonical cwd (it may come from the environment or from a sibling selector). The fallback to `""` keeps types happy; `workspaceListDirectoryQueryOptions` is gated on `cwd.length > 0` and disables itself when empty, so the tree won't attempt to fetch.

- [ ] **Step 6: Compute `activeTab` and `onSelectTab` inside `ChatThreadRouteView`**

Still inside `ChatThreadRouteView`, add:

```typescript
const workspaceActiveTab = useMemo<WorkspaceTabId>(() => {
  if (search.tab) return search.tab;
  return { kind: "changes" };
}, [search.tab]);

const handleSelectWorkspaceTab = useCallback(
  (next: WorkspaceTabId) => {
    if (!threadRef) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => ({
        ...previous,
        diff: "1",
        tab: serializeWorkspaceTab(next),
      }),
    });
  },
  [navigate, threadRef],
);
```

Add the imports at the top of the file:

```typescript
import { serializeWorkspaceTab } from "../workspace/workspaceRouteSearch";
import type { WorkspaceTabId } from "../workspace/workspaceStore";
```

Pass the new props through to `DiffPanelInlineSidebar`:

```typescript
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
          environmentId={threadRef.environmentId}
          cwd={workspaceCwd}
          activeTab={workspaceActiveTab}
          onSelectTab={handleSelectWorkspaceTab}
        />
```

- [ ] **Step 7: Typecheck**

Run: `bun run --filter @t3tools/web typecheck`
Expected: success. If anything fails, fix it locally and re-run.

- [ ] **Step 8: Run the full test suite**

Run: `bun typecheck && bun lint && bun fmt:check && bun run test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/_chat.$environmentId.$threadId.tsx
git commit -m "feat(web): mount WorkspacePanel inside the chat thread diff sidebar"
```

### Task 9.2: Build the web app and inspect CM6 chunks

**Files:** _(build output only)_

- [ ] **Step 1: Run the production build**

Run: `bun run --filter @t3tools/web build`
Expected: success.

- [ ] **Step 2: Inspect `apps/web/dist/assets/` and verify CodeMirror language packs are split**

Run: `ls apps/web/dist/assets/ | grep -i 'lang-' | head -20`
Expected: each `@codemirror/lang-*` package appears as its own chunk (e.g. `lang-javascript-XXXX.js`, `lang-python-XXXX.js`, etc.). Record the total compressed size of the main chunk and log it in the commit message of Task 9.3 if it's notable.

- [ ] **Step 3: (optional) Compare the chunk count to the previous build**

If this is the first build after CM6 was added, the chunk count will increase by ~10 (one per language pack). Confirm this matches expectation.

### Task 9.3: Manual smoke test

**Files:** _(none — manual verification)_

- [ ] **Step 1: Start the dev server**

Run: `bun dev`
Expected: the server starts, the web app is reachable at the URL printed in the terminal.

- [ ] **Step 2: In a browser, open a thread and perform these smoke checks:**

- Open a chat thread. Confirm everything looks normal (thread list, chat view, composer).
- Click the existing button/shortcut that currently opens the diff panel. The right panel should open.
- Confirm the `Changes` tab is active by default — the existing diff view should render exactly like before.
- Click the `Files` tab. Confirm the tree renders with the top-level entries (src/, apps/, packages/, README.md, etc. depending on the project).
- Expand `src/` (or any directory). Confirm child entries appear.
- Click any small text file (e.g. `README.md`). Confirm a new tab appears with the file name, and the editor shows the contents with syntax highlighting.
- Close the file tab via its `×` button. Confirm the tab disappears and the active tab falls back to `Changes`.
- Click a very large file (if one exists, e.g. `bun.lock`). Confirm it shows the "Too large to preview" message.
- Click any image or binary file. Confirm the "Binary file" message appears.
- Refresh the browser. Confirm tree expansion state is preserved and the same active tab comes back (if `?tab=` was in the URL).

- [ ] **Step 3: If any smoke check fails**, stop here, record the failure, and fix it before proceeding. Do **not** ignore red-on-green behavior.

### Task 9.4: Final checks and branch cleanup

**Files:** _(none — verification + git)_

- [ ] **Step 1: Run the complete check suite one last time**

Run: `bun fmt:check && bun lint && bun typecheck && bun run test`
Expected: all green.

- [ ] **Step 2: Review the branch commit log**

Run: `git log --oneline feat/workspace-file-explorer-design..HEAD`
Expected: a clean sequence of ~15-25 commits, one per task/phase. Squash or reword only if something is clearly mislabeled.

- [ ] **Step 3: Push the branch to your fork**

Run: `git push -u origin feat/workspace-layer-1-tree-preview`
Expected: the branch is pushed to `github.com/jonaspauleta/t3code`.

- [ ] **Step 4: Open a PR on your fork from `feat/workspace-layer-1-tree-preview` → `main` (self-merge)**

Use the GitHub UI or `gh pr create --repo jonaspauleta/t3code --base main --head feat/workspace-layer-1-tree-preview`. The PR exists as a review gate; since this is a personal fork, merge when you're satisfied.

- [ ] **Step 5: Merge to fork `main`**

Either via `gh pr merge` or directly:

```bash
git checkout main
git merge --ff-only feat/workspace-layer-1-tree-preview
git push origin main
```

Expected: fork `main` is updated.

**Layer 1 is done when:** you can open the workspace panel in a running dev build, click `Files`, browse the tree, and preview a text file with syntax highlighting. Binary and too-large states render as designed. `bun fmt`, `bun lint`, `bun typecheck`, and `bun run test` are all green on the layer-1 branch. Tree expansion state persists across browser refreshes.

---

## References

- Design spec: `docs/superpowers/specs/2026-04-09-t3code-file-explorer-design.md`
- Existing service pattern: `apps/server/src/workspace/Services/WorkspaceFileSystem.ts`, `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`, `apps/server/src/workspace/Layers/WorkspaceFileSystem.test.ts`
- Existing WorkspaceEntries for hint on gitignore + readdir: `apps/server/src/workspace/Layers/WorkspaceEntries.ts:220+`
- RPC handler registration pattern: `apps/server/src/ws.ts:406-617` (the `WsRpcGroup.of({ ... })` block, specifically `projects.searchEntries` and `projects.writeFile` handlers at ~588-617)
- RPC client wiring: `apps/web/src/wsRpcClient.ts:64-66` (type) + `:291-293` (impl)
- React Query pattern: `apps/web/src/lib/projectReactQuery.ts`
- Sidebar resize guard (kept inline, pass as prop): `apps/web/src/routes/_chat.$environmentId.$threadId.tsx:94-138`
- DiffPanel modes: `apps/web/src/components/DiffPanelShell.tsx:8` — `"inline" | "sheet" | "sidebar"`
- Effect file-watch debounce pattern (used in Layer 2, not this layer): `apps/server/src/serverSettings.ts:267-283`
