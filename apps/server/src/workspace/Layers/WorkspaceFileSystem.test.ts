import { createHash } from "node:crypto";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";

import { PROJECT_READ_FILE_MAX_BYTES } from "@t3tools/contracts";

import { ServerConfig } from "../../config.ts";
import { GitCoreLive } from "../../git/Layers/GitCore.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspaceFileSystem } from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntriesLive } from "./WorkspaceEntries.ts";
import { WorkspaceFileSystemLive } from "./WorkspaceFileSystem.ts";
import { WorkspacePathsLive } from "./WorkspacePaths.ts";

const ProjectLayer = WorkspaceFileSystemLive.pipe(
  Layer.provide(WorkspacePathsLive),
  Layer.provide(WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive))),
);

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(ProjectLayer),
  Layer.provideMerge(WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive))),
  Layer.provideMerge(WorkspacePathsLive),
  Layer.provideMerge(GitCoreLive),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-workspace-files-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3code-workspace-files-",
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

// `excludeTestServices: true` keeps the real clock so our filesystem
// watch tests (which rely on real 300ms delays to schedule external
// mutations) fire events in real time rather than blocking on a frozen
// `TestClock`.
it.layer(TestLayer, { excludeTestServices: true })("WorkspaceFileSystemLive", (it) => {
  describe("writeFile", () => {
    it.effect("writes files relative to the workspace root", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem;
        const cwd = yield* makeTempDir;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const result = yield* workspaceFileSystem.writeFile({
          cwd,
          relativePath: "plans/effect-rpc.md",
          contents: "# Plan\n",
        });
        const saved = yield* fileSystem
          .readFileString(path.join(cwd, "plans/effect-rpc.md"))
          .pipe(Effect.orDie);

        expect(result).toEqual({ relativePath: "plans/effect-rpc.md" });
        expect(saved).toBe("# Plan\n");
      }),
    );

    it.effect("invalidates workspace entry search cache after writes", () =>
      Effect.gen(function* () {
        const workspaceEntries = yield* WorkspaceEntries;
        const workspaceFileSystem = yield* WorkspaceFileSystem;
        const cwd = yield* makeTempDir;
        yield* writeTextFile(cwd, "src/existing.ts", "export {};\n");

        const beforeWrite = yield* workspaceEntries.search({
          cwd,
          query: "rpc",
          limit: 10,
        });
        expect(beforeWrite).toEqual({
          entries: [],
          truncated: false,
        });

        yield* workspaceFileSystem.writeFile({
          cwd,
          relativePath: "plans/effect-rpc.md",
          contents: "# Plan\n",
        });

        const afterWrite = yield* workspaceEntries.search({
          cwd,
          query: "rpc",
          limit: 10,
        });
        expect(afterWrite.entries).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: "plans/effect-rpc.md" })]),
        );
        expect(afterWrite.truncated).toBe(false);
      }),
    );

    it.effect("rejects writes outside the workspace root", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem;
        const cwd = yield* makeTempDir;
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;

        const error = yield* workspaceFileSystem
          .writeFile({
            cwd,
            relativePath: "../escape.md",
            contents: "# nope\n",
          })
          .pipe(Effect.flip);

        expect(error.message).toContain(
          "Workspace file path must be relative to the project root: ../escape.md",
        );

        const escapedPath = path.resolve(cwd, "..", "escape.md");
        const escapedStat = yield* fileSystem
          .stat(escapedPath)
          .pipe(Effect.catch(() => Effect.succeed(null)));
        expect(escapedStat).toBeNull();
      }),
    );
  });

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
  });

  describe("subscribeFile", () => {
    it.effect("emits a snapshot event immediately on subscribe", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem;
        const cwd = yield* makeTempDir;
        const contents = "hello\n";
        yield* writeTextFile(cwd, "src/hello.txt", contents);

        // Take the first event from the stream with a timeout.
        const events = yield* workspaceFileSystem
          .subscribeFile({ cwd, relativePath: "src/hello.txt" })
          .pipe(Stream.take(1), Stream.runCollect, Effect.timeout("2 seconds"));

        expect(events).toHaveLength(1);
        const first = events[0]!;
        expect(first._tag).toBe("snapshot");
        if (first._tag !== "snapshot") throw new Error("unreachable");
        expect(first.size).toBe(Buffer.byteLength(contents, "utf8"));
        expect(first.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
      }),
    );

    it.effect("emits a changed event when the file is written", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem;
        const cwd = yield* makeTempDir;
        yield* writeTextFile(cwd, "a.txt", "original");

        // Schedule the modification to happen once the subscription is
        // established and the snapshot has been delivered.
        yield* writeTextFile(cwd, "a.txt", "modified").pipe(
          Effect.delay("300 millis"),
          Effect.forkChild,
        );

        const events = yield* workspaceFileSystem
          .subscribeFile({ cwd, relativePath: "a.txt" })
          .pipe(Stream.take(2), Stream.runCollect, Effect.timeout("3 seconds"));

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

        // Schedule the unlink to happen after the subscription is
        // established and the snapshot has been delivered.
        yield* fileSystem
          .remove(path.join(cwd, "gone.txt"))
          .pipe(Effect.orDie, Effect.delay("300 millis"), Effect.forkChild);

        const events = yield* workspaceFileSystem
          .subscribeFile({ cwd, relativePath: "gone.txt" })
          .pipe(Stream.take(2), Stream.runCollect, Effect.timeout("3 seconds"));

        expect(events).toHaveLength(2);
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
        yield* Effect.all(
          [writeTextFile(cwd, "src/a.txt", "a2"), writeTextFile(cwd, "src/b.txt", "b2")],
          { discard: true },
        ).pipe(Effect.delay("300 millis"), Effect.forkChild);

        const [aEvents, bEvents] = yield* Effect.all(
          [
            workspaceFileSystem
              .subscribeFile({ cwd, relativePath: "src/a.txt" })
              .pipe(Stream.take(2), Stream.runCollect),
            workspaceFileSystem
              .subscribeFile({ cwd, relativePath: "src/b.txt" })
              .pipe(Stream.take(2), Stream.runCollect),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.timeout("3 seconds"));

        expect(aEvents).toHaveLength(2);
        expect(aEvents[0]?._tag).toBe("snapshot");
        expect(aEvents[1]?._tag).toBe("changed");
        expect(bEvents).toHaveLength(2);
        expect(bEvents[0]?._tag).toBe("snapshot");
        expect(bEvents[1]?._tag).toBe("changed");
      }),
    );
  });
});
