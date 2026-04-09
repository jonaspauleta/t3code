import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FileBuffer } from "./workspaceStore";
import { useWorkspaceStore } from "./workspaceStore";

function resetStore() {
  useWorkspaceStore.setState({ byCwd: {} });
}

function makeTextBuffer(contents: string): FileBuffer {
  return {
    server: {
      kind: "text",
      contents,
      sha256: "abc",
      size: contents.length,
    },
    isEditMode: false,
    editorContents: null,
    cursor: null,
    diskSha256: null,
    diskSize: null,
    hasExternalChange: false,
  };
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
      store.setFileBuffer("/repo/a", "src/index.ts", makeTextBuffer("// ..."));
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

  describe("toggleEditMode", () => {
    it("flips isEditMode on an existing buffer", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.toggleEditMode("/repo/a", "src/a.ts");
      expect(
        useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"]?.isEditMode,
      ).toBe(true);
    });
  });

  describe("setEditorContents", () => {
    it("marks the buffer dirty when contents differ from server", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.setEditorContents("/repo/a", "src/a.ts", "hello world");
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.editorContents).toBe("hello world");
    });

    it("clears editorContents when they match server contents again", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.setEditorContents("/repo/a", "src/a.ts", "hello world");
      store.setEditorContents("/repo/a", "src/a.ts", "hello");
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.editorContents).toBeNull();
    });
  });

  describe("markDiskSnapshot", () => {
    it("sets hasExternalChange=true when dirty and sha mismatches", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello")); // sha = "abc"
      store.setEditorContents("/repo/a", "src/a.ts", "hello world"); // dirty
      store.markDiskSnapshot("/repo/a", "src/a.ts", "different-sha", 123);
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.hasExternalChange).toBe(true);
    });

    it("leaves hasExternalChange=false when clean and sha mismatches", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.markDiskSnapshot("/repo/a", "src/a.ts", "different-sha", 123);
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.hasExternalChange).toBe(false);
    });
  });

  describe("resolveExternalChange", () => {
    it("keepMine clears the banner but keeps edits", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.setEditorContents("/repo/a", "src/a.ts", "edited");
      store.markDiskSnapshot("/repo/a", "src/a.ts", "different", 10);
      store.resolveExternalChange("/repo/a", "src/a.ts", "keepMine");
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.hasExternalChange).toBe(false);
      expect(buffer?.editorContents).toBe("edited");
    });

    it("reload drops edits and clears banner", () => {
      const store = useWorkspaceStore.getState();
      store.openFile("/repo/a", "src/a.ts");
      store.setFileBuffer("/repo/a", "src/a.ts", makeTextBuffer("hello"));
      store.setEditorContents("/repo/a", "src/a.ts", "edited");
      store.markDiskSnapshot("/repo/a", "src/a.ts", "different", 10);
      store.resolveExternalChange("/repo/a", "src/a.ts", "reload");
      const buffer = useWorkspaceStore.getState().byCwd["/repo/a"]?.fileBuffers["src/a.ts"];
      expect(buffer?.hasExternalChange).toBe(false);
      expect(buffer?.editorContents).toBeNull();
    });
  });

  describe("setWordWrap", () => {
    it("toggles wordWrap per cwd", () => {
      const store = useWorkspaceStore.getState();
      store.setWordWrap("/repo/a", true);
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.wordWrap).toBe(true);
      store.setWordWrap("/repo/a", false);
      expect(useWorkspaceStore.getState().byCwd["/repo/a"]?.wordWrap).toBe(false);
    });
  });
});
