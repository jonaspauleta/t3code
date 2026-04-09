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
