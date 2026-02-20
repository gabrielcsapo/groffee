import { getRepoActivity } from "../lib/server/repos";
import { ActivityDashboard } from "../components/activity-dashboard";

export default async function RepoActivity({
  params,
}: {
  params: { owner: string; repo: string };
}) {
  const { owner, repo: repoName } = params;

  const data = await getRepoActivity(owner, repoName);

  if (data.error) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Activity not available</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <ActivityDashboard
      initialData={{
        daily: data.daily!,
        weekly: data.weekly!,
        punchcard: data.punchcard!,
        fileFrequency: data.fileFrequency!,
        languages: data.languages!,
        contributorTimeline: data.contributorTimeline!,
      }}
      contributors={data.contributors!}
      totalCommits={data.totalCommits!}
      owner={owner}
      repo={repoName}
      defaultBranch={data.defaultBranch!}
    />
  );
}
