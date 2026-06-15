"use client";

/**
 * Tab content consumers — thin wrappers that read the PR detail context
 * and dispatch to the existing tab views. The views themselves
 * (PullConversationView, PullFilesView, PullCommitsView) stay unchanged
 * so this refactor is purely a routing reshape.
 */

import { usePullDetailContext } from "./pull-detail-context.client";
import { PullConversationView } from "./pull-conversation.client";
import { PullFilesView } from "./pull-files.client";
import { PullCommitsView } from "./pull-commits.client";

export function PullConversationConsumer() {
  const ctx = usePullDetailContext();
  if (!ctx.pr) return null;
  return (
    <PullConversationView
      owner={ctx.owner}
      repo={ctx.repo}
      prNumber={ctx.prNumber}
      pr={ctx.pr}
      setPr={ctx.setPr}
      prBodyHtml={ctx.prBodyHtml}
      setPrBodyHtml={ctx.setPrBodyHtml}
      commentsList={ctx.commentsList}
      setCommentsList={ctx.setCommentsList}
      user={ctx.user}
      pipelineRun={ctx.pipelineRun}
    />
  );
}

export function PullFilesConsumer() {
  const ctx = usePullDetailContext();
  return (
    <PullFilesView
      owner={ctx.owner}
      repo={ctx.repo}
      prNumber={ctx.prNumber}
      diff={ctx.diff}
      sourceHeadOid={ctx.sourceHeadOid}
      initialDiffComments={ctx.diffCommentsList}
      onDiffCommentsChange={ctx.setDiffCommentsList}
      currentUser={ctx.user}
    />
  );
}

export function PullCommitsConsumer() {
  const ctx = usePullDetailContext();
  return <PullCommitsView owner={ctx.owner} repo={ctx.repo} commits={ctx.commits} />;
}
