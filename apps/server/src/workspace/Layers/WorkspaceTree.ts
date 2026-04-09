import fsPromises from "node:fs/promises";
import type { Dirent } from "node:fs";

import { Effect, Layer, Option } from "effect";

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

/**
 * Sort dirents by Unicode codepoint (uppercase before lowercase) so the tree
 * UI presents entries in a stable, deterministic order regardless of host
 * locale.
 */
function compareDirentsByName(left: Dirent, right: Dirent): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

export const makeWorkspaceTree = Effect.gen(function* () {
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

    // Resolve the directory safely. For the workspace root itself, use
    // `input.cwd` directly because `resolveRelativePathWithinRoot` rejects
    // any path that normalizes back to the root.
    const absoluteDirectory =
      normalizedRelative.length === 0
        ? input.cwd
        : (yield* workspacePaths.resolveRelativePathWithinRoot({
            workspaceRoot: input.cwd,
            relativePath: normalizedRelative,
          })).absolutePath;

    const dirents = yield* Effect.tryPromise({
      try: () => fsPromises.readdir(absoluteDirectory, { withFileTypes: true }),
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

    allowedDirectoryEntries.sort(compareDirentsByName);
    allowedFileEntries.sort(compareDirentsByName);

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
