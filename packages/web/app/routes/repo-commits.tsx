import { getRepoCommits } from "../lib/server/repos";
import { CommitsList } from "./repo-commits.client";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return { authorEmail: url.searchParams.get("author") || "" };
}

export default async function RepoCommits({
  params,
  loaderData,
}: {
  params: { owner: string; repo: string; ref: string };
  loaderData: { authorEmail: string };
}) {
  const { owner, repo: repoName, ref } = params;
  const authorEmail = loaderData.authorEmail || undefined;

  const data = await getRepoCommits(owner, repoName, ref, { authorEmail });

  if (data.error) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">
            Commits not found
          </h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <CommitsList
      owner={owner}
      repo={repoName}
      currentRef={ref}
      branches={data.branches || [ref]}
      authors={data.authors || []}
      initialCommits={data.commits || []}
      initialAuthorFilter={authorEmail || ""}
    />
  );
}
