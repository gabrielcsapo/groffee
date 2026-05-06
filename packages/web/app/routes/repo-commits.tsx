import { getRepoCommits, getRepoRefs } from "../lib/server/repos";
import { CommitsList } from "./repo-commits.client";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return { authorEmail: url.searchParams.get("author") || "" };
}

export default async function RepoCommits({
  params,
  loaderData,
}: {
  params?: Record<string, string>;
  loaderData?: { authorEmail: string };
}) {
  const { owner, repo: repoName, ref } = params as { owner: string; repo: string; ref: string };
  const authorEmail = loaderData?.authorEmail || undefined;

  const [data, refsData] = await Promise.all([
    getRepoCommits(owner, repoName, ref, { authorEmail }),
    getRepoRefs(owner, repoName),
  ]);

  if (data.error) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Commits not found</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    );
  }

  const branchRefs = (refsData.refs || [])
    .filter((r: { type: string }) => r.type === "branch")
    .map((r: { name: string }) => ({ name: r.name }));
  const tagRefs = (refsData.refs || [])
    .filter((r: { type: string }) => r.type === "tag")
    .map((r: { name: string }) => ({ name: r.name }));

  // Fall back to the active ref if the ref index is empty (fresh repo).
  const branchesForPicker = branchRefs.length > 0 ? branchRefs : [{ name: ref }];

  return (
    <CommitsList
      owner={owner}
      repo={repoName}
      currentRef={ref}
      branches={branchesForPicker}
      tags={tagRefs}
      authors={data.authors || []}
      initialCommits={data.commits || []}
      initialAuthorFilter={authorEmail || ""}
    />
  );
}
