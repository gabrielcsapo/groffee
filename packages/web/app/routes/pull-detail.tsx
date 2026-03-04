import { Suspense } from "react";
import { getPullRequest } from "../lib/server/pulls";
import { PullDetailLayout } from "./pull-detail.client";
import { getRequest } from "../lib/server/request-context";

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

async function PullDetailContent({ params }: { params: Record<string, string> }) {
  const {
    owner,
    repo,
    number: prNumber,
  } = params as { owner: string; repo: string; number: string };
  const data = await getPullRequest(owner, repo, Number(prNumber));
  const req = getRequest();
  const isFilesTab = req ? new URL(req.url).pathname.endsWith("/files-changed") : false;
  return (
    <PullDetailLayout
      owner={owner}
      repo={repo}
      prNumber={prNumber}
      initialPR={data.pullRequest || null}
      initialDiff={data.diff || null}
      initialComments={data.comments || []}
      tab={isFilesTab ? "files" : "conversation"}
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
