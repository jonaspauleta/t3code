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
 * Directories first, then files. Within each group, sorted by path
 * (case-insensitive via localeCompare `sensitivity: "base"`).
 */
export function compareEntriesForDisplay(left: ProjectEntry, right: ProjectEntry): number {
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
