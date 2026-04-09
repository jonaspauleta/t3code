#!/usr/bin/env node
/**
 * Spawn `bun run dev:bundle` and `bun run dev:electron` in parallel and
 * forward their stdio. Exists because `bun run --parallel` is not a
 * supported flag (bun run does not natively run multiple scripts in
 * parallel within a single package), so the previous one-liner
 * `bun run --parallel dev:bundle dev:electron` silently only ran
 * dev:bundle — the Electron window never launched.
 *
 * On SIGINT / SIGTERM the parent forwards the signal to both children
 * and exits with the first non-zero code.
 */

import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;
let exitCode = 0;

function spawnChild(name, script) {
  const child = spawn("bun", ["run", script], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  children.push({ name, child });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    // First child to exit triggers shutdown of the sibling.
    const failed = typeof code === "number" && code !== 0;
    if (failed || signal) {
      exitCode = code ?? 1;
      console.error(`[dev] ${name} exited with ${code ?? signal}, stopping siblings...`);
    } else {
      console.log(`[dev] ${name} exited cleanly, stopping siblings...`);
    }
    shutdown();
  });
  child.on("error", (err) => {
    console.error(`[dev] ${name} failed to spawn:`, err.message);
    exitCode = 1;
    shutdown();
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  // Give children a moment to clean up, then hard-exit.
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on("SIGINT", () => {
  console.log("[dev] received SIGINT");
  shutdown();
});
process.on("SIGTERM", () => {
  console.log("[dev] received SIGTERM");
  shutdown();
});

spawnChild("dev:bundle", "dev:bundle");
spawnChild("dev:electron", "dev:electron");
