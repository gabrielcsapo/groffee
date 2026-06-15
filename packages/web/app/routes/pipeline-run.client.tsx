"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-flight-router/client";
import {
  getPipelineRunDetail,
  getStepLogs,
  cancelPipelineRun,
  dispatchPipeline,
  rerunFailedJobs,
  deleteArtifact,
  getRunHistoryForRef,
} from "../lib/server/pipelines";

interface LogCommand {
  severity: "error" | "warning" | "notice";
  message: string;
  file?: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  title?: string;
}

interface LogLine {
  ts: string | null;
  html: string;
  command?: LogCommand;
}

interface LogAnnotation {
  lineIndex: number;
  matchStart: number;
  matchEnd: number;
  filePath: string;
  line: number;
  column?: number;
}

interface Step {
  id: string;
  jobId: string;
  name: string;
  command: string | null;
  uses: string | null;
  status: string;
  exitCode: number | null;
  logPath: string | null;
  sortOrder: number;
  startedAt: string | null;
  finishedAt: string | null;
}

interface Job {
  id: string;
  name: string;
  baseName?: string;
  matrixValues?: Record<string, string | number | boolean> | null;
  status: string;
  sortOrder: number;
  startedAt: string | null;
  finishedAt: string | null;
  steps: Step[];
  needs?: string[];
  image?: string;
}

interface Run {
  id: string;
  pipelineName: string;
  number: number;
  status: string;
  trigger: string;
  ref: string;
  commitOid: string;
  triggeredBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
}

interface Artifact {
  id: string;
  runId: string;
  jobId: string;
  jobName: string | null;
  name: string;
  sizeBytes: number;
  retentionUntil: string | null;
  createdAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  queued:
    "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700/40",
  running:
    "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/40",
  success:
    "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/40",
  failure:
    "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/40",
  cancelled:
    "bg-gray-100 text-gray-800 border border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700/40",
  skipped:
    "bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-900/30 dark:text-gray-500 dark:border-gray-700/40",
  timed_out:
    "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700/40",
};

const STATUS_ICONS: Record<string, string> = {
  queued: "\u25CB",
  running: "\u25CE",
  success: "\u2713",
  failure: "\u2717",
  cancelled: "\u2298",
  skipped: "\u2192",
  timed_out: "\u23F1",
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.round((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline DAG visualization (GitHub Actions-style)
// ────────────────────────────────────────────────────────────────────────────

const NODE_WIDTH = 220;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 80;
const ROW_GAP = 16;
const PADDING = 16;

interface JobGroup {
  baseName: string;
  cells: Job[];
  // Aggregated status across cells (running > failure/timed_out > queued >
  // skipped > cancelled > success). The first matching status wins so a
  // single running cell makes the group "running".
  status: string;
  needs: string[];
  image?: string;
  sortOrder: number;
}

interface NodeLayout {
  group: JobGroup;
  col: number;
  row: number;
  x: number;
  y: number;
  height: number;
}

/**
 * Aggregate cell statuses for a matrix group.
 * Priority order matches what the user cares about: any cell still running
 * means "running"; any failure means "failure"; etc.
 */
function aggregateGroupStatus(cells: Job[]): string {
  if (cells.some((c) => c.status === "running")) return "running";
  if (cells.some((c) => c.status === "failure" || c.status === "timed_out")) return "failure";
  if (cells.some((c) => c.status === "cancelled")) return "cancelled";
  if (cells.some((c) => c.status === "queued")) return "queued";
  if (cells.every((c) => c.status === "skipped")) return "skipped";
  if (cells.every((c) => c.status === "success")) return "success";
  return cells[0]?.status || "queued";
}

function groupJobsByBaseName(jobs: Job[]): JobGroup[] {
  const map = new Map<string, JobGroup>();
  for (const job of jobs) {
    const key = job.baseName || job.name;
    let g = map.get(key);
    if (!g) {
      g = {
        baseName: key,
        cells: [],
        status: "queued",
        needs: job.needs || [],
        image: job.image,
        sortOrder: job.sortOrder,
      };
      map.set(key, g);
    }
    g.cells.push(job);
    if (job.sortOrder < g.sortOrder) g.sortOrder = job.sortOrder;
  }
  for (const g of map.values()) {
    g.status = aggregateGroupStatus(g.cells);
  }
  return Array.from(map.values());
}

function computeJobLayout(jobs: Job[]): {
  nodes: NodeLayout[];
  edges: Array<{ from: string; to: string }>;
  width: number;
  height: number;
} {
  const groups = groupJobsByBaseName(jobs);

  // Build base name → group map for quick lookup
  const byName = new Map<string, JobGroup>();
  groups.forEach((g) => byName.set(g.baseName, g));

  // Compute depth (column) for each group: depth = max(depth(needs)) + 1
  const depth = new Map<string, number>();
  function getDepth(group: JobGroup): number {
    if (depth.has(group.baseName)) return depth.get(group.baseName)!;
    if (!group.needs || group.needs.length === 0) {
      depth.set(group.baseName, 0);
      return 0;
    }
    const d =
      Math.max(
        ...group.needs.map((n) => {
          const dep = byName.get(n);
          return dep ? getDepth(dep) + 1 : 0;
        }),
      ) || 0;
    depth.set(group.baseName, d);
    return d;
  }
  groups.forEach(getDepth);

  // Group by column
  const columns = new Map<number, JobGroup[]>();
  groups.forEach((g) => {
    const c = depth.get(g.baseName) || 0;
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c)!.push(g);
  });
  columns.forEach((col) => col.sort((a, b) => a.sortOrder - b.sortOrder));

  // Lay out: matrix groups need extra height for their cell rows.
  // Each cell row is ~22px tall; we cap visible rows at 4 with overflow.
  const CELL_ROW = 18;
  function groupHeight(g: JobGroup): number {
    if (g.cells.length <= 1) return NODE_HEIGHT;
    const visible = Math.min(g.cells.length, 4);
    return NODE_HEIGHT + visible * CELL_ROW + 6;
  }

  const nodes: NodeLayout[] = [];
  let maxX = 0;
  let maxY = 0;
  columns.forEach((col, c) => {
    let yCursor = PADDING;
    col.forEach((group) => {
      const h = groupHeight(group);
      const x = PADDING + c * (NODE_WIDTH + COLUMN_GAP);
      nodes.push({ group, col: c, row: 0, x, y: yCursor, height: h });
      maxX = Math.max(maxX, x + NODE_WIDTH);
      maxY = Math.max(maxY, yCursor + h);
      yCursor += h + ROW_GAP;
    });
  });

  // Edges connect group → group (one edge per needs entry, regardless of
  // how many cells each side has).
  const edges: Array<{ from: string; to: string }> = [];
  groups.forEach((group) => {
    (group.needs || []).forEach((dep) => {
      const depGroup = byName.get(dep);
      if (depGroup) edges.push({ from: depGroup.baseName, to: group.baseName });
    });
  });

  return {
    nodes,
    edges,
    width: maxX + PADDING,
    height: maxY + PADDING,
  };
}

function formatMatrixCellShort(cell: Job): string {
  if (cell.matrixValues) {
    return Object.entries(cell.matrixValues)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
  }
  return cell.name;
}

function PipelineGraph({ jobs, onJobClick }: { jobs: Job[]; onJobClick: (jobId: string) => void }) {
  if (jobs.length === 0) return null;
  const { nodes, edges, width, height } = computeJobLayout(jobs);
  const nodeByName = new Map(nodes.map((n) => [n.group.baseName, n]));

  // Earliest startedAt + latest finishedAt across cells gives a sensible
  // "group duration" for the header.
  function groupDuration(cells: Job[]): string {
    const starts = cells.map((c) => c.startedAt).filter((s): s is string => !!s);
    const finishes = cells.map((c) => c.finishedAt).filter((s): s is string => !!s);
    if (starts.length === 0) return "-";
    const earliestStart = starts.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
    const latestFinish =
      finishes.length === cells.length && finishes.length > 0
        ? finishes.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        : null;
    return formatDuration(earliestStart, latestFinish);
  }

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width, height, minWidth: width }}>
        {/* SVG layer for connection lines */}
        <svg
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: "visible" }}
        >
          {edges.map((edge) => {
            const a = nodeByName.get(edge.from);
            const b = nodeByName.get(edge.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_WIDTH;
            const y1 = a.y + NODE_HEIGHT / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  fill="none"
                  className="text-border"
                />
                <circle cx={x1} cy={y1} r={3} className="fill-border" />
                <circle cx={x2} cy={y2} r={3} className="fill-border" />
              </g>
            );
          })}
        </svg>

        {/* Group cards (single job or matrix) */}
        {nodes.map((n) => {
          const isMatrix = n.group.cells.length > 1;
          const headerCell = n.group.cells[0];
          const visibleCells = n.group.cells.slice(0, 4);
          const overflow = n.group.cells.length - visibleCells.length;
          const onClickPrimary = () => onJobClick(headerCell.id);

          return (
            <div
              key={n.group.baseName}
              className={`absolute flex flex-col rounded-md border bg-surface-primary text-left overflow-hidden ${
                n.group.status === "running"
                  ? "border-blue-300 dark:border-blue-700"
                  : n.group.status === "failure" || n.group.status === "timed_out"
                    ? "border-red-300 dark:border-red-700"
                    : "border-border"
              }`}
              style={{
                left: n.x,
                top: n.y,
                width: NODE_WIDTH,
                height: n.height,
              }}
            >
              <button
                type="button"
                onClick={onClickPrimary}
                className="flex items-center gap-2.5 px-3 hover:bg-surface-secondary text-left"
                style={{ height: NODE_HEIGHT }}
              >
                <JobStatusIcon status={n.group.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {n.group.baseName}
                    {isMatrix && (
                      <span className="text-text-tertiary ml-1">×{n.group.cells.length}</span>
                    )}
                  </div>
                  {n.group.image && (
                    <div className="text-[10px] text-text-tertiary font-mono truncate">
                      {n.group.image}
                    </div>
                  )}
                </div>
                <div className="text-xs text-text-secondary tabular-nums">
                  {groupDuration(n.group.cells)}
                </div>
              </button>
              {isMatrix && (
                <div className="border-t border-border bg-surface-secondary/40 text-[11px] flex-1 overflow-hidden">
                  {visibleCells.map((cell) => (
                    <button
                      key={cell.id}
                      type="button"
                      onClick={() => onJobClick(cell.id)}
                      className="w-full flex items-center gap-1.5 px-3 py-0.5 hover:bg-white/5 text-left"
                    >
                      <span className="flex-shrink-0 inline-flex items-center w-3">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            cell.status === "success"
                              ? "bg-green-500"
                              : cell.status === "failure" || cell.status === "timed_out"
                                ? "bg-red-500"
                                : cell.status === "running"
                                  ? "bg-blue-500 animate-pulse"
                                  : cell.status === "cancelled"
                                    ? "bg-gray-400"
                                    : cell.status === "skipped"
                                      ? "bg-gray-300"
                                      : "bg-border"
                          }`}
                        />
                      </span>
                      <span className="flex-1 min-w-0 truncate font-mono text-text-secondary">
                        {formatMatrixCellShort(cell)}
                      </span>
                      <span className="text-text-tertiary tabular-nums">
                        {formatDuration(cell.startedAt, cell.finishedAt)}
                      </span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <div className="px-3 py-0.5 text-text-tertiary">+{overflow} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline timeline (Gantt-style)
// ────────────────────────────────────────────────────────────────────────────
//
// Each job becomes a horizontal lane: name on the left, a bar positioned by
// startedAt and sized by duration. This is the only place that reveals
// parallelism at a glance — the DAG shows topology, the cards below show
// per-job detail, but neither answers "did these two jobs actually run in
// parallel, or did one block the other?" The timeline does.
//
// Critical path is implicit: the rightmost-ending bar is what determined
// total run time. Bars that finish early but block downstream jobs (e.g. a
// fast lint job whose dependents are slow) are immediately visible as
// "tail" gaps between bars.

interface TimelineLane {
  job: Job;
  startMs: number;
  endMs: number;
}

/** Format an offset-from-zero relative time as `0s`, `42s`, `1m 30s`, `12m`. */
function formatOffset(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (s % 60 === 0 || m >= 10) return `${m}m`;
  return `${m}m ${s % 60}s`;
}

/** Pick a sensible tick interval (in ms) so we land 4–8 ticks across the axis. */
function pickTickInterval(totalMs: number): number {
  const target = totalMs / 6;
  const candidates = [
    1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000,
    3_600_000,
  ];
  for (const c of candidates) {
    if (c >= target) return c;
  }
  return candidates[candidates.length - 1];
}

function PipelineTimeline({
  jobs,
  runStartedAt,
  runFinishedAt,
  onJobClick,
}: {
  jobs: Job[];
  runStartedAt: string | null;
  runFinishedAt: string | null;
  onJobClick: (jobId: string) => void;
}) {
  // Need a wall-clock for in-progress runs. Re-tick once a second so the
  // running-bar's trailing edge advances live without slamming the parent
  // with re-renders from a faster timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (runFinishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runFinishedAt]);

  const lanes: TimelineLane[] = jobs
    .filter((j) => j.startedAt)
    .map((j) => ({
      job: j,
      startMs: new Date(j.startedAt!).getTime(),
      endMs: j.finishedAt ? new Date(j.finishedAt).getTime() : now,
    }))
    // Order by start time so the visual reads top-to-bottom = earlier-to-later.
    .sort((a, b) => a.startMs - b.startMs);

  if (lanes.length === 0) return null;

  const runStart = runStartedAt
    ? new Date(runStartedAt).getTime()
    : Math.min(...lanes.map((l) => l.startMs));
  const runEnd = runFinishedAt
    ? new Date(runFinishedAt).getTime()
    : Math.max(now, ...lanes.map((l) => l.endMs));
  const totalMs = Math.max(1, runEnd - runStart);

  const tickInterval = pickTickInterval(totalMs);
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += tickInterval) ticks.push(t);

  // Lane label column is fixed width so bars line up cleanly across rows;
  // the bar track fills the rest. CSS grid handles the rest.
  return (
    <div className="text-xs">
      {/* Axis row */}
      <div className="flex">
        <div className="w-[140px] shrink-0" />
        <div className="relative h-5 flex-1 border-b border-border">
          {ticks.map((t) => {
            const left = (t / totalMs) * 100;
            return (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-border/60 text-text-tertiary"
                style={{ left: `${left}%` }}
              >
                <span className="absolute top-0 left-1 whitespace-nowrap font-mono text-[10px]">
                  {formatOffset(t)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lane rows */}
      {lanes.map((lane) => {
        const left = ((lane.startMs - runStart) / totalMs) * 100;
        const width = Math.max(0.5, ((lane.endMs - lane.startMs) / totalMs) * 100);
        const isRunning = lane.job.status === "running";
        const isFailure = lane.job.status === "failure" || lane.job.status === "timed_out";
        const isCancelled = lane.job.status === "cancelled" || lane.job.status === "skipped";
        const fillClass = isFailure
          ? "bg-red-500/80 hover:bg-red-500"
          : isRunning
            ? "bg-blue-500/80 hover:bg-blue-500"
            : isCancelled
              ? "bg-gray-400/70 hover:bg-gray-400"
              : "bg-green-500/80 hover:bg-green-500";
        const labelName = lane.job.baseName || lane.job.name;
        return (
          <button
            type="button"
            key={lane.job.id}
            onClick={() => onJobClick(lane.job.id)}
            className="w-full flex items-center text-left rounded hover:bg-surface-primary/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
            aria-label={`Jump to ${labelName}`}
          >
            <div className="w-[140px] shrink-0 flex items-center gap-2 py-1 pr-3 min-w-0">
              <JobStatusIcon status={lane.job.status} />
              <span className="text-xs text-text-primary truncate">{labelName}</span>
            </div>
            <div className="relative h-7 my-0.5 flex-1">
              {/* Track */}
              <div className="absolute inset-y-0 left-0 right-0 rounded bg-surface-primary/60 border border-border/40" />
              {/* Bar */}
              <div
                className={`absolute top-1 bottom-1 rounded-sm transition-colors ${fillClass} ${
                  isRunning ? "animate-pulse" : ""
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${labelName} — start ${formatOffset(lane.startMs - runStart)}, duration ${formatDuration(
                  lane.job.startedAt,
                  lane.job.finishedAt,
                )}`}
              >
                {width > 12 && (
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-white/95 tabular-nums truncate">
                    {formatDuration(lane.job.startedAt, lane.job.finishedAt)}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px]">
        &#x2713;
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-blue-500 bg-yellow-100 dark:bg-yellow-900/30">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      </span>
    );
  }
  if (status === "failure" || status === "timed_out") {
    return (
      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[11px]">
        &#x2717;
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-[11px]">
        &#x2298;
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 text-white text-[11px]">
        &#x2192;
      </span>
    );
  }
  // queued
  return (
    <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-border bg-surface-primary" />
  );
}

interface HistoryRun {
  id: string;
  number: number;
  status: string;
  commitOid: string;
  pipelineName: string;
  triggeredBy: string;
  createdAt: string | null;
}

/**
 * Pick the most-useful step to focus on first when the run page loads.
 * Priority: failure > running > last completed > first overall. This
 * matches what a user would mentally select if scanning the page — when
 * something failed, that's where you look; while it's running, that's
 * where you look; when it's done and successful, the tail is the summary.
 */
function pickInitialStep(jobs: Job[]): string | null {
  for (const job of jobs) {
    for (const step of job.steps) {
      if (step.status === "failure" || step.status === "timed_out") return step.id;
    }
  }
  for (const job of jobs) {
    for (const step of job.steps) {
      if (step.status === "running") return step.id;
    }
  }
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i];
    for (let j = job.steps.length - 1; j >= 0; j--) {
      if (job.steps[j].startedAt) return job.steps[j].id;
    }
  }
  return jobs[0]?.steps[0]?.id ?? null;
}

export function PipelineRunView({
  owner,
  repo,
  run: initialRun,
  jobs: initialJobs,
  artifacts: initialArtifacts,
  isOwner,
  historyInitial = [],
  historyNextCursor = null,
  historyHasMore = false,
}: {
  owner: string;
  repo: string;
  run: Run;
  jobs: Job[];
  artifacts: Artifact[];
  isOwner: boolean;
  historyInitial?: HistoryRun[];
  historyNextCursor?: string | null;
  historyHasMore?: boolean;
}) {
  const [run, setRun] = useState(initialRun);
  const [jobs, setJobs] = useState(initialJobs);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  // Selected step drives the right-side log pane in the master-detail
  // layout. On mount, pick the most-interesting step so the page lands
  // useful: first failure, else first running, else last completed step.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(() =>
    pickInitialStep(initialJobs),
  );
  // DAG + timeline strip collapses by default — they're navigation, not
  // primary content. Click to expand for the topology view. When open, a
  // single panel shows EITHER the graph OR the timeline — they're related
  // views, so we tab between them instead of stacking.
  const [dagOpen, setDagOpen] = useState(false);
  const [graphView, setGraphView] = useState<"graph" | "timeline">("graph");
  const [stepLogs, setStepLogs] = useState<Record<string, LogLine[]>>({});
  const [stepAnnotations, setStepAnnotations] = useState<Record<string, LogAnnotation[]>>({});
  const [stepCommitShas, setStepCommitShas] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rerunningFailed, setRerunningFailed] = useState(false);
  // Section is collapsible; default open if artifacts already exist on first
  // render. We don't auto-collapse later if the list empties.
  const [artifactsOpen, setArtifactsOpen] = useState(initialArtifacts.length > 0);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);

  // Auto-refresh while running
  useEffect(() => {
    if (run.status !== "queued" && run.status !== "running") return;
    const interval = setInterval(async () => {
      const data = await getPipelineRunDetail(owner, repo, run.number);
      if (data.run) setRun(data.run);
      if (data.jobs) setJobs(data.jobs);
      if (data.artifacts) setArtifacts(data.artifacts);
    }, 3000);
    return () => clearInterval(interval);
  }, [owner, repo, run.number, run.status]);

  const handleDeleteArtifact = async (artifactId: string) => {
    if (!confirm("Delete this artifact? This cannot be undone.")) return;
    setDeletingArtifactId(artifactId);
    const result = await deleteArtifact(owner, repo, artifactId);
    setDeletingArtifactId(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    setArtifacts((prev) => prev.filter((a) => a.id !== artifactId));
  };

  /** Lazy-load logs for a step (called by selection + initial mount). */
  const loadStepLogs = async (step: Step) => {
    if (stepLogs[step.id] || !step.logPath) return;
    const data = await getStepLogs(owner, repo, run.number, step.id);
    if (data.lines !== undefined) {
      setStepLogs((prev) => ({ ...prev, [step.id]: data.lines! }));
    }
    if (data.annotations !== undefined) {
      setStepAnnotations((prev) => ({ ...prev, [step.id]: data.annotations! }));
    }
    if (data.commitSha) {
      setStepCommitShas((prev) => ({ ...prev, [step.id]: data.commitSha! }));
    }
  };

  const selectStep = (step: Step) => {
    setSelectedStepId(step.id);
    void loadStepLogs(step);
  };

  // Load logs for the auto-selected step on first mount so the log pane
  // is populated immediately rather than waiting for the user to click.
  useEffect(() => {
    if (!selectedStepId) return;
    const step = jobs.flatMap((j) => j.steps).find((s) => s.id === selectedStepId);
    if (step) void loadStepLogs(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll logs for the currently-selected step while it's still running.
  // Only one step is in view at a time, so we poll exactly one — keeps
  // network traffic minimal during an active run.
  useEffect(() => {
    if (!selectedStepId) return;
    const step = jobs.flatMap((j) => j.steps).find((s) => s.id === selectedStepId);
    if (!step || step.status !== "running") return;
    const interval = setInterval(async () => {
      const data = await getStepLogs(owner, repo, run.number, step.id);
      if (data.lines !== undefined) {
        setStepLogs((prev) => ({ ...prev, [step.id]: data.lines! }));
      }
      if (data.annotations !== undefined) {
        setStepAnnotations((prev) => ({ ...prev, [step.id]: data.annotations! }));
      }
      if (data.commitSha) {
        setStepCommitShas((prev) => ({ ...prev, [step.id]: data.commitSha! }));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedStepId, jobs, owner, repo, run.number]);

  const handleCancel = async () => {
    setCancelling(true);
    setConfirmCancel(false);
    await cancelPipelineRun(owner, repo, run.number);
    setCancelling(false);
    // Refresh
    const data = await getPipelineRunDetail(owner, repo, run.number);
    if (data.run) setRun(data.run);
    if (data.jobs) setJobs(data.jobs);
  };

  const handleRetry = async () => {
    const result = await dispatchPipeline(owner, repo, run.ref, run.pipelineName);
    if (result.runIds && result.runIds.length > 0) {
      // Navigate to new run — for now just refresh
      window.location.href = `/${owner}/${repo}/pipelines`;
    }
  };

  const failedJobsCount = jobs.filter((j) =>
    ["failure", "timed_out", "cancelled"].includes(j.status),
  ).length;
  const isTerminal = !["queued", "running"].includes(run.status);
  const canRerunFailed = isTerminal && failedJobsCount > 0;

  const handleRerunFailed = async () => {
    setRerunningFailed(true);
    const result = await rerunFailedJobs(owner, repo, run.number);
    setRerunningFailed(false);
    if (result.runNumber) {
      window.location.href = `/${owner}/${repo}/pipelines/runs/${result.runNumber}`;
    } else if (result.error) {
      alert(result.error);
    }
  };

  const handleJobClick = (jobId: string) => {
    // In the master-detail layout the log pane is always visible, so the
    // DAG / timeline navigators don't need to scroll — they just select
    // the right step. Pick first failure within the job, else first step.
    const job = jobs.find((j) => j.id === jobId);
    const target = job?.steps.find((s) => s.status === "failure") || job?.steps[0];
    if (target) selectStep(target);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              to={`/${owner}/${repo}/pipelines`}
              className="text-text-secondary hover:text-text-primary text-sm"
            >
              Pipelines
            </Link>
            <span className="text-text-tertiary">/</span>
            <h2 className="text-xl font-semibold text-text-primary">
              {run.pipelineName} #{run.number}
            </h2>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status] || ""}`}
            >
              <span>{STATUS_ICONS[run.status] || ""}</span>
              {run.status}
            </span>
          </div>
          <div className="text-sm text-text-secondary">
            Triggered by <span className="font-medium">{run.triggeredBy}</span> via{" "}
            <span className="font-medium">{run.trigger}</span> on{" "}
            <span className="font-mono text-xs bg-surface-secondary px-1.5 py-0.5 rounded">
              {run.ref}
            </span>
            {" \u00B7 "}
            <span className="font-mono text-xs">{run.commitOid.slice(0, 7)}</span>
            {run.startedAt && (
              <>
                {" \u00B7 "}
                {formatDuration(run.startedAt, run.finishedAt)}
              </>
            )}
          </div>
        </div>
        {isOwner && (
          <div className="flex gap-2 items-start">
            {(run.status === "queued" || run.status === "running") && (
              <>
                {confirmCancel ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-red-300 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20">
                    <span className="text-xs text-red-700 dark:text-red-300">
                      Cancel this run? Steps in progress will be terminated.
                    </span>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {cancelling && (
                        <span
                          className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"
                          aria-hidden
                        />
                      )}
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancelling}
                      className="px-2 py-0.5 text-xs border border-border rounded hover:bg-surface-secondary disabled:opacity-50"
                    >
                      Keep running
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </>
            )}
            {canRerunFailed && (
              <button
                onClick={handleRerunFailed}
                disabled={rerunningFailed}
                title={`Rerun ${failedJobsCount} failed job(s)`}
                className="px-3 py-1.5 text-sm border border-border text-text-primary rounded-md hover:bg-surface-secondary disabled:opacity-50"
              >
                {rerunningFailed ? "Starting…" : `Rerun failed (${failedJobsCount})`}
              </button>
            )}
            {(run.status === "failure" ||
              run.status === "cancelled" ||
              run.status === "timed_out") && (
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 text-sm bg-action text-white rounded-md hover:bg-action-hover"
              >
                Retry
              </button>
            )}
            <a
              href={`/api/repos/${owner}/${repo}/pipelines/runs/${run.number}/log/download`}
              className="px-3 py-1.5 text-sm border border-border text-text-secondary rounded-md hover:bg-surface-secondary hover:no-underline"
            >
              Download all logs
            </a>
          </div>
        )}
      </div>

      {/* Collapsible Graph/Timeline strip. They're navigation, not primary
          content, so they don't get a fixed slot above the fold — pop the
          panel open and choose the view you want via the toggle. */}
      <div className="border border-border rounded-lg mb-4 overflow-hidden">
        <div className="flex items-stretch bg-surface-secondary">
          <button
            type="button"
            onClick={() => setDagOpen((o) => !o)}
            className="flex-1 flex items-center gap-2 px-4 py-2 hover:bg-surface-secondary/60 text-left"
          >
            <span className="text-xs w-4">{dagOpen ? "▼" : "▶"}</span>
            <span className="text-sm font-medium text-text-primary">
              {dagOpen ? (graphView === "graph" ? "Graph" : "Timeline") : "Graph & timeline"}
            </span>
            <span className="text-xs text-text-secondary ml-auto tabular-nums">
              {jobs.length} job{jobs.length === 1 ? "" : "s"}
              {run.startedAt ? ` · ${formatDuration(run.startedAt, run.finishedAt)}` : ""}
            </span>
          </button>
          {dagOpen && (
            <div className="flex items-center gap-1 px-2 border-l border-border" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={graphView === "graph"}
                aria-label="Graph view"
                title="Graph view"
                onClick={() => setGraphView("graph")}
                className={`p-1.5 rounded-md transition-colors ${
                  graphView === "graph"
                    ? "bg-surface text-text-primary border border-border"
                    : "text-text-secondary hover:text-text-primary border border-transparent"
                }`}
              >
                {/* DAG-ish: three nodes connected by edges, mirroring the
                    actual graph view's left-to-right topology layout. */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="3" cy="4" r="1.8" />
                  <circle cx="3" cy="12" r="1.8" />
                  <circle cx="13" cy="8" r="1.8" />
                  <path d="M4.5 4.7 L11.4 7.5" strokeLinecap="round" />
                  <path d="M4.5 11.3 L11.4 8.5" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={graphView === "timeline"}
                aria-label="Timeline view"
                title="Timeline view"
                onClick={() => setGraphView("timeline")}
                className={`p-1.5 rounded-md transition-colors ${
                  graphView === "timeline"
                    ? "bg-surface text-text-primary border border-border"
                    : "text-text-secondary hover:text-text-primary border border-transparent"
                }`}
              >
                {/* Gantt-ish: three horizontal bars of varying length and
                    offset, echoing the actual timeline lanes. */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="2" y="3" width="7" height="2" rx="0.5" />
                  <rect x="2" y="7" width="11" height="2" rx="0.5" />
                  <rect x="5" y="11" width="6" height="2" rx="0.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {dagOpen && (
          <div className="border-t border-border bg-surface-secondary/30 p-3">
            {graphView === "graph" ? (
              <PipelineGraph jobs={jobs} onJobClick={handleJobClick} />
            ) : (
              <PipelineTimeline
                jobs={jobs}
                runStartedAt={run.startedAt}
                runFinishedAt={run.finishedAt}
                onJobClick={handleJobClick}
              />
            )}
          </div>
        )}
      </div>

      {/* Master-detail: steps tree on the left, log pane on the right.
          The right pane is the primary surface — logs occupy the bulk of
          the viewport. Click a step in the left rail to swap content. */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 mb-4">
        <StepRail jobs={jobs} selectedStepId={selectedStepId} onSelectStep={selectStep} />
        <LogPane
          jobs={jobs}
          selectedStepId={selectedStepId}
          run={run}
          owner={owner}
          repo={repo}
          stepLogs={stepLogs}
          stepAnnotations={stepAnnotations}
          stepCommitShas={stepCommitShas}
        />
      </div>

      {/* Artifacts (below the master-detail row) */}
      {artifacts.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setArtifactsOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-surface-secondary hover:bg-surface-secondary/80 text-left"
          >
            <span className="text-xs w-4">{artifactsOpen ? "▼" : "▶"}</span>
            <span className="font-medium text-sm text-text-primary">
              Artifacts ({artifacts.length})
            </span>
          </button>
          {artifactsOpen && (
            <div>
              {artifacts.map((artifact, idx) => {
                const job = jobs.find((j) => j.id === artifact.jobId);
                const expired = artifact.retentionUntil
                  ? new Date(artifact.retentionUntil).getTime() < Date.now()
                  : false;
                return (
                  <div
                    key={artifact.id}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                      idx > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <svg
                        className="w-4 h-4 text-text-secondary flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      </svg>
                      <span className="text-sm text-text-primary truncate">{artifact.name}</span>
                      {(artifact.jobName || job?.name) && (
                        <button
                          type="button"
                          onClick={() => handleJobClick(artifact.jobId)}
                          className="text-xs text-text-secondary hover:text-text-primary underline-offset-2 hover:underline whitespace-nowrap"
                          title="Jump to producing job"
                        >
                          from {artifact.jobName || job?.name}
                        </button>
                      )}
                      <span className="text-xs text-text-secondary tabular-nums whitespace-nowrap">
                        {formatBytes(artifact.sizeBytes)}
                      </span>
                      {artifact.retentionUntil && (
                        <span
                          className={`text-xs whitespace-nowrap ${
                            expired ? "text-red-600" : "text-text-tertiary"
                          }`}
                          title={`Retention until ${artifact.retentionUntil}`}
                        >
                          {expired
                            ? "expired"
                            : `expires ${new Date(artifact.retentionUntil).toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={`/api/repos/${owner}/${repo}/pipelines/artifacts/${artifact.id}/download`}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-surface-secondary hover:no-underline text-text-primary"
                      >
                        Download
                      </a>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDeleteArtifact(artifact.id)}
                          disabled={deletingArtifactId === artifact.id}
                          className="px-2 py-1 text-xs border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          {deletingArtifactId === artifact.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History \u2014 moved below the main content so the log pane keeps
          full width of the screen. */}
      <RunHistorySidebar
        owner={owner}
        repo={repo}
        ref={run.ref}
        excludeRunId={run.id}
        initialRuns={historyInitial}
        initialNextCursor={historyNextCursor}
        initialHasMore={historyHasMore}
      />
    </div>
  );
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// StepRail \u2014 left-column job/step tree. Each step is clickable; the active
// step gets an accent border + tinted background.
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function StepRail({
  jobs,
  selectedStepId,
  onSelectStep,
}: {
  jobs: Job[];
  selectedStepId: string | null;
  onSelectStep: (step: Step) => void;
}) {
  return (
    <aside className="border border-border rounded-lg overflow-hidden bg-surface self-start">
      {jobs.map((job, i) => (
        <div key={job.id} className={i > 0 ? "border-t border-border" : ""}>
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary text-xs">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium font-mono ${STATUS_COLORS[job.status] || ""}`}
            >
              <span>{STATUS_ICONS[job.status] || ""}</span>
              {job.status}
            </span>
            <span className="font-medium text-text-primary truncate">{job.name}</span>
            <span className="ml-auto text-text-tertiary tabular-nums">
              {formatDuration(job.startedAt, job.finishedAt)}
            </span>
          </div>
          {job.steps.map((step) => {
            const selected = step.id === selectedStepId;
            const stepColor =
              step.status === "success"
                ? "text-green-600"
                : step.status === "failure" || step.status === "timed_out"
                  ? "text-red-600"
                  : step.status === "running"
                    ? "text-blue-600 animate-pulse"
                    : "text-text-tertiary";
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step)}
                className={`w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-left text-sm transition-colors border-l-2 ${
                  selected
                    ? "bg-accent/10 border-accent text-text-primary"
                    : "border-transparent hover:bg-surface-secondary/50 text-text-primary"
                }`}
              >
                <span className={`inline-flex w-4 justify-center text-xs ${stepColor}`}>
                  {STATUS_ICONS[step.status] || "\u00B7"}
                </span>
                <span className="flex-1 truncate">{step.name}</span>
                <span className="text-[11px] text-text-tertiary tabular-nums">
                  {formatDuration(step.startedAt, step.finishedAt)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// LogPane \u2014 right column showing the selected step's logs with a sticky
// step-context header (status pill, job name, command line, duration).
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function LogPane({
  jobs,
  selectedStepId,
  run,
  owner,
  repo,
  stepLogs,
  stepAnnotations,
  stepCommitShas,
}: {
  jobs: Job[];
  selectedStepId: string | null;
  run: Run;
  owner: string;
  repo: string;
  stepLogs: Record<string, LogLine[]>;
  stepAnnotations: Record<string, LogAnnotation[]>;
  stepCommitShas: Record<string, string>;
}) {
  const step = selectedStepId
    ? jobs.flatMap((j) => j.steps).find((s) => s.id === selectedStepId)
    : undefined;
  const parentJob = step ? jobs.find((j) => j.steps.some((s) => s.id === step.id)) : undefined;

  return (
    <section className="border border-border rounded-lg overflow-hidden bg-surface flex flex-col self-start w-full">
      {!step || !parentJob ? (
        <div className="flex items-center justify-center text-sm text-text-tertiary p-8 min-h-[160px]">
          Select a step on the left to view its logs.
        </div>
      ) : (
        <>
          {/* Sticky step header \u2014 status, name, parent job, command. Stays
              put when the log body scrolls so context is never lost. */}
          <div className="border-b border-border bg-surface-secondary px-4 py-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${STATUS_COLORS[step.status] || ""}`}
              >
                <span>{STATUS_ICONS[step.status] || ""}</span>
                {step.status}
              </span>
              <span className="text-sm font-medium text-text-primary">{step.name}</span>
              <span className="text-xs text-text-tertiary">
                in <span className="text-text-secondary">{parentJob.name}</span>
              </span>
              <span className="ml-auto text-xs text-text-secondary tabular-nums">
                {formatDuration(step.startedAt, step.finishedAt)}
              </span>
            </div>
            {step.command && (
              <div className="mt-1.5 font-mono text-xs text-text-secondary truncate">
                <span className="text-text-tertiary">$ </span>
                {step.command}
              </div>
            )}
            {step.uses && (
              <div className="mt-1.5 text-xs text-text-secondary">
                uses{" "}
                <code className="font-mono bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded">
                  {step.uses}
                </code>
              </div>
            )}
          </div>
          <div>
            <StepLogViewer
              step={step}
              runNumber={run.number}
              owner={owner}
              repo={repo}
              lines={stepLogs[step.id]}
              annotations={stepAnnotations[step.id]}
              commitSha={stepCommitShas[step.id] || run.commitOid}
              fillHeight
            />
          </div>
        </>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RunHistorySidebar — last ~15 runs on the same ref, "Load more" paginated
// ────────────────────────────────────────────────────────────────────────────

function RunHistorySidebar({
  owner,
  repo,
  ref,
  excludeRunId,
  initialRuns,
  initialNextCursor,
  initialHasMore,
}: {
  owner: string;
  repo: string;
  ref: string;
  excludeRunId: string;
  initialRuns: HistoryRun[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
}) {
  const [runs, setRuns] = useState<HistoryRun[]>(initialRuns);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await getRunHistoryForRef(owner, repo, ref, excludeRunId, {
      cursor: nextCursor,
      limit: 15,
    });
    setLoadingMore(false);
    if (!("runs" in data)) return;
    setRuns((prev) => [...prev, ...(data.runs as HistoryRun[])]);
    setNextCursor(data.nextCursor || null);
    setHasMore(data.hasMore ?? false);
  }

  // Empty-state hint: if there are NO other runs on this branch, show a small
  // explainer so the empty panel doesn't look like a bug.
  if (runs.length === 0) {
    return (
      <aside className="border border-border rounded-lg p-3 bg-surface-secondary text-xs text-text-tertiary self-start">
        <div className="font-medium text-text-secondary mb-1">History</div>
        No other runs on <code className="font-mono text-text-secondary">{ref}</code> yet.
      </aside>
    );
  }

  return (
    <aside className="border border-border rounded-lg overflow-hidden bg-surface-secondary self-start">
      <div className="px-3 py-2 border-b border-border bg-surface-secondary/50">
        <div className="text-xs font-medium text-text-primary">History on this branch</div>
        <div className="text-[11px] text-text-tertiary truncate font-mono">{ref}</div>
      </div>
      <div className="divide-y divide-border">
        {runs.map((r) => (
          <Link
            key={r.id}
            to={`/${owner}/${repo}/pipelines/runs/${r.number}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-surface-primary hover:no-underline"
          >
            <span
              className={`flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                r.status === "success"
                  ? "bg-green-500 text-white"
                  : r.status === "failure" || r.status === "timed_out"
                    ? "bg-red-500 text-white"
                    : r.status === "running"
                      ? "border-2 border-blue-500"
                      : r.status === "cancelled"
                        ? "bg-gray-400 text-white"
                        : "border-2 border-border"
              }`}
            >
              {r.status === "success"
                ? "✓"
                : r.status === "failure" || r.status === "timed_out"
                  ? "✗"
                  : r.status === "cancelled"
                    ? "⊘"
                    : ""}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary">
                #{r.number}{" "}
                <span className="font-mono text-text-tertiary">{r.commitOid.slice(0, 7)}</span>
              </div>
              <div className="text-[11px] text-text-tertiary truncate">
                {r.createdAt ? formatTimeAgo(r.createdAt) : ""}
                {" · "}
                {r.triggeredBy}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <div className="border-t border-border p-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </aside>
  );
}

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return date.toLocaleDateString();
}

// ────────────────────────────────────────────────────────────────────────────
// StepLogViewer — search box, prev/next match, download, ANSI rendering
// ────────────────────────────────────────────────────────────────────────────

/**
 * Render a single line's HTML, optionally injecting `<a>` tags around any
 * `file:line` patterns the server identified as resolvable annotations.
 *
 * The trick: the server's HTML uses ANSI `<span>` markup, but the
 * annotation offsets reference the PLAIN text. We walk the HTML char by
 * char, tracking plain-text offset, and splice `<a>` open/close at the
 * right boundaries. Any tags in the way (ANSI spans) are still re-emitted
 * verbatim, so colored output is preserved.
 *
 * Both the plain-text indexing and the link insertion treat HTML entities
 * like `&lt;` as a single plain character so offsets line up with what the
 * server's `htmlToPlain` produced.
 */
function renderLineWithAnnotations(
  html: string,
  anns: LogAnnotation[],
  owner: string,
  repo: string,
  commitSha: string,
): string {
  if (!anns || anns.length === 0) return html;
  // Sort by matchStart asc; we'll merge overlapping (same span — shouldn't
  // happen but be defensive) by skipping any that don't advance past the
  // previous endpoint.
  const sorted = [...anns].sort((a, b) => a.matchStart - b.matchStart);
  let plainPos = 0;
  let i = 0;
  let nextAnn = 0;
  let out = "";
  let openAnnEnd = -1; // plain-text position where current <a> closes

  while (i < html.length) {
    if (html[i] === "<") {
      // Pass through tag verbatim — it doesn't contribute to plain offset.
      const close = html.indexOf(">", i);
      if (close === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      // Treat the entity as one plain char IF it's a known short entity
      // (the only ones our escapeHtml emits). Else fall through as literal.
      if (semi !== -1 && semi - i <= 6) {
        // Open annotation if needed
        if (
          nextAnn < sorted.length &&
          plainPos === sorted[nextAnn].matchStart &&
          openAnnEnd === -1 &&
          plainPos >= openAnnEnd
        ) {
          const a = sorted[nextAnn];
          out += linkOpenTag(a, owner, repo, commitSha);
          openAnnEnd = a.matchEnd;
        }
        out += html.slice(i, semi + 1);
        plainPos += 1;
        i = semi + 1;
        if (openAnnEnd !== -1 && plainPos >= openAnnEnd) {
          out += "</a>";
          openAnnEnd = -1;
          nextAnn++;
        }
        continue;
      }
    }

    // Open annotation if this is the start position
    if (nextAnn < sorted.length && plainPos === sorted[nextAnn].matchStart && openAnnEnd === -1) {
      const a = sorted[nextAnn];
      out += linkOpenTag(a, owner, repo, commitSha);
      openAnnEnd = a.matchEnd;
    }

    out += html[i];
    plainPos += 1;
    i += 1;

    if (openAnnEnd !== -1 && plainPos >= openAnnEnd) {
      out += "</a>";
      openAnnEnd = -1;
      nextAnn++;
    }
  }

  if (openAnnEnd !== -1) out += "</a>";
  return out;
}

function linkOpenTag(ann: LogAnnotation, owner: string, repo: string, commitSha: string): string {
  // Encode each path segment so spaces / # / ? in filenames stay intact.
  const encodedPath = ann.filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const href = `/${owner}/${repo}/blob/${commitSha}/${encodedPath}#L${ann.line}`;
  return `<a href="${href}" class="text-blue-400 underline-offset-2 hover:underline">`;
}

function StepLogViewer({
  step,
  runNumber,
  owner,
  repo,
  lines,
  annotations,
  commitSha,
  fillHeight = false,
}: {
  step: Step;
  runNumber: number;
  owner: string;
  repo: string;
  lines: LogLine[] | undefined;
  annotations?: LogAnnotation[];
  commitSha: string;
  /** When true, the log body fills its parent's height instead of capping
   * at 480px. Used by the master-detail layout where the parent already
   * sets the height. */
  fillHeight?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute filtered + matched line indices (case-insensitive substring on
  // the rendered HTML, which is fine because we don't allow tag names that
  // collide with common search terms — only `<span class="ansi-...">` and
  // text content, with HTML-escaped angle brackets).
  const { visibleLines, matchedLineIndices } = useMemo(() => {
    if (!lines) return { visibleLines: [], matchedLineIndices: [] as number[] };
    if (!filter) {
      return {
        visibleLines: lines.map((l, i) => ({ ...l, originalIndex: i, matched: false })),
        matchedLineIndices: [],
      };
    }
    const q = filter.toLowerCase();
    // Strip HTML tags for matching so we search the visible text, not the
    // span markup.
    const matchedIndices: number[] = [];
    const visible = lines
      .map((l, i) => {
        const text = l.html.replace(/<[^>]+>/g, "").toLowerCase();
        const matched = text.includes(q);
        if (matched) matchedIndices.push(i);
        return { ...l, originalIndex: i, matched };
      })
      .filter((l) => l.matched);
    return { visibleLines: visible, matchedLineIndices: matchedIndices };
  }, [lines, filter]);

  useEffect(() => {
    setMatchIndex(0);
  }, [filter]);

  function scrollToMatch(idx: number) {
    if (matchedLineIndices.length === 0) return;
    const safeIdx =
      ((idx % matchedLineIndices.length) + matchedLineIndices.length) % matchedLineIndices.length;
    setMatchIndex(safeIdx);
    const target = containerRef.current?.querySelector<HTMLElement>(
      `[data-line-index="${matchedLineIndices[safeIdx]}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const totalLines = lines?.length ?? 0;
  const matchCount = filter ? matchedLineIndices.length : 0;

  if (!lines) {
    return (
      <div className="border-t border-border bg-[#0d1117]">
        <div className="p-4 text-xs font-mono text-gray-400">
          {step.logPath ? "Loading logs..." : "No logs available"}
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="border-t border-border bg-[#0d1117]">
        <div className="p-4 text-xs font-mono text-gray-400">No output</div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-[#0d1117]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-black/40">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search in log…"
          className="flex-1 px-2 py-1 text-xs font-mono bg-black/60 border border-border/50 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {filter && (
          <>
            <span className="text-xs text-gray-400 tabular-nums">
              {matchCount === 0 ? "0/0" : `${matchIndex + 1}/${matchCount}`}
            </span>
            <button
              type="button"
              onClick={() => scrollToMatch(matchIndex - 1)}
              disabled={matchCount === 0}
              className="px-1.5 py-0.5 text-xs text-gray-300 hover:bg-white/10 rounded disabled:opacity-40"
              aria-label="Previous match"
            >
              {"↑"}
            </button>
            <button
              type="button"
              onClick={() => scrollToMatch(matchIndex + 1)}
              disabled={matchCount === 0}
              className="px-1.5 py-0.5 text-xs text-gray-300 hover:bg-white/10 rounded disabled:opacity-40"
              aria-label="Next match"
            >
              {"↓"}
            </button>
          </>
        )}
        <span className="text-xs text-gray-500 tabular-nums">
          {filter ? `${visibleLines.length}/${totalLines}` : `${totalLines}`} lines
        </span>
        <a
          href={`/api/repos/${owner}/${repo}/pipelines/runs/${runNumber}/jobs/${step.jobId}/steps/${step.id}/log/download`}
          className="px-2 py-0.5 text-xs text-gray-300 hover:bg-white/10 rounded hover:no-underline"
          title="Download log"
        >
          Download
        </a>
      </div>
      {/* Log body */}
      <div
        ref={containerRef}
        className={`font-mono text-xs text-gray-200 overflow-auto py-2 ${
          fillHeight ? "max-h-[calc(100vh-260px)]" : "max-h-[480px]"
        }`}
      >
        {visibleLines.map((line) => {
          // Look up annotations for this original line. Fast path: most
          // lines have none.
          const lineAnns = annotations?.filter((a) => a.lineIndex === line.originalIndex);
          const html =
            lineAnns && lineAnns.length > 0
              ? renderLineWithAnnotations(line.html, lineAnns, owner, repo, commitSha)
              : line.html;
          if (line.command) {
            const sev = line.command.severity;
            const wrapper =
              sev === "error"
                ? "bg-red-950/40 border-l-2 border-red-500 text-red-200"
                : sev === "warning"
                  ? "bg-yellow-950/30 border-l-2 border-yellow-500 text-yellow-100"
                  : "bg-blue-950/30 border-l-2 border-blue-500 text-blue-100";
            const label = sev[0].toUpperCase() + sev.slice(1);
            const locText =
              line.command.file && line.command.line
                ? `${line.command.file}:${line.command.line}${line.command.col ? `:${line.command.col}` : ""}`
                : line.command.file || null;
            return (
              <div
                key={line.originalIndex}
                data-line-index={line.originalIndex}
                className={`flex items-start px-3 py-1 my-0.5 ${wrapper}`}
              >
                <span className="text-gray-500 select-none w-10 text-right pr-2 tabular-nums">
                  {line.originalIndex + 1}
                </span>
                {line.ts && (
                  <span className="text-gray-500 select-none pr-2 tabular-nums" title={line.ts}>
                    {line.ts.slice(11, 23)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                    <span>{label}</span>
                    {locText && <span className="font-mono normal-case">{locText}</span>}
                    {line.command.title && (
                      <span className="font-normal normal-case opacity-90">
                        {line.command.title}
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs mt-0.5">
                    {line.command.message}
                  </pre>
                </div>
              </div>
            );
          }
          return (
            <div
              key={line.originalIndex}
              data-line-index={line.originalIndex}
              className="flex items-start hover:bg-white/5 px-3"
            >
              <span className="text-gray-600 select-none w-10 text-right pr-2 tabular-nums">
                {line.originalIndex + 1}
              </span>
              {line.ts && (
                <span className="text-gray-500 select-none pr-2 tabular-nums" title={line.ts}>
                  {line.ts.slice(11, 23)}
                </span>
              )}
              <span
                className="whitespace-pre-wrap break-all flex-1"
                // safe: server-side ansi-to-html escapes <,>,& and only emits
                // <span class="ansi-...">…</span> markup; annotation injection
                // adds <a href="…"> tags whose href is built from server-
                // verified repo paths (no user-controlled segments).
                dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
