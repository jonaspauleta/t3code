import { describe, expect, it } from "vitest";

import {
  parseWorkspaceRouteSearch,
  serializeWorkspaceTab,
  stripWorkspaceSearchParams,
} from "./workspaceRouteSearch";

describe("parseWorkspaceRouteSearch", () => {
  it("returns empty when tab is missing", () => {
    expect(parseWorkspaceRouteSearch({})).toEqual({});
    expect(parseWorkspaceRouteSearch({ diff: "1" })).toEqual({});
  });

  it("parses the changes token", () => {
    expect(parseWorkspaceRouteSearch({ tab: "changes" })).toEqual({
      tab: { kind: "changes" },
    });
  });

  it("parses the files token", () => {
    expect(parseWorkspaceRouteSearch({ tab: "files" })).toEqual({
      tab: { kind: "files" },
    });
  });

  it("parses an encoded file path", () => {
    expect(parseWorkspaceRouteSearch({ tab: "file:src%2Findex.ts" })).toEqual({
      tab: { kind: "file", relativePath: "src/index.ts" },
    });
  });

  it("handles nested file paths", () => {
    expect(parseWorkspaceRouteSearch({ tab: "file:apps%2Fweb%2Fsrc%2Findex.tsx" })).toEqual({
      tab: { kind: "file", relativePath: "apps/web/src/index.tsx" },
    });
  });

  it("returns empty on malformed input", () => {
    expect(parseWorkspaceRouteSearch({ tab: "" })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: 123 })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: "file:" })).toEqual({});
    expect(parseWorkspaceRouteSearch({ tab: "file:%E0%A4%A" })).toEqual({}); // broken %-escape
  });
});

describe("serializeWorkspaceTab", () => {
  it("round-trips every tab kind", () => {
    const cases = [
      { kind: "changes" } as const,
      { kind: "files" } as const,
      { kind: "file", relativePath: "src/index.ts" } as const,
      { kind: "file", relativePath: "apps/web/src/index.tsx" } as const,
    ];
    for (const tab of cases) {
      const roundTripped = parseWorkspaceRouteSearch({ tab: serializeWorkspaceTab(tab) }).tab;
      expect(roundTripped).toEqual(tab);
    }
  });
});

describe("stripWorkspaceSearchParams", () => {
  it("removes only the tab key", () => {
    expect(stripWorkspaceSearchParams({ diff: "1", tab: "changes", other: "x" })).toEqual({
      diff: "1",
      other: "x",
    });
  });
});
