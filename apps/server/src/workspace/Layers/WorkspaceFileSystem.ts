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

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

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
  return { writeFile, readFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
