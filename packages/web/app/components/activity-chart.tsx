"use client";

import { useState } from "react";
import { Link } from "react-router";

interface DayData {
  day: number;
  count: number;
}

interface CommitData {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
}

interface ActivityHeatmapProps {
  daily: DayData[];
  owner: string;
  repo: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getColor(count: number, max: number): string {
  if (count === 0) return "var(--color-surface-secondary)";
  const ratio = count / max;
  if (ratio <= 0.25) return "var(--heatmap-l1)";
  if (ratio <= 0.5) return "var(--heatmap-l2)";
  if (ratio <= 0.75) return "var(--heatmap-l3)";
  return "var(--heatmap-l4)";
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function CommitList({
  commits,
  owner,
  repo,
  label,
  onClose,
}: {
  commits: CommitData[];
  owner: string;
  repo: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface mt-4 animate-fade-in">
      <div className="px-4 py-3 border-b border-border bg-surface-secondary flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary text-xs px-2 py-1 rounded hover:bg-surface transition-colors"
        >
          Close
        </button>
      </div>
      {commits.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-secondary">No commits found.</div>
      ) : (
        <div className="divide-y divide-border">
          {commits.map((commit) => (
            <div key={commit.oid} className="px-4 py-2.5 flex items-start gap-3">
              <Link
                to={`/${owner}/${repo}/commit/${commit.oid}`}
                className="text-xs font-mono text-text-link hover:underline shrink-0 mt-0.5"
              >
                {commit.oid.slice(0, 7)}
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/${owner}/${repo}/commit/${commit.oid}`}
                  className="text-sm text-text-primary hover:text-text-link hover:underline block truncate"
                >
                  {commit.message.split("\n")[0]}
                </Link>
                <span className="text-xs text-text-secondary">
                  {commit.author.name} &middot; {timeAgo(commit.author.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivityHeatmap({ daily, owner, repo }: ActivityHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<{ date: Date; timestamp: number } | null>(null);
  const [commits, setCommits] = useState<CommitData[] | null>(null);
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Build a map of day timestamp -> count
  const dayMap = new Map<string, number>();
  for (const d of daily) {
    const date = new Date(d.day * 1000);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dayMap.set(key, (dayMap.get(key) || 0) + d.count);
  }

  const max = Math.max(1, ...daily.map((d) => d.count));

  // Generate 53 weeks x 7 days grid, ending at today
  const todayDay = today.getDay(); // 0=Sun
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (52 * 7 + todayDay));

  const weeks: { date: Date; count: number }[][] = [];
  const cursor = new Date(startDate);

  let currentWeek: { date: Date; count: number }[] = [];
  while (cursor <= endDate) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    currentWeek.push({ date: new Date(cursor), count: dayMap.get(key) || 0 });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // Month labels
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w][0];
    if (firstDay) {
      const month = firstDay.date.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ label: MONTHS[month], col: w });
        lastMonth = month;
      }
    }
  }

  const cellSize = 12;
  const cellGap = 2;
  const step = cellSize + cellGap;
  const labelWidth = 28;
  const headerHeight = 18;
  const svgWidth = labelWidth + weeks.length * step;
  const svgHeight = headerHeight + 7 * step;

  const totalCommits = daily.reduce((sum, d) => sum + d.count, 0);

  async function handleDayClick(date: Date, count: number) {
    if (count === 0) return;

    // Unix timestamp for start of day (UTC)
    const dayTimestamp = Math.floor(
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000,
    );

    // If clicking the same day, toggle off
    if (selectedDay && selectedDay.timestamp === dayTimestamp) {
      setSelectedDay(null);
      setCommits(null);
      return;
    }

    setSelectedDay({ date, timestamp: dayTimestamp });
    setLoading(true);
    setCommits(null);

    try {
      const res = await fetch(
        `/api/repos/${owner}/${repo}/activity/commits?day=${dayTimestamp}`,
      );
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits);
      }
    } catch {
      setCommits([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">
          {totalCommits} contribution{totalCommits !== 1 ? "s" : ""} in the last year
        </span>
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <span>Less</span>
          <svg width={62} height={12}>
            <rect width={10} height={10} x={0} y={1} rx={2} fill="var(--color-surface-secondary)" />
            <rect width={10} height={10} x={13} y={1} rx={2} fill="var(--heatmap-l1)" />
            <rect width={10} height={10} x={26} y={1} rx={2} fill="var(--heatmap-l2)" />
            <rect width={10} height={10} x={39} y={1} rx={2} fill="var(--heatmap-l3)" />
            <rect width={10} height={10} x={52} y={1} rx={2} fill="var(--heatmap-l4)" />
          </svg>
          <span>More</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="block">
          {/* Month labels */}
          {monthLabels.map((m) => (
            <text
              key={`${m.label}-${m.col}`}
              x={labelWidth + m.col * step}
              y={12}
              fontSize={10}
              fill="var(--color-text-secondary)"
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {[1, 3, 5].map((d) => (
            <text
              key={d}
              x={0}
              y={headerHeight + d * step + cellSize - 2}
              fontSize={10}
              fill="var(--color-text-secondary)"
            >
              {DAYS[d]}
            </text>
          ))}

          {/* Cells */}
          {weeks.map((week, w) =>
            week.map((day, d) => {
              const dayTs = Math.floor(
                new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()).getTime() / 1000,
              );
              const isSelected = selectedDay?.timestamp === dayTs;
              return (
                <g key={`${w}-${d}`}>
                  <rect
                    x={labelWidth + w * step}
                    y={headerHeight + d * step}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    fill={getColor(day.count, max)}
                    stroke={isSelected ? "var(--color-text-primary)" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                    style={{ cursor: day.count > 0 ? "pointer" : "default" }}
                    onClick={() => handleDayClick(day.date, day.count)}
                  >
                    <title>
                      {day.count} commit{day.count !== 1 ? "s" : ""} on{" "}
                      {day.date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </title>
                  </rect>
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {/* Drill-down for selected day */}
      {selectedDay && (
        loading ? (
          <div className="mt-4 p-6 text-center text-sm text-text-secondary border border-border rounded-lg bg-surface">
            Loading commits...
          </div>
        ) : commits ? (
          <CommitList
            commits={commits}
            owner={owner}
            repo={repo}
            label={`Commits on ${selectedDay.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
            onClose={() => { setSelectedDay(null); setCommits(null); }}
          />
        ) : null
      )}
    </div>
  );
}

interface ContributorData {
  name: string;
  email: string;
  commits: number;
  lastCommitAt: number;
}

interface ContributorListProps {
  contributors: ContributorData[];
  owner: string;
  repo: string;
}

export function ContributorList({ contributors, owner, repo }: ContributorListProps) {
  const maxCommits = Math.max(1, ...contributors.map((c) => c.commits));
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitData[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContributorClick(email: string) {
    if (selectedEmail === email) {
      setSelectedEmail(null);
      setCommits(null);
      return;
    }

    setSelectedEmail(email);
    setLoading(true);
    setCommits(null);

    try {
      const res = await fetch(
        `/api/repos/${owner}/${repo}/activity/commits?author=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits);
      }
    } catch {
      setCommits([]);
    } finally {
      setLoading(false);
    }
  }

  const selectedContributor = contributors.find((c) => c.email === selectedEmail);

  return (
    <div>
      <div className="flex flex-col gap-0">
        {contributors.map((contributor, i) => {
          const isSelected = selectedEmail === contributor.email;
          return (
            <button
              key={contributor.email}
              type="button"
              onClick={() => handleContributorClick(contributor.email)}
              className={`flex items-center gap-3 px-4 py-2.5 w-full text-left transition-colors hover:bg-surface-secondary ${
                i > 0 ? "border-t border-border" : ""
              } ${isSelected ? "bg-surface-secondary" : ""}`}
            >
              {/* Avatar placeholder */}
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {contributor.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {contributor.name}
                  </span>
                  <span className="text-xs text-text-secondary truncate">{contributor.email}</span>
                </div>
                {/* Bar */}
                <div className="mt-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(contributor.commits / maxCommits) * 100}%` }}
                  />
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-medium text-text-primary">
                  {contributor.commits}
                </span>
                <p className="text-xs text-text-secondary">{timeAgo(contributor.lastCommitAt)}</p>
              </div>

              {/* Expand indicator */}
              <svg
                className={`w-4 h-4 text-text-secondary shrink-0 transition-transform ${isSelected ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Drill-down for selected contributor */}
      {selectedEmail && (
        loading ? (
          <div className="p-6 text-center text-sm text-text-secondary border-t border-border">
            Loading commits...
          </div>
        ) : commits ? (
          <div className="border-t border-border">
            <CommitList
              commits={commits}
              owner={owner}
              repo={repo}
              label={`Recent commits by ${selectedContributor?.name || selectedEmail}`}
              onClose={() => { setSelectedEmail(null); setCommits(null); }}
            />
          </div>
        ) : null
      )}
    </div>
  );
}
