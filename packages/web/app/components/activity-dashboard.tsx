"use client";

import { useState, useCallback } from "react";
import { ActivityHeatmap, ContributorList } from "./activity-chart";
import {
  CommitVelocity,
  CodeFrequency,
  CommitPunchcard,
  LanguageBreakdown,
  ContributorTimeline,
} from "./activity-charts";

interface Contributor {
  name: string;
  email: string;
  commits: number;
  lastCommitAt: number;
}

interface ActivityData {
  daily: { day: number; commits: number; prs: number; issues: number }[];
  weekly: { week: number; count: number }[];
  punchcard: { day: number; hour: number; count: number }[];
  fileFrequency: { week: number; additions: number; modifications: number; deletions: number }[];
  languages: { language: string; count: number; percentage: number }[];
  contributorTimeline: { email: string; name: string; weeks: { week: number; count: number }[] }[];
}

interface Props {
  initialData: ActivityData;
  contributors: Contributor[];
  totalCommits: number;
  owner: string;
  repo: string;
  defaultBranch: string;
}

export function ActivityDashboard({
  initialData,
  contributors,
  totalCommits,
  owner,
  repo,
  defaultBranch,
}: Props) {
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [chartData, setChartData] = useState<ActivityData>(initialData);
  const [loading, setLoading] = useState(false);

  const handleAuthorChange = useCallback(async (email: string) => {
    setSelectedAuthor(email);

    if (!email) {
      setChartData(initialData);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/repos/${owner}/${repo}/activity?author=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setChartData({
          daily: data.daily,
          weekly: data.weekly,
          punchcard: data.punchcard,
          fileFrequency: data.fileFrequency,
          languages: data.languages,
          contributorTimeline: data.contributorTimeline,
        });
      }
    } catch {
      // Keep current data on error
    } finally {
      setLoading(false);
    }
  }, [owner, repo, initialData]);

  const selectedContributor = contributors.find((c) => c.email === selectedAuthor);

  return (
    <div className="max-w-6xl mx-auto mt-8 space-y-4">
      {/* Author filter */}
      {contributors.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary">Filter by contributor:</label>
          <select
            value={selectedAuthor}
            onChange={(e) => handleAuthorChange(e.target.value)}
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text-primary"
          >
            <option value="">All contributors</option>
            {contributors.map((c) => (
              <option key={c.email} value={c.email}>
                {c.name} ({c.commits} commits)
              </option>
            ))}
          </select>
          {loading && (
            <span className="text-xs text-text-secondary animate-pulse-subtle">Loading...</span>
          )}
          {selectedContributor && (
            <button
              type="button"
              onClick={() => handleAuthorChange("")}
              className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-surface-secondary"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Activity heatmap */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-secondary">
          <h2 className="text-sm font-semibold text-text-primary">Activity</h2>
        </div>
        <div className="px-4 py-4">
          <ActivityHeatmap daily={chartData.daily} owner={owner} repo={repo} />
        </div>
      </div>

      {/* Commit velocity + Code frequency side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="px-4 py-3 border-b border-border bg-surface-secondary">
            <h2 className="text-sm font-semibold text-text-primary">Commit velocity</h2>
          </div>
          <div className="px-4 py-4">
            <CommitVelocity data={chartData.weekly} />
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="px-4 py-3 border-b border-border bg-surface-secondary">
            <h2 className="text-sm font-semibold text-text-primary">Code frequency</h2>
          </div>
          <div className="px-4 py-4">
            <CodeFrequency data={chartData.fileFrequency} />
          </div>
        </div>
      </div>

      {/* Punchcard */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-secondary">
          <h2 className="text-sm font-semibold text-text-primary">Commit punchcard</h2>
        </div>
        <div className="px-4 py-4">
          <CommitPunchcard data={chartData.punchcard} />
        </div>
      </div>

      {/* Languages + Contributors side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="px-4 py-3 border-b border-border bg-surface-secondary">
            <h2 className="text-sm font-semibold text-text-primary">Languages</h2>
          </div>
          <div className="px-4 py-4">
            <LanguageBreakdown data={chartData.languages} />
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="px-4 py-3 border-b border-border bg-surface-secondary flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Contributors</h2>
            <span className="text-xs text-text-secondary">
              {totalCommits} total commit{totalCommits !== 1 ? "s" : ""}
            </span>
          </div>
          {contributors.length > 0 ? (
            <ContributorList contributors={contributors} owner={owner} repo={repo} defaultBranch={defaultBranch} />
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-text-secondary">No commit data available yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Contributor timeline */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-secondary">
          <h2 className="text-sm font-semibold text-text-primary">Contributor timeline</h2>
        </div>
        <div className="px-4 py-4">
          <ContributorTimeline data={chartData.contributorTimeline} />
        </div>
      </div>
    </div>
  );
}
