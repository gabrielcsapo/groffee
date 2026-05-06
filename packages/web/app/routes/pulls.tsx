import { getPullRequests } from "../lib/server/pulls";
import { PullsList } from "./pulls.client";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  return { status };
}

export default async function Pulls({
  params,
  loaderData,
}: {
  params?: Record<string, string>;
  loaderData?: { status: string };
}) {
  const { owner, repo } = params as { owner: string; repo: string };
  const status = loaderData?.status || "open";
  const data = await getPullRequests(owner, repo, status);

  return (
    <PullsList
      owner={owner}
      repo={repo}
      initialStatus={status}
      initialPulls={data.pullRequests || []}
      initialNextCursor={data.nextCursor || null}
      initialHasMore={data.hasMore ?? false}
    />
  );
}
