import { Outlet } from "react-router";
import { apiFetch } from "../lib/api";
import { PullDetailLayout } from "./pull-detail.client";

export default async function PullDetail({
  params,
}: {
  params: { owner: string; repo: string; number: string };
}) {
  const { owner, repo, number: prNumber } = params;
  const data = await apiFetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}`);

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
