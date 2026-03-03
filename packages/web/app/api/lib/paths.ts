import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

export const DATA_DIR = process.env.DATA_DIR || resolve(PROJECT_ROOT, "data");
export const REPOS_DIR = resolve(DATA_DIR, "repositories");
export const EXTERNAL_URL = (
  process.env.EXTERNAL_URL || `http://localhost:${process.env.PORT || "3000"}`
).replace(/\/$/, "");

/** Resolve a relative diskPath (e.g. "alice/repo.git") to an absolute path. */
export function resolveDiskPath(diskPath: string): string {
  return resolve(REPOS_DIR, diskPath);
}
