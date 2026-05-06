import { getIssues } from "../lib/server/issues";
import { IssuesList } from "./issues.client";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  return { status };
}

export default async function Issues({
  params,
  loaderData,
}: {
  params?: Record<string, string>;
  loaderData?: { status: string };
}) {
  const { owner, repo } = params as { owner: string; repo: string };
  const status = loaderData?.status || "open";
  const data = await getIssues(owner, repo, status);

  return (
    <IssuesList
      owner={owner}
      repo={repo}
      initialStatus={status}
      initialIssues={data.issues || []}
      initialNextCursor={data.nextCursor || null}
      initialHasMore={data.hasMore ?? false}
    />
  );
}
