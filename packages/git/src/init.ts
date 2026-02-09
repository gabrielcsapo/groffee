import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function initBareRepo(repoPath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });
  await execFileAsync("git", ["init", "--bare", "."], { cwd: repoPath });
  await execFileAsync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
    cwd: repoPath,
  });
}
