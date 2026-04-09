import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "./workspaceStore";

function resetStore() {
  useWorkspaceStore.setState({ byCwd: {} });
}

describe("workspaceStore", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  describe("openFile", () => {
    it("adds a file tab keyed by cwd", () => {
      useWorkspaceStore.getState().openFile("/repo/a", "src/index.ts");
      const state = useWorkspaceStore.getState().byCwd["/repo/a"];
      expect(state?.openTabs).toEqual([{ kind: "file", relativePath: "src/index.ts" }]);
    });

    it("is idempotent for an already-open file", () => {
      const { openFile } = useWorkspaceStore.getState();
      openFile("/repo/a", "src/index.ts");
      openFile("/repo/a", "src/index.ts");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.openTabs).toHaveLength(1);
    });

    it("keeps cwds isolated", () => {
      const { openFile } = useWorkspaceStore.getState();
      openFile("/repo/a", "src/a.ts");
      openFile("/repo/b", "src/b.ts");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.openTabs).toEqual([
        { kind: "file", relativePath: "src/a.ts" },
      ]);
      expect(useWorkspaceStore.getState().byCwd["/repo/b"]?.openTabs).toEqual([
        { kind: "file", relativePath: "src/b.ts" },
      ]);
    });
  });

  describe("closeTab", () => {
    it("removes the tab and drops its buffer", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/index.ts");
      store.setFileBuffer("/repo/a", "src/index.ts", {
        server: { kind: "text", contents: "// ...", sha256: "abc", size: 6 },
      });
      store.closeTab("/repo/a", { kind: "file", relativePath: "src/index.ts" });
      const state = useWorkspaceStore.getState().byCwd["/repo/a"];
      expect(state?.openTabs).toEqual([]);
      expect(state?.fileBuffers["src/index.ts"]).toBeUndefined();
    });
  });

  describe("toggleDirectory", () => {
    it("toggles expansion state for a directory", () => {
      const { toggleDirectory } = useWorkspaceStore.getState();
      toggleDirectory("/repo/a", "src");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.expandedDirectories).toEqual(["src"]);
      toggleDirectory("/repo/a", "src");
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.expandedDirectories).toEqual([]);
    });
  });
});
