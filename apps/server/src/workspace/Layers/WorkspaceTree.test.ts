import { spawnSync } from "node:child_process";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import { ServerConfig } from "../../config.ts";
import { GitCoreLive } from "../../git/Layers/GitCore.ts";
import { WorkspaceTree } from "../Services/WorkspaceTree.ts";
import { WorkspacePathsLive } from "./WorkspacePaths.ts";
import { WorkspaceTreeLive } from "./WorkspaceTree.ts";

const TreeLayer = WorkspaceTreeLive.pipe(Layer.provide(WorkspacePathsLive));

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(TreeLayer),
  Layer.provideMerge(WorkspacePathsLive),
  Layer.provideMerge(GitCoreLive),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-workspace-tree-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3code-workspace-tree-",
  });
});

const writeTextFile = Effect.fn("writeTextFile")(function* (
  cwd: string,
  relativePath: string,
  contents = "",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.join(cwd, relativePath);
  yield* fileSystem
    .makeDirectory(path.dirname(absolutePath), { recursive: true })
    .pipe(Effect.orDie);
  yield* fileSystem.writeFileString(absolutePath, contents).pipe(Effect.orDie);
});

const makeDir = Effect.fn("makeDir")(function* (cwd: string, relativePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem
    .makeDirectory(path.join(cwd, relativePath), { recursive: true })
    .pipe(Effect.orDie);
});

it.layer(TestLayer)("WorkspaceTreeLive", (it) => {
  describe("listDirectory", () => {
    it.effect("lists the workspace root with directories first", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        yield* writeTextFile(cwd, "README.md", "# hi\n");
        yield* writeTextFile(cwd, "package.json", "{}\n");
        yield* makeDir(cwd, "src");
        yield* makeDir(cwd, "tests");

        const result = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
        });

        expect(result.relativePath).toBe("");
        expect(result.truncated).toBe(false);
        expect(result.entries.map((entry) => entry.path)).toEqual([
          "src",
          "tests",
          "README.md",
          "package.json",
        ]);
        expect(result.entries.map((entry) => entry.kind)).toEqual([
          "directory",
          "directory",
          "file",
          "file",
        ]);
      }),
    );

    it.effect("filters out ignored directories like node_modules and .git", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        yield* makeDir(cwd, "src");
        yield* makeDir(cwd, "node_modules/react");
        yield* makeDir(cwd, ".git/objects");
        yield* makeDir(cwd, "dist");
        yield* writeTextFile(cwd, "README.md", "# hi\n");

        const result = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
        });

        const paths = result.entries.map((entry) => entry.path);
        expect(paths).toEqual(["src", "README.md"]);
      }),
    );

    it.effect("respects .gitignore inside a git work tree", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        // Initialize a git repo in the temp dir. Shell out with `spawnSync`
        // directly to avoid pulling in heavier GitCoreLive setup.
        yield* Effect.sync(() => {
          const result = spawnSync("git", ["init", "--quiet"], { cwd });
          if (result.status !== 0) {
            throw new Error(
              `git init exited with status ${result.status}: ${result.stderr?.toString() ?? ""}`,
            );
          }
        });

        yield* writeTextFile(cwd, ".gitignore", "secrets.env\n");
        yield* writeTextFile(cwd, "README.md", "# hi\n");
        yield* writeTextFile(cwd, "secrets.env", "TOKEN=xyz\n");

        const result = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
        });

        const paths = result.entries.map((entry) => entry.path);
        expect(paths).toContain("README.md");
        expect(paths).not.toContain("secrets.env"); // gitignored
        expect(paths).not.toContain(".gitignore"); // dotfile, excluded by includeHidden=false default
      }),
    );

    it.effect("rejects paths outside the workspace root", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        const error = yield* workspaceTree
          .listDirectory({
            cwd,
            relativePath: "../escape",
          })
          .pipe(Effect.flip);

        expect(error.message).toContain(
          "Workspace file path must be relative to the project root: ../escape",
        );
      }),
    );

    it.effect("includes dotfiles when includeHidden is true", () =>
      Effect.gen(function* () {
        const workspaceTree = yield* WorkspaceTree;
        const cwd = yield* makeTempDir;

        yield* writeTextFile(cwd, ".env", "PORT=3000\n");
        yield* writeTextFile(cwd, "README.md", "# hi\n");

        const resultHidden = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
          includeHidden: true,
        });
        const hiddenPaths = resultHidden.entries.map((entry) => entry.path);
        expect(hiddenPaths).toContain(".env");
        expect(hiddenPaths).toContain("README.md");

        const resultDefault = yield* workspaceTree.listDirectory({
          cwd,
          relativePath: "",
        });
        const defaultPaths = resultDefault.entries.map((entry) => entry.path);
        expect(defaultPaths).toContain("README.md");
        expect(defaultPaths).not.toContain(".env");
      }),
    );
  });
});
