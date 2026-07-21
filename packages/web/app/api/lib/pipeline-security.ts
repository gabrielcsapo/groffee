import { existsSync, realpathSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export function resolvePipelineWorkspaceInput(workspaceDir: string, input: string): string {
  if (!input || isAbsolute(input)) throw new Error("Path must be relative to the workspace");
  const workspaceReal = realpathSync(workspaceDir);
  const candidate = resolve(workspaceReal, input);
  if (candidate !== workspaceReal && !candidate.startsWith(workspaceReal + sep)) {
    throw new Error(`Path escapes the workspace: ${input}`);
  }
  if (existsSync(candidate)) {
    const candidateReal = realpathSync(candidate);
    if (candidateReal !== workspaceReal && !candidateReal.startsWith(workspaceReal + sep)) {
      throw new Error(`Path resolves outside the workspace: ${input}`);
    }
    assertTreeContained(candidateReal, workspaceReal);
    return candidateReal;
  }
  return candidate;
}

function assertTreeContained(path: string, workspaceReal: string): void {
  const actual = realpathSync(path);
  if (actual !== workspaceReal && !actual.startsWith(workspaceReal + sep)) {
    throw new Error("Workspace input contains a symlink that resolves outside the workspace");
  }
  const stat = statSync(path);
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) assertTreeContained(resolve(path, entry), workspaceReal);
}
