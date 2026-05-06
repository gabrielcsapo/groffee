/**
 * Inline error annotations for pipeline logs.
 *
 * Scans parsed log lines for `path/to/file.ext:LINE[:COL]` patterns and
 * returns the matched annotations so the UI can hyperlink them to the blob
 * view at the run's commit.
 *
 * Server-side, the caller verifies each unique path exists in the repo at
 * the run's commit via `git cat-file -e <oid>:<path>` — annotations whose
 * path doesn't resolve are dropped, so a `node_modules/foo.js:42` reference
 * (or a stray colon-formatted log line) doesn't render as a broken link.
 *
 * The match list is capped at 200 per step. If a step's log mentions the
 * same file/line a hundred times, only the first 200 hits get linkified;
 * the rest render as plain text. Bounded N keeps the client payload small
 * even on massive failure dumps.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_ANNOTATIONS_PER_STEP = 200;

export interface LogAnnotation {
  /** 0-based index into the line array. */
  lineIndex: number;
  /** Character offset of the match in the line's plain text (post-ANSI strip). */
  matchStart: number;
  matchEnd: number;
  /** Repo-relative file path. */
  filePath: string;
  /** 1-based line number from the match. */
  line: number;
  /** Optional 1-based column number. */
  column?: number;
}

// Match `path/to/file.ext:LINE[:COL]`. The path captures non-whitespace,
// non-quote, non-paren characters and must contain at least one `/` or a
// recognized extension (we leave the extension check loose — we do a real
// existence probe on the server). Anchored to a non-word boundary on the
// left so we don't match inside identifiers.
//
// Allowed leading prefix: `./` (commonly emitted by stack traces).
const PATTERN = /(?:^|[\s(["'`])(\.\/)?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?\b/g;

/**
 * Extract candidate annotations from raw line text. Caller is responsible
 * for stripping ANSI / HTML tags first — pass the visible plain text.
 */
export function extractAnnotationsFromLines(plainLines: string[]): LogAnnotation[] {
  const out: LogAnnotation[] = [];
  for (let i = 0; i < plainLines.length; i++) {
    if (out.length >= MAX_ANNOTATIONS_PER_STEP) break;
    const line = plainLines[i];
    if (!line) continue;
    PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PATTERN.exec(line)) !== null) {
      if (out.length >= MAX_ANNOTATIONS_PER_STEP) break;
      const filePath = m[2];
      const lineNum = parseInt(m[3], 10);
      const colNum = m[4] ? parseInt(m[4], 10) : undefined;
      if (!isFinite(lineNum) || lineNum <= 0) continue;
      if (!isSafeRepoPath(filePath)) continue;

      // The full match starts at m.index but includes the leading delimiter
      // (whitespace/paren/etc.). The actual file:line span starts after the
      // optional `./` prefix.
      const fullStart =
        m.index + (m[0].length - (m[2].length + 1 + m[3].length + (m[4] ? m[4].length + 1 : 0)));
      const fullEnd = fullStart + m[2].length + 1 + m[3].length + (m[4] ? m[4].length + 1 : 0);

      out.push({
        lineIndex: i,
        matchStart: fullStart,
        matchEnd: fullEnd,
        filePath,
        line: lineNum,
        column: colNum,
      });
    }
  }
  return out;
}

/**
 * Reject paths that can't safely round-trip into a blob URL:
 *   - absolute (`/etc/passwd`) — not a repo path
 *   - traversal (`..`) — would escape the repo
 *   - shell escape patterns (backticks, $, semicolons) — defense in depth
 *     even though we never feed these to a shell
 *   - empty / null bytes
 */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.length > 1024) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\0")) return false;
  if (/[`$;<>|&]/.test(path)) return false;
  for (const seg of path.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

/**
 * Verify a path exists as a blob at the given commit. Uses `git cat-file -e`
 * which is cheap (no content materialization, just an object lookup). Errors
 * from git resolve to `false` so a broken commit OID drops all annotations
 * rather than crashing.
 */
export async function pathExistsAtCommit(
  repoPath: string,
  commitOid: string,
  filePath: string,
): Promise<boolean> {
  if (!isSafeRepoPath(filePath)) return false;
  // Validate commitOid shape so we can't smuggle anything via the argv.
  if (!/^[0-9a-fA-F]{4,64}$/.test(commitOid)) return false;
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commitOid}:${filePath}`], {
      cwd: repoPath,
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip HTML markup from a log line's rendered HTML to recover the plain
 * text. We need this because `parseLogBlob` emits ANSI-decorated HTML, but
 * the regex needs raw text to compute character offsets that align with the
 * pre-render line.
 *
 * Caveat: the HTML version uses HTML entities (`&lt;`, `&gt;`, `&amp;`) — we
 * decode just those three since they're the only ones `escapeHtml` emits.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * End-to-end helper: extract annotations from rendered log lines, dedupe
 * paths, verify each unique path exists in the repo at `commitOid`, and
 * return only the resolved hits.
 */
export async function resolveAnnotations(
  lines: Array<{ html: string }>,
  repoPath: string,
  commitOid: string,
): Promise<LogAnnotation[]> {
  const plainLines = lines.map((l) => htmlToPlain(l.html));
  const candidates = extractAnnotationsFromLines(plainLines);
  if (candidates.length === 0) return [];

  // Verify uniqueness first so we don't issue 200 separate git calls when
  // a stack trace mentions the same file 200 times.
  const uniquePaths = Array.from(new Set(candidates.map((c) => c.filePath)));
  const resolvedSet = new Set<string>();
  await Promise.all(
    uniquePaths.map(async (p) => {
      if (await pathExistsAtCommit(repoPath, commitOid, p)) {
        resolvedSet.add(p);
      }
    }),
  );

  return candidates.filter((c) => resolvedSet.has(c.filePath));
}
