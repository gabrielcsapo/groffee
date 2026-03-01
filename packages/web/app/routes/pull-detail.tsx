import { getPullRequest } from "../lib/server/pulls";
import { PullDetailLayout } from "./pull-detail.client";
import { getRequest } from "../lib/server/request-context";

export default async function PullDetail({ params }: { params?: Record<string, string> }) {
  const {
    owner,
    repo,
    number: prNumber,
  } = params as { owner: string; repo: string; number: string };
  const data = await getPullRequest(owner, repo, Number(prNumber));

  // Detect tab from request URL path
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
