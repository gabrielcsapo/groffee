import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BlameLine {
  oid: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  lineNumber: number;
  content: string;
}

export async function getBlame(repoPath: string, ref: string, path: string): Promise<BlameLine[]> {
  const { stdout } = await execFileAsync("git", ["blame", "--porcelain", ref, "--", path], {
    cwd: repoPath,
    maxBuffer: 10 * 1024 * 1024,
  });

  return parsePorcelainBlame(stdout);
}

function parsePorcelainBlame(raw: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const rawLines = raw.split("\n");
  let i = 0;

  while (i < rawLines.length) {
    const headerMatch = rawLines[i]?.match(/^([0-9a-f]{40}) (\d+) (\d+)/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const oid = headerMatch[1];
    const lineNumber = parseInt(headerMatch[3], 10);

    let author = "";
    let authorEmail = "";
    let timestamp = 0;
    i++;

    while (i < rawLines.length && !rawLines[i].startsWith("\t")) {
      const line = rawLines[i];
      if (line.startsWith("author ")) author = line.slice(7);
      else if (line.startsWith("author-mail ")) authorEmail = line.slice(12).replace(/[<>]/g, "");
      else if (line.startsWith("author-time ")) timestamp = parseInt(line.slice(12), 10);
      i++;
    }

    const content = i < rawLines.length ? rawLines[i].slice(1) : "";
    i++;

    lines.push({ oid, author, authorEmail, timestamp, lineNumber, content });
  }

  return lines;
}
