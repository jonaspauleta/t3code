import { createHash } from "node:crypto";

import { Effect, FileSystem, Layer, Option, Path, PlatformError, Stream } from "effect";

import {
  PROJECT_READ_FILE_MAX_BYTES,
  type ProjectFileEvent,
  ProjectReadFileError,
  type ProjectReadFileResult,
  ProjectSubscribeFileError,
} from "@t3tools/contracts";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

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

interface FileSnapshot {
  readonly sha256: string;
  readonly size: number;
}

function isNotFoundError(cause: PlatformError.PlatformError): boolean {
  return cause.reason._tag === "NotFound";
}

/**
 * Snapshot the sha256 + size of a file at `absolutePath`.
 *
 * Returns `null` when the file is missing (so callers can emit a "deleted"
 * event instead of an error). Wraps other IO failures into
 * `ProjectSubscribeFileError`.
 */
function snapshotFile(
  fileSystem: FileSystem.FileSystem,
  absolutePath: string,
): Effect.Effect<FileSnapshot | null, ProjectSubscribeFileError> {
  return Effect.gen(function* () {
    const stat = yield* fileSystem.stat(absolutePath);
    const bytes = yield* fileSystem.readFile(absolutePath);
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      sha256: createHash("sha256").update(buffer).digest("hex"),
      size: Number(stat.size),
    } satisfies FileSnapshot;
  }).pipe(
    Effect.catch((cause) =>
      isNotFoundError(cause)
        ? Effect.succeed(null)
        : Effect.fail(
            new ProjectSubscribeFileError({
              message: `Failed to snapshot workspace file: ${cause.message}`,
              cause,
            }),
          ),
    ),
  );
}

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

  // Per-subscription file watcher.
  //
  // Each `subscribeFile` call opens its own `fileSystem.watch` stream on the
  // parent directory and filters for events affecting the target basename.
  //
  // Design note: the plan originally called for a shared per-directory watcher
  // with refcounting (§11 R2 mitigation) to bound Linux inotify usage. That
  // optimization is deferred — see the implementation report for rationale.
  // The short version: Jonas runs macOS (FSEvents, no inotify ceiling), and
  // our attempts to multiplex via `PubSub` + a long-lived `Effect.forkIn`
  // fiber surfaced a lifecycle bug where downstream subscribers never saw
  // published events in our Effect 4.0 beta version. A naive per-subscription
  // watch is acceptable for L2 and we can revisit sharing in a follow-up.
  const subscribeFile: WorkspaceFileSystemShape["subscribeFile"] = (input) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const target = yield* workspacePaths.resolveRelativePathWithinRoot({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
        });
        const directory = path.dirname(target.absolutePath);
        const targetBasename = path.basename(target.absolutePath);

        // Initial snapshot: compute and emit immediately so clients always
        // have a baseline to reconcile against (including after a WS
        // reconnect that restarts the stream).
        const initial = yield* snapshotFile(fileSystem, target.absolutePath);
        const initialEvent: ProjectFileEvent = initial
          ? { _tag: "snapshot", sha256: initial.sha256, size: initial.size }
          : { _tag: "deleted" };

        // We cannot trust `event._tag` from the raw watcher because the
        // Node `fs.watch` wrapper in `@effect/platform-node-shared` reports
        // `rename` events (the most common kind emitted when editors save
        // atomically) as `Remove` whenever its internal stat probe fails.
        // Instead, re-stat on every event: if the file exists now, it's
        // `changed`; if not, it's `deleted`.
        //
        // We dedupe by sha256 (or the deleted flag) relative to the last
        // event we emitted. This filters out:
        //   1. Bursts of fs.watch events from a single logical save that
        //      all resolve to the same file contents.
        //   2. Phantom events fired at watcher startup (e.g. macOS FSEvents
        //      catching up to recent activity on the watched directory);
        //      they re-stat to the baseline content and get dropped.
        const state = { lastSha256: initial?.sha256 ?? null, lastDeleted: initial === null };
        const changes = fileSystem.watch(directory).pipe(
          Stream.filter((event) => path.basename(event.path) === targetBasename),
          Stream.mapEffect(
            (_event): Effect.Effect<Option.Option<ProjectFileEvent>, ProjectSubscribeFileError> =>
              snapshotFile(fileSystem, target.absolutePath).pipe(
                Effect.map((snapshot) => {
                  if (snapshot === null) {
                    if (state.lastDeleted) return Option.none();
                    state.lastDeleted = true;
                    state.lastSha256 = null;
                    return Option.some({ _tag: "deleted" } satisfies ProjectFileEvent);
                  }
                  if (!state.lastDeleted && snapshot.sha256 === state.lastSha256) {
                    return Option.none<ProjectFileEvent>();
                  }
                  state.lastDeleted = false;
                  state.lastSha256 = snapshot.sha256;
                  return Option.some({
                    _tag: "changed",
                    sha256: snapshot.sha256,
                    size: snapshot.size,
                  } satisfies ProjectFileEvent);
                }),
              ),
          ),
          // Drop events where the dedupe returned None.
          Stream.filter((event): event is Option.Some<ProjectFileEvent> => Option.isSome(event)),
          Stream.map((event) => event.value),
          Stream.catchCause((cause) =>
            Stream.fail(
              new ProjectSubscribeFileError({
                message: `Workspace file watcher failed: ${String(cause)}`,
                cause,
              }),
            ),
          ),
        );

        return Stream.concat(Stream.succeed(initialEvent), changes);
      }),
    );

  const writeFile: WorkspaceFileSystemShape["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.makeDirectory",
            detail: cause.message,
            cause,
          }),
      ),
    );
    yield* fileSystem.writeFileString(target.absolutePath, input.contents).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.writeFile",
            detail: cause.message,
            cause,
          }),
      ),
    );
    yield* workspaceEntries.invalidate(input.cwd);
    return { relativePath: target.relativePath };
  });

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
  return { writeFile, readFile, subscribeFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
