import { getPullRequests } from "../lib/server/pulls";
import { PullsList } from "./pulls.client";

export default async function Pulls({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };
  const data = await getPullRequests(owner, repo, "open");

  return <PullsList owner={owner} repo={repo} initialPulls={data.pullRequests || []} />;
}
