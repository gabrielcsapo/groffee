/**
 * Backfill `pullRequests` rows from merge commits in a repo's default branch.
 *
 * This is a one-shot helper run from the admin dashboard. It walks
 * `git log --merges` on the repo's default branch and synthesizes a PR
 * row for each merge commit that doesn't already have one. Two message
 * formats are recognized:
 *
 *   GitHub style: "Merge pull request #<number> from <branch>"
 *   Plain git:    "Merge branch '<source>' into <target>"
 *
 * For GitHub-style merges we use the embedded #N as the PR number; for
 * plain-git merges we allocate a fresh number from the next available
 * slot for the repo. The PR title comes from the second line of the
 * commit message body when present (which is conventionally the actual
 * PR title in GitHub-style merges); otherwise it falls back to the
 * subject. Author lookup matches users.email exactly — when no user
 * matches we fall back to the system user (or the first admin) so the
 * row's NOT NULL `author_id` foreign key can be satisfied.
 *
 * Idempotent: running it twice should be a no-op for any PRs that were
 * already backfilled (number+repoId uniqueness is enforced via lookup,
 * not a DB constraint, so we explicitly check before inserting).
 */

import { db, repositories, pullRequests, users } from "@groffee/db";
import { eq, and, max, desc } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDiskPath } from "./paths.js";

const execFileAsync = promisify(execFile);

interface ParsedMerge {
  number: number | null;
  sourceBranch: string;
  targetBranch: string;
  title: string;
}

const GITHUB_MERGE_RE = /^Merge pull request #(\d+) from (\S+)/;
const PLAIN_MERGE_RE = /^Merge branch '([^']+)'(?: into (\S+))?/;

function parseMergeMessage(
  subject: string,
  body: string,
  defaultBranch: string,
): ParsedMerge | null {
  const ghMatch = subject.match(GITHUB_MERGE_RE);
  if (ghMatch) {
    const num = parseInt(ghMatch[1], 10);
    const source = ghMatch[2];
    // GitHub-style merge bodies typically include the PR title on the
    // first non-blank line of the body (after a blank separator line).
    const title = body.split("\n").find((l) => l.trim().length > 0) || subject;
    // The source can be `user:branch` for cross-fork PRs; the target is
    // the branch the merge was made into. We don't know that authoritatively
    // here so we use the repo default.
    return {
      number: num,
      sourceBranch: source.includes(":") ? source.split(":").slice(-1)[0] : source,
      targetBranch: defaultBranch,
      title: title.trim(),
    };
  }
  const plainMatch = subject.match(PLAIN_MERGE_RE);
  if (plainMatch) {
    return {
      number: null,
      sourceBranch: plainMatch[1],
      targetBranch: plainMatch[2] || defaultBranch,
      title: subject,
    };
  }
  return null;
}

interface MergeCommit {
  sha: string;
  authorEmail: string;
  authorName: string;
  authorTimestamp: number;
  subject: string;
  body: string;
}

/**
 * List merge commits on the default branch with the metadata we need.
 * Format uses unit-separators so commit bodies (which contain newlines)
 * don't confuse the parser.
 */
async function listMergeCommits(repoPath: string, branch: string): Promise<MergeCommit[]> {
  // Format: shaauthorEmailauthorNameauthorTssubjectbody
  //  = unit separator,  = record separator
  const format = "%H%x1f%ae%x1f%an%x1f%at%x1f%s%x1f%b%x1e";
  let stdout = "";
  try {
    const r = await execFileAsync("git", ["log", "--merges", `--pretty=format:${format}`, branch], {
      cwd: repoPath,
      maxBuffer: 64 * 1024 * 1024,
    });
    stdout = r.stdout;
  } catch {
    return [];
  }

  const records = stdout.split("").map((r) => r.replace(/^\n/, ""));
  const out: MergeCommit[] = [];
  for (const rec of records) {
    if (!rec.trim()) continue;
    const fields = rec.split("");
    if (fields.length < 5) continue;
    const [sha, authorEmail, authorName, ts, subject, body = ""] = fields;
    const tsNum = parseInt(ts, 10);
    if (!sha || Number.isNaN(tsNum)) continue;
    out.push({
      sha,
      authorEmail,
      authorName,
      authorTimestamp: tsNum,
      subject,
      body,
    });
  }
  return out;
}

interface BackfillSummary {
  repoId: string;
  inserted: number;
  skipped: number;
  total: number;
}

async function backfillForRepo(
  repoId: string,
  diskPath: string,
  defaultBranch: string,
  fallbackAuthorId: string,
): Promise<BackfillSummary> {
  const merges = await listMergeCommits(resolveDiskPath(diskPath), defaultBranch);

  // Compute the next free PR number for this repo so plain-git merges can
  // be assigned one without colliding with existing PRs.
  const [existingMax] = await db
    .select({ n: max(pullRequests.number) })
    .from(pullRequests)
    .where(eq(pullRequests.repoId, repoId));
  let nextNumber = (existingMax?.n ?? 0) + 1;

  // Cache author lookups since most merges in a repo come from the same handful of emails.
  const authorCache = new Map<string, string>();
  async function resolveAuthorId(email: string): Promise<string> {
    const cached = authorCache.get(email);
    if (cached) return cached;
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const id = u?.id ?? fallbackAuthorId;
    authorCache.set(email, id);
    return id;
  }

  let inserted = 0;
  let skipped = 0;

  for (const merge of merges) {
    const parsed = parseMergeMessage(merge.subject, merge.body, defaultBranch);
    if (!parsed) {
      skipped++;
      continue;
    }

    let prNumber = parsed.number;

    // For GitHub-style merges, check if a PR with that number already exists
    // (most likely the case if the repo was created on Groffee and merged via
    // the UI). For plain merges we always allocate fresh.
    if (prNumber != null) {
      const [existing] = await db
        .select()
        .from(pullRequests)
        .where(and(eq(pullRequests.repoId, repoId), eq(pullRequests.number, prNumber)))
        .limit(1);
      if (existing) {
        skipped++;
        continue;
      }
    } else {
      prNumber = nextNumber++;
    }

    const authorId = await resolveAuthorId(merge.authorEmail);
    const mergedAt = new Date(merge.authorTimestamp * 1000);

    await db.insert(pullRequests).values({
      id: crypto.randomUUID(),
      number: prNumber,
      repoId,
      title: parsed.title.slice(0, 200) || `Merge ${merge.sha.slice(0, 7)}`,
      body: `Backfilled from merge commit ${merge.sha}`,
      authorId,
      sourceBranch: parsed.sourceBranch,
      targetBranch: parsed.targetBranch,
      status: "merged",
      createdAt: mergedAt,
      updatedAt: mergedAt,
      mergedAt,
      mergedById: authorId,
    });
    inserted++;
  }

  return { repoId, inserted, skipped, total: merges.length };
}

/**
 * Resolve a fallback author id for backfill rows whose commit author email
 * doesn't match any user. We try, in order: a user named "system", then
 * the repo owner, then the first admin user.
 */
async function resolveFallbackAuthor(repoOwnerId: string): Promise<string | null> {
  const [systemUser] = await db.select().from(users).where(eq(users.username, "system")).limit(1);
  if (systemUser) return systemUser.id;
  const [owner] = await db.select().from(users).where(eq(users.id, repoOwnerId)).limit(1);
  if (owner) return owner.id;
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .orderBy(desc(users.createdAt))
    .limit(1);
  return admin?.id ?? null;
}

export async function backfillPullRequestsForRepo(repoId: string): Promise<BackfillSummary> {
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1);
  if (!repo) return { repoId, inserted: 0, skipped: 0, total: 0 };
  const fallback = await resolveFallbackAuthor(repo.ownerId);
  if (!fallback) return { repoId, inserted: 0, skipped: 0, total: 0 };
  return backfillForRepo(repo.id, repo.diskPath, repo.defaultBranch, fallback);
}

export async function backfillPullRequestsForAllRepos(): Promise<BackfillSummary[]> {
  const allRepos = await db.select().from(repositories);
  const summaries: BackfillSummary[] = [];
  for (const repo of allRepos) {
    try {
      const fallback = await resolveFallbackAuthor(repo.ownerId);
      if (!fallback) {
        summaries.push({ repoId: repo.id, inserted: 0, skipped: 0, total: 0 });
        continue;
      }
      const summary = await backfillForRepo(repo.id, repo.diskPath, repo.defaultBranch, fallback);
      summaries.push(summary);
    } catch (err) {
      console.error(`PR backfill failed for repo ${repo.id}:`, err);
      summaries.push({ repoId: repo.id, inserted: 0, skipped: 0, total: 0 });
    }
  }
  return summaries;
}
