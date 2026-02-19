import { getPullRequests } from "../lib/server/pulls";
import { PullsList } from "./pulls.client";

export default async function Pulls({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params;
  const data = await getPullRequests(owner, repo, "open");

  return <PullsList owner={owner} repo={repo} initialPulls={data.pullRequests || []} />;
}
