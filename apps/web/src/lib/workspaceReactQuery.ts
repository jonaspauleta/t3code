import type {
  EnvironmentId,
  ProjectCreateDirectoryInput,
  ProjectCreateDirectoryResult,
  ProjectCreateFileInput,
  ProjectCreateFileResult,
  ProjectDeleteEntryInput,
  ProjectDeleteEntryResult,
  ProjectFileEvent,
  ProjectListDirectoryResult,
  ProjectReadFileResult,
  ProjectRenameEntryInput,
  ProjectRenameEntryResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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

/**
 * Invalidate all `listDirectory` queries for the given cwd so the tree
 * refreshes after any file operation.
 */
function invalidateTreeQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  environmentId: EnvironmentId | null,
  cwd: string,
) {
  queryClient.invalidateQueries({
    queryKey: ["workspace", "list-directory", environmentId ?? null, cwd],
  });
  queryClient.invalidateQueries({ queryKey: ["git", "status"] });
}

/**
 * Mutation hook for `projects.createFile`.
 */
export function useCreateFile(environmentId: EnvironmentId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      relativePath: string;
      contents?: string;
      overwrite?: boolean;
    }): Promise<ProjectCreateFileResult> => {
      if (!environmentId) {
        throw new Error("Workspace create file is unavailable.");
      }
      const api = ensureEnvironmentApi(environmentId);
      return api.projects.createFile(input as ProjectCreateFileInput);
    },
    onSuccess: (_result, variables) => {
      invalidateTreeQueries(queryClient, environmentId, variables.cwd);
    },
  });
}

/**
 * Mutation hook for `projects.createDirectory`.
 */
export function useCreateDirectory(environmentId: EnvironmentId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      relativePath: string;
    }): Promise<ProjectCreateDirectoryResult> => {
      if (!environmentId) {
        throw new Error("Workspace create directory is unavailable.");
      }
      const api = ensureEnvironmentApi(environmentId);
      return api.projects.createDirectory(input as ProjectCreateDirectoryInput);
    },
    onSuccess: (_result, variables) => {
      invalidateTreeQueries(queryClient, environmentId, variables.cwd);
    },
  });
}

/**
 * Mutation hook for `projects.renameEntry`.
 */
export function useRenameEntry(environmentId: EnvironmentId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      relativePath: string;
      nextRelativePath: string;
    }): Promise<ProjectRenameEntryResult> => {
      if (!environmentId) {
        throw new Error("Workspace rename entry is unavailable.");
      }
      const api = ensureEnvironmentApi(environmentId);
      return api.projects.renameEntry(input as ProjectRenameEntryInput);
    },
    onSuccess: (_result, variables) => {
      invalidateTreeQueries(queryClient, environmentId, variables.cwd);
      // Invalidate read-file queries for both old and new paths.
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.readFile(environmentId, variables.cwd, variables.relativePath),
      });
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.readFile(
          environmentId,
          variables.cwd,
          variables.nextRelativePath,
        ),
      });
    },
  });
}

/**
 * Mutation hook for `projects.deleteEntry`.
 */
export function useDeleteEntry(environmentId: EnvironmentId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      relativePath: string;
      recursive?: boolean;
    }): Promise<ProjectDeleteEntryResult> => {
      if (!environmentId) {
        throw new Error("Workspace delete entry is unavailable.");
      }
      const api = ensureEnvironmentApi(environmentId);
      return api.projects.deleteEntry(input as ProjectDeleteEntryInput);
    },
    onSuccess: (_result, variables) => {
      invalidateTreeQueries(queryClient, environmentId, variables.cwd);
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.readFile(environmentId, variables.cwd, variables.relativePath),
      });
    },
  });
}
