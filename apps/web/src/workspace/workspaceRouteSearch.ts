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
