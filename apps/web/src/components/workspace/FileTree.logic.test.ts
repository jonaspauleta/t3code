import { describe, expect, it } from "vitest";

import type { ProjectEntry } from "@t3tools/contracts";

import {
  buildVisibleRows,
  compareEntriesForDisplay,
  toForwardSlashes,
  type DirectoryListingSnapshot,
} from "./FileTree.logic";

const rootListing: DirectoryListingSnapshot = {
  relativePath: "",
  entries: [
    { path: "src", kind: "directory", parentPath: undefined },
    { path: "tests", kind: "directory", parentPath: undefined },
    { path: "README.md", kind: "file", parentPath: undefined },
  ],
};

const srcListing: DirectoryListingSnapshot = {
  relativePath: "src",
  entries: [
    { path: "src/index.ts", kind: "file", parentPath: "src" },
    { path: "src/lib", kind: "directory", parentPath: "src" },
  ],
};

const srcLibListing: DirectoryListingSnapshot = {
  relativePath: "src/lib",
  entries: [{ path: "src/lib/util.ts", kind: "file", parentPath: "src/lib" }],
};

describe("buildVisibleRows", () => {
  it("returns the root listing when nothing is expanded", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([["", rootListing]]),
      expandedDirectories: new Set(),
    });
    expect(rows.map((row) => row.entry.path)).toEqual(["src", "tests", "README.md"]);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
  });

  it("inlines a child listing when a directory is expanded", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([
        ["", rootListing],
        ["src", srcListing],
      ]),
      expandedDirectories: new Set(["src"]),
    });
    expect(rows.map((row) => row.entry.path)).toEqual([
      "src",
      "src/index.ts",
      "src/lib",
      "tests",
      "README.md",
    ]);
    const srcRow = rows[0];
    const srcIndexRow = rows[1];
    expect(srcRow?.depth).toBe(0);
    expect(srcRow?.isExpanded).toBe(true);
    expect(srcIndexRow?.depth).toBe(1);
    expect(srcIndexRow?.isExpanded).toBe(false);
  });

  it("recursively inlines nested expansions", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([
        ["", rootListing],
        ["src", srcListing],
        ["src/lib", srcLibListing],
      ]),
      expandedDirectories: new Set(["src", "src/lib"]),
    });
    expect(rows.map((row) => row.entry.path)).toEqual([
      "src",
      "src/index.ts",
      "src/lib",
      "src/lib/util.ts",
      "tests",
      "README.md",
    ]);
    expect(rows[3]?.depth).toBe(2);
  });

  it("skips expanded directories whose listing hasn't loaded yet", () => {
    const rows = buildVisibleRows({
      listingsByRelativePath: new Map([["", rootListing]]),
      expandedDirectories: new Set(["src"]), // listing not yet loaded
    });
    expect(rows.map((row) => row.entry.path)).toEqual(["src", "tests", "README.md"]);
    expect(rows[0]?.isExpanded).toBe(true);
  });
});

describe("compareEntriesForDisplay", () => {
  it("places directories before files", () => {
    const dir: ProjectEntry = { path: "src", kind: "directory" };
    const file: ProjectEntry = { path: "abc.md", kind: "file" };
    expect(compareEntriesForDisplay(dir, file)).toBeLessThan(0);
    expect(compareEntriesForDisplay(file, dir)).toBeGreaterThan(0);
  });

  it("sorts same-kind entries alphabetically, case-insensitive", () => {
    const alpha: ProjectEntry = { path: "Alpha.ts", kind: "file" };
    const beta: ProjectEntry = { path: "beta.ts", kind: "file" };
    expect(compareEntriesForDisplay(alpha, beta)).toBeLessThan(0);
  });
});

describe("toForwardSlashes", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(toForwardSlashes("src\\index.ts")).toBe("src/index.ts");
  });
  it("leaves forward slashes alone", () => {
    expect(toForwardSlashes("src/index.ts")).toBe("src/index.ts");
  });
});
