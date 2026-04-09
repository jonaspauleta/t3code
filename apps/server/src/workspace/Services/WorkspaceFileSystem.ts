/**
 * WorkspaceFileSystem - Effect service contract for workspace file mutations.
 *
 * Owns workspace-root-relative file write operations and their associated
 * safety checks and cache invalidation hooks.
 *
 * @module WorkspaceFileSystem
 */
import { Schema, ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

import type {
  ProjectFileEvent,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSubscribeFileInput,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { ProjectReadFileError, ProjectSubscribeFileError } from "@t3tools/contracts";
import { WorkspacePathOutsideRootError } from "./WorkspacePaths.ts";

export class WorkspaceFileSystemError extends Schema.TaggedErrorClass<WorkspaceFileSystemError>()(
  "WorkspaceFileSystemError",
  {
    cwd: Schema.String,
    relativePath: Schema.optional(Schema.String),
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

/**
 * WorkspaceFileSystemShape - Service API for workspace-relative file operations.
 */
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
}

/**
 * WorkspaceFileSystem - Service tag for workspace file operations.
 */
export class WorkspaceFileSystem extends ServiceMap.Service<
  WorkspaceFileSystem,
  WorkspaceFileSystemShape
>()("t3/workspace/Services/WorkspaceFileSystem") {}
