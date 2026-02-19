import { Outlet } from "react-router";
import { getPullRequest } from "../lib/server/pulls";
import { PullDetailLayout } from "./pull-detail.client";

export default async function PullDetail({
  params,
}: {
  params: { owner: string; repo: string; number: string };
}) {
  const { owner, repo, number: prNumber } = params;
  const data = await getPullRequest(owner, repo, Number(prNumber));

  return (
    <PullDetailLayout
      owner={owner}
      repo={repo}
      prNumber={prNumber}
      initialPR={data.pullRequest || null}
      initialDiff={data.diff || null}
      initialComments={data.comments || []}
    >
      <Outlet />
    </PullDetailLayout>
  );
}
