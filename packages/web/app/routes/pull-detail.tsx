import { Suspense } from "react";
import { getPullRequest, getDiffComments, getPullRequestCommits } from "../lib/server/pulls";
import { getLatestRunForCommit } from "../lib/server/pipelines";
import { db, repositories, users } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDiskPath } from "../api/lib/paths";
import { renderMarkdown } from "../lib/markdown";
import { PullDetailLayout } from "./pull-detail.client";
import { getRequest } from "../lib/server/request-context";

const execFileAsync = promisify(execFile);

function PullDetailSkeleton() {
  return (
    <div className="mt-4">
      <div className="skeleton w-2/3 h-7 mb-4" />
      <div className="flex gap-4 mb-4 border-b border-border pb-3">
        <div className="skeleton w-24 h-8" />
        <div className="skeleton w-24 h-8" />
      </div>
      <div className="space-y-3">
        <div className="skeleton w-full h-20" />
        <div className="skeleton w-full h-20" />
      </div>
    </div>
  );
}

function detectTab(req: Request | null | undefined): "conversation" | "files" | "commits" {
  if (!req) return "conversation";
  const path = new URL(req.url).pathname;
  if (path.endsWith("/files-changed")) return "files";
  if (path.endsWith("/commits")) return "commits";
  return "conversation";
}

async function PullDetailContent({ params }: { params: Record<string, string> }) {
  const {
    owner,
    repo,
    number: prNumber,
  } = params as { owner: string; repo: string; number: string };

  const data = await getPullRequest(owner, repo, Number(prNumber));
  const req = getRequest();
  const tab = detectTab(req);
  const pr = data.pullRequest || null;
  const prBodyHtml = pr?.body ? renderMarkdown(pr.body) : "";
  const comments = (data.comments || []).map((c) => ({
    ...c,
    bodyHtml: c.body ? renderMarkdown(c.body) : "",
  }));

  // Diff comments are loaded for both files + conversation tabs (the conversation
  // tab can show a count of unresolved threads in the future).
  const diffCommentResult = pr ? await getDiffComments(owner, repo, Number(prNumber)) : null;
  const diffCommentsList =
    diffCommentResult && "comments" in diffCommentResult ? diffCommentResult.comments : [];

  // Commits tab data — only needed when actually on commits tab, but keep
  // it cheap on the others (single git log call).
  const commitsResult =
    tab === "commits" && pr ? await getPullRequestCommits(owner, repo, Number(prNumber)) : null;
  const commits = commitsResult && "commits" in commitsResult ? commitsResult.commits : [];

  // Pipeline status for the source-branch HEAD (shown in conversation tab).
  let sourceHeadOid: string | null = null;
  let pipelineRun: Awaited<ReturnType<typeof getLatestRunForCommit>> | null = null;
  if (pr) {
    try {
      const [ownerRow] = await db.select().from(users).where(eq(users.username, owner)).limit(1);
      const [repoRow] = ownerRow
        ? await db
            .select()
            .from(repositories)
            .where(and(eq(repositories.ownerId, ownerRow.id), eq(repositories.name, repo)))
            .limit(1)
        : [];
      if (repoRow) {
        try {
          const { stdout } = await execFileAsync("git", ["rev-parse", pr.sourceBranch], {
            cwd: resolveDiskPath(repoRow.diskPath),
          });
          sourceHeadOid = stdout.trim();
          pipelineRun = await getLatestRunForCommit(repoRow.id, sourceHeadOid);
        } catch {
          // Source branch may have been deleted post-merge.
        }
      }
    } catch {
      // Best-effort — don't fail the page on pipeline lookup errors.
    }
  }

  return (
    <PullDetailLayout
      owner={owner}
      repo={repo}
      prNumber={prNumber}
      initialPR={pr}
      initialPRBodyHtml={prBodyHtml}
      initialDiff={data.diff || null}
      initialComments={comments}
      initialDiffComments={diffCommentsList}
      initialCommits={commits}
      sourceHeadOid={sourceHeadOid}
      pipelineRun={pipelineRun}
      tab={tab}
    />
  );
}

export default function PullDetail({ params }: { params?: Record<string, string> }) {
  return (
    <Suspense fallback={<PullDetailSkeleton />}>
      <PullDetailContent params={params!} />
    </Suspense>
  );
}
