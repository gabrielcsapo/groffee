import { getRepoActivity } from "../lib/server/repos";
import { ActivityHeatmap, ContributorList } from "../components/activity-chart";

export default async function RepoActivity({
  params,
}: {
  params: { owner: string; repo: string };
}) {
  const { owner, repo: repoName } = params;

  const data = await getRepoActivity(owner, repoName);

  if (data.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Activity not available</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    );
  }

  const daily = data.daily!;
  const contributors = data.contributors!;
  const totalCommits = data.totalCommits!;

  return (
    <div className="max-w-4xl mx-auto mt-8">
      {/* Commit activity heatmap */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-secondary">
          <h2 className="text-sm font-semibold text-text-primary">Commit activity</h2>
        </div>
        <div className="px-4 py-4">
          <ActivityHeatmap daily={daily} owner={owner} repo={repoName} />
        </div>
      </div>

      {/* Contributors */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface mt-4">
        <div className="px-4 py-3 border-b border-border bg-surface-secondary flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Contributors</h2>
          <span className="text-xs text-text-secondary">
            {totalCommits} total commit{totalCommits !== 1 ? "s" : ""}
          </span>
        </div>
        {contributors.length > 0 ? (
          <ContributorList contributors={contributors} owner={owner} repo={repoName} />
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-text-secondary">No commit data available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
