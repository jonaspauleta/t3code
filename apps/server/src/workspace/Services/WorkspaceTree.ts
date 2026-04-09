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
