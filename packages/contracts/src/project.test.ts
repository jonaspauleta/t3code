import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  ProjectFileEvent,
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSubscribeFileInput,
  PROJECT_READ_FILE_MAX_BYTES,
} from "./project";

const decodeReadFileInput = Schema.decodeUnknownSync(ProjectReadFileInput);
const decodeReadFileResult = Schema.decodeUnknownSync(ProjectReadFileResult);
const decodeListDirectoryInput = Schema.decodeUnknownSync(ProjectListDirectoryInput);
const decodeListDirectoryResult = Schema.decodeUnknownSync(ProjectListDirectoryResult);
const decodeSubscribeFileInput = Schema.decodeUnknownSync(ProjectSubscribeFileInput);
const decodeFileEvent = Schema.decodeUnknownSync(ProjectFileEvent);

describe("ProjectReadFileInput", () => {
  it("accepts a cwd and relativePath", () => {
    const parsed = decodeReadFileInput({
      cwd: "/repo",
      relativePath: "src/index.ts",
    });
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.relativePath).toBe("src/index.ts");
  });

  it("rejects blank relativePath", () => {
    expect(() => decodeReadFileInput({ cwd: "/repo", relativePath: "" })).toThrow();
  });
});

describe("ProjectReadFileResult", () => {
  it("decodes a text result", () => {
    const parsed = decodeReadFileResult({
      _tag: "text",
      contents: "hello\n",
      size: 6,
      sha256: "abc123",
    });
    expect(parsed._tag).toBe("text");
    if (parsed._tag !== "text") throw new Error("unreachable");
    expect(parsed.contents).toBe("hello\n");
  });

  it("decodes a binary result with no mime", () => {
    const parsed = decodeReadFileResult({
      _tag: "binary",
      size: 128,
    });
    expect(parsed._tag).toBe("binary");
  });

  it("decodes a tooLarge result", () => {
    const parsed = decodeReadFileResult({
      _tag: "tooLarge",
      size: PROJECT_READ_FILE_MAX_BYTES + 1,
      limit: PROJECT_READ_FILE_MAX_BYTES,
    });
    expect(parsed._tag).toBe("tooLarge");
  });

  it("rejects an unknown tag", () => {
    expect(() => decodeReadFileResult({ _tag: "mystery", contents: "" })).toThrow();
  });
});

describe("ProjectListDirectoryInput", () => {
  it("accepts an empty relativePath for the workspace root", () => {
    const parsed = decodeListDirectoryInput({
      cwd: "/repo",
      relativePath: "",
    });
    expect(parsed.relativePath).toBe("");
    expect(parsed.includeHidden).toBeUndefined();
  });

  it("accepts includeHidden=true", () => {
    const parsed = decodeListDirectoryInput({
      cwd: "/repo",
      relativePath: "src",
      includeHidden: true,
    });
    expect(parsed.includeHidden).toBe(true);
  });
});

describe("ProjectListDirectoryResult", () => {
  it("decodes an empty listing", () => {
    const parsed = decodeListDirectoryResult({
      relativePath: "",
      entries: [],
      truncated: false,
    });
    expect(parsed.entries).toEqual([]);
    expect(parsed.truncated).toBe(false);
  });

  it("decodes a populated listing", () => {
    const parsed = decodeListDirectoryResult({
      relativePath: "src",
      entries: [
        { path: "src/index.ts", kind: "file", parentPath: "src" },
        { path: "src/lib", kind: "directory", parentPath: "src" },
      ],
      truncated: false,
    });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]?.kind).toBe("file");
  });
});

describe("ProjectSubscribeFileInput", () => {
  it("accepts a cwd and relativePath", () => {
    const parsed = decodeSubscribeFileInput({
      cwd: "/repo",
      relativePath: "src/index.ts",
    });
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.relativePath).toBe("src/index.ts");
  });
});

describe("ProjectFileEvent", () => {
  it("decodes a snapshot event", () => {
    const parsed = decodeFileEvent({ _tag: "snapshot", sha256: "abc", size: 42 });
    expect(parsed._tag).toBe("snapshot");
  });

  it("decodes a changed event", () => {
    const parsed = decodeFileEvent({ _tag: "changed", sha256: "def", size: 100 });
    expect(parsed._tag).toBe("changed");
  });

  it("decodes a deleted event", () => {
    const parsed = decodeFileEvent({ _tag: "deleted" });
    expect(parsed._tag).toBe("deleted");
  });

  it("rejects an unknown tag", () => {
    expect(() => decodeFileEvent({ _tag: "mystery", sha256: "x", size: 0 })).toThrow();
  });
});
