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
export const PIPELINE_WORKSPACES_DIR = resolve(DATA_DIR, "pipeline-workspaces");
export const PIPELINE_LOGS_DIR = resolve(DATA_DIR, "pipeline-logs");
export const PIPELINE_ARTIFACTS_DIR = resolve(DATA_DIR, "pipeline-artifacts");
export const PAGES_DIR = resolve(DATA_DIR, "pages");
export const PAGES_HOSTNAME = process.env.PAGES_HOSTNAME || "pages.localhost";
export const PAGES_MAX_DEPLOYMENTS = parseInt(process.env.PAGES_MAX_DEPLOYMENTS || "5", 10);

/**
 * When groffee runs inside Docker with the host socket mounted, volume mounts
 * in `docker run -v` must use HOST paths, not container paths.
 * Set DOCKER_HOST_DATA_DIR to the host-side path of the data directory.
 * If unset, falls back to DATA_DIR (works for bare-metal / DinD setups).
 */
export const DOCKER_HOST_DATA_DIR = process.env.DOCKER_HOST_DATA_DIR || DATA_DIR;
export const EXTERNAL_URL = (
  process.env.EXTERNAL_URL || `http://localhost:${process.env.PORT || "3000"}`
).replace(/\/$/, "");

/** Resolve a relative diskPath (e.g. "alice/repo.git") to an absolute path. */
export function resolveDiskPath(diskPath: string): string {
  return resolve(REPOS_DIR, diskPath);
}
