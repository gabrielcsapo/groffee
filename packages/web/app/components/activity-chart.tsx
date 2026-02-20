"use client";

import { useRef, useState } from "react";
import { Link } from "react-router";

interface DayData {
  day: number;
  commits: number;
  prs: number;
  issues: number;
}

interface CommitData {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
}

interface PRData {
  number: number;
  title: string;
  status: string;
  createdAt: number;
}

interface IssueData {
  number: number;
  title: string;
  status: string;
  createdAt: number;
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

function ActivityDrillDown({
  commits,
  pullRequests,
  issues,
  owner,
  repo,
  label,
  onClose,
}: {
  commits: CommitData[];
  pullRequests: PRData[];
  issues: IssueData[];
  owner: string;
  repo: string;
  label: string;
  onClose: () => void;
}) {
  const hasNothing = commits.length === 0 && pullRequests.length === 0 && issues.length === 0;

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
      {hasNothing ? (
        <div className="p-6 text-center text-sm text-text-secondary">No activity found.</div>
      ) : (
        <div>
          {/* Commits */}
          {commits.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-surface-secondary/50 border-b border-border">
                {commits.length} commit{commits.length !== 1 ? "s" : ""}
              </div>
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
            </div>
          )}

          {/* Pull Requests */}
          {pullRequests.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-surface-secondary/50 border-b border-border">
                {pullRequests.length} pull request{pullRequests.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y divide-border">
                {pullRequests.map((pr) => (
                  <div key={pr.number} className="px-4 py-2.5 flex items-start gap-3">
                    <Link
                      to={`/${owner}/${repo}/pulls/${pr.number}`}
                      className="text-xs font-mono text-text-link hover:underline shrink-0 mt-0.5"
                    >
                      #{pr.number}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/${owner}/${repo}/pulls/${pr.number}`}
                        className="text-sm text-text-primary hover:text-text-link hover:underline block truncate"
                      >
                        {pr.title}
                      </Link>
                      <span className="text-xs text-text-secondary">
                        {pr.status} &middot; {timeAgo(pr.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-text-secondary bg-surface-secondary/50 border-b border-border">
                {issues.length} issue{issues.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y divide-border">
                {issues.map((issue) => (
                  <div key={issue.number} className="px-4 py-2.5 flex items-start gap-3">
                    <Link
                      to={`/${owner}/${repo}/issues/${issue.number}`}
                      className="text-xs font-mono text-text-link hover:underline shrink-0 mt-0.5"
                    >
                      #{issue.number}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/${owner}/${repo}/issues/${issue.number}`}
                        className="text-sm text-text-primary hover:text-text-link hover:underline block truncate"
                      >
                        {issue.title}
                      </Link>
                      <span className="text-xs text-text-secondary">
                        {issue.status} &middot; {timeAgo(issue.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CellData {
  date: Date;
  total: number;
  commits: number;
  prs: number;
  issues: number;
  utcDays: number[];
}

export function ActivityHeatmap({ daily, owner, repo }: ActivityHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<{ date: Date; utcDays: number[] } | null>(null);
  const [commits, setCommits] = useState<CommitData[] | null>(null);
  const [pullRequests, setPullRequests] = useState<PRData[] | null>(null);
  const [issueList, setIssueList] = useState<IssueData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Build a map of local date key -> { total count, breakdown, originating UTC day timestamps }
  // This tracks which UTC day buckets map to each local date so we can query the right range
  const dayMap = new Map<string, { commits: number; prs: number; issues: number; utcDays: number[] }>();
  for (const d of daily) {
    const date = new Date(d.day * 1000);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = dayMap.get(key) || { commits: 0, prs: 0, issues: 0, utcDays: [] };
    existing.commits += d.commits;
    existing.prs += d.prs;
    existing.issues += d.issues;
    existing.utcDays.push(d.day);
    dayMap.set(key, existing);
  }

  const allTotals = Array.from(dayMap.values()).map((v) => v.commits + v.prs + v.issues);
  const max = Math.max(1, ...allTotals);

  // Generate 53 weeks x 7 days grid, ending at today
  const todayDay = today.getDay();
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (52 * 7 + todayDay));

  const weeks: CellData[][] = [];
  const cursor = new Date(startDate);

  let currentWeek: CellData[] = [];
  while (cursor <= endDate) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    const entry = dayMap.get(key);
    currentWeek.push({
      date: new Date(cursor),
      total: entry ? entry.commits + entry.prs + entry.issues : 0,
      commits: entry?.commits || 0,
      prs: entry?.prs || 0,
      issues: entry?.issues || 0,
      utcDays: entry?.utcDays || [],
    });
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

  const totalActivity = Array.from(dayMap.values()).reduce(
    (sum, v) => sum + v.commits + v.prs + v.issues,
    0,
  );

  async function handleDayClick(cell: CellData) {
    if (cell.total === 0) return;

    // Use the UTC day timestamps from the server data to query
    // This ensures the drill-down matches exactly what produced the green dot
    const clickKey = cell.utcDays.sort().join(",");
    const selectedKey = selectedDay?.utcDays.sort().join(",");

    if (selectedDay && selectedKey === clickKey) {
      setSelectedDay(null);
      setCommits(null);
      setPullRequests(null);
      setIssueList(null);
      return;
    }

    setSelectedDay({ date: cell.date, utcDays: cell.utcDays });
    setLoading(true);
    setCommits(null);
    setPullRequests(null);
    setIssueList(null);

    try {
      // Query using the UTC day start that the server used for grouping
      // If a local date spans two UTC days, query both
      const allCommits: CommitData[] = [];
      const allPRs: PRData[] = [];
      const allIssues: IssueData[] = [];

      for (const utcDay of cell.utcDays) {
        const res = await fetch(
          `/api/repos/${owner}/${repo}/activity/commits?day=${utcDay}`,
        );
        if (res.ok) {
          const data = await res.json();
          allCommits.push(...(data.commits || []));
          allPRs.push(...(data.pullRequests || []));
          allIssues.push(...(data.issues || []));
        }
      }

      // Deduplicate commits by oid (in case of overlapping UTC days)
      const seenOids = new Set<string>();
      const uniqueCommits = allCommits.filter((c) => {
        if (seenOids.has(c.oid)) return false;
        seenOids.add(c.oid);
        return true;
      });

      setCommits(uniqueCommits);
      setPullRequests(allPRs);
      setIssueList(allIssues);
    } catch {
      setCommits([]);
      setPullRequests([]);
      setIssueList([]);
    } finally {
      setLoading(false);
    }
  }

  function buildTooltip(cell: CellData): string {
    const dateStr = cell.date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (cell.total === 0) return `No activity on ${dateStr}`;

    const parts: string[] = [];
    if (cell.commits > 0) parts.push(`${cell.commits} commit${cell.commits !== 1 ? "s" : ""}`);
    if (cell.prs > 0) parts.push(`${cell.prs} PR${cell.prs !== 1 ? "s" : ""}`);
    if (cell.issues > 0) parts.push(`${cell.issues} issue${cell.issues !== 1 ? "s" : ""}`);
    return `${parts.join(", ")} on ${dateStr}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">
          {totalActivity} contribution{totalActivity !== 1 ? "s" : ""} in the last year
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
      <div ref={containerRef} className="relative">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block w-full h-auto"
          onMouseLeave={() => setTooltip(null)}
        >
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
            week.map((cell, d) => {
              const clickKey = cell.utcDays.sort().join(",");
              const selectedKey = selectedDay?.utcDays.sort().join(",");
              const isSelected = selectedDay != null && selectedKey === clickKey && clickKey !== "";
              return (
                <rect
                  key={`${w}-${d}`}
                  x={labelWidth + w * step}
                  y={headerHeight + d * step}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={getColor(cell.total, max)}
                  stroke={isSelected ? "var(--color-text-primary)" : "none"}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ cursor: cell.total > 0 ? "pointer" : "default" }}
                  onClick={() => handleDayClick(cell)}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    setTooltip({ text: buildTooltip(cell), x, y });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }),
          )}
        </svg>
        {tooltip && (
          <div
            className="absolute z-10 px-2.5 py-1.5 text-xs rounded-md bg-text-primary text-surface whitespace-nowrap pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Drill-down for selected day */}
      {selectedDay && (
        loading ? (
          <div className="mt-4 p-6 text-center text-sm text-text-secondary border border-border rounded-lg bg-surface">
            Loading activity...
          </div>
        ) : commits ? (
          <ActivityDrillDown
            commits={commits}
            pullRequests={pullRequests || []}
            issues={issueList || []}
            owner={owner}
            repo={repo}
            label={`Activity on ${selectedDay.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
            onClose={() => { setSelectedDay(null); setCommits(null); setPullRequests(null); setIssueList(null); }}
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
  defaultBranch: string;
}

export function ContributorList({ contributors, owner, repo, defaultBranch }: ContributorListProps) {
  const maxCommits = Math.max(1, ...contributors.map((c) => c.commits));

  return (
    <div className="flex flex-col gap-0">
      {contributors.map((contributor, i) => (
        <Link
          key={contributor.email}
          to={`/${owner}/${repo}/commits/${defaultBranch}?author=${encodeURIComponent(contributor.email)}`}
          className={`flex items-center gap-3 px-4 py-2.5 w-full text-left transition-colors hover:bg-surface-secondary hover:no-underline ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {contributor.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">{contributor.name}</span>
              <span className="text-xs text-text-secondary truncate">{contributor.email}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(contributor.commits / maxCommits) * 100}%` }} />
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-sm font-medium text-text-primary">{contributor.commits}</span>
            <p className="text-xs text-text-secondary">{timeAgo(contributor.lastCommitAt)}</p>
          </div>

          <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
