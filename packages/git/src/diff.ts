import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export async function getDiff(
  repoPath: string,
  fromOid: string,
  toOid: string,
): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", "-M", fromOid, toOid], {
    cwd: repoPath,
    maxBuffer: 10 * 1024 * 1024,
  });

  return parseDiff(stdout);
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    let status: DiffFile["status"] = "modified";
    if (chunk.includes("new file mode")) status = "added";
    else if (chunk.includes("deleted file mode")) status = "deleted";
    else if (chunk.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match;

    while ((match = hunkRegex.exec(chunk)) !== null) {
      const hunkStart = match.index;
      const nextHunk = chunk.indexOf("\n@@ ", hunkStart + 1);
      const nextDiff = chunk.indexOf("\ndiff ", hunkStart + 1);
      const end = Math.min(
        nextHunk === -1 ? Infinity : nextHunk,
        nextDiff === -1 ? Infinity : nextDiff,
        chunk.length,
      );

      const hunkContent = chunk.slice(hunkStart, end);
      const hunkLines = hunkContent.split("\n").slice(1);

      hunks.push({
        oldStart: parseInt(match[1], 10),
        oldLines: parseInt(match[2] || "1", 10),
        newStart: parseInt(match[3], 10),
        newLines: parseInt(match[4] || "1", 10),
        lines: hunkLines,
      });
    }

    files.push({ oldPath, newPath, status, hunks });
  }

  return files;
}
