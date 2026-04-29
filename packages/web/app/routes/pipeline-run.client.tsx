"use client";

import { useState, useEffect } from "react";
import { Link } from "react-flight-router/client";
import {
  getPipelineRunDetail,
  getStepLogs,
  cancelPipelineRun,
  dispatchPipeline,
} from "../lib/server/pipelines";

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
  name: string;
  sizeBytes: number;
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failure: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  skipped: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  timed_out: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
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

interface NodeLayout {
  job: Job;
  col: number;
  row: number;
  x: number;
  y: number;
}

function computeJobLayout(jobs: Job[]): {
  nodes: NodeLayout[];
  edges: Array<{ from: string; to: string }>;
  width: number;
  height: number;
} {
  // Build name → job map for quick lookup
  const byName = new Map<string, Job>();
  jobs.forEach((j) => byName.set(j.name, j));

  // Compute depth (column) for each job: depth = max(depth(needs)) + 1, or 0 if no needs
  const depth = new Map<string, number>();
  function getDepth(job: Job): number {
    if (depth.has(job.name)) return depth.get(job.name)!;
    if (!job.needs || job.needs.length === 0) {
      depth.set(job.name, 0);
      return 0;
    }
    const d =
      Math.max(
        ...job.needs.map((n) => {
          const dep = byName.get(n);
          return dep ? getDepth(dep) + 1 : 0;
        }),
      ) || 0;
    depth.set(job.name, d);
    return d;
  }
  jobs.forEach(getDepth);

  // Group by column
  const columns = new Map<number, Job[]>();
  jobs.forEach((j) => {
    const c = depth.get(j.name) || 0;
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c)!.push(j);
  });
  // Stable order within column
  columns.forEach((col) => col.sort((a, b) => a.sortOrder - b.sortOrder));

  const maxCol = Math.max(0, ...Array.from(columns.keys()));
  const maxRow = Math.max(0, ...Array.from(columns.values()).map((c) => c.length - 1));

  const nodes: NodeLayout[] = [];
  columns.forEach((col, c) => {
    col.forEach((job, r) => {
      nodes.push({
        job,
        col: c,
        row: r,
        x: PADDING + c * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + r * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const edges: Array<{ from: string; to: string }> = [];
  jobs.forEach((job) => {
    (job.needs || []).forEach((dep) => {
      const depJob = byName.get(dep);
      if (depJob) edges.push({ from: depJob.id, to: job.id });
    });
  });

  return {
    nodes,
    edges,
    width: PADDING * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * COLUMN_GAP,
    height: PADDING * 2 + (maxRow + 1) * NODE_HEIGHT + maxRow * ROW_GAP,
  };
}

function PipelineGraph({
  jobs,
  onJobClick,
  pipelineName,
  trigger,
}: {
  jobs: Job[];
  onJobClick: (jobId: string) => void;
  pipelineName: string;
  trigger: string;
}) {
  if (jobs.length === 0) return null;
  const { nodes, edges, width, height } = computeJobLayout(jobs);
  const nodeById = new Map(nodes.map((n) => [n.job.id, n]));

  return (
    <div className="border border-border rounded-lg bg-surface-secondary p-4 mb-6 overflow-x-auto">
      <div className="mb-3">
        <div className="text-sm font-semibold text-text-primary">{pipelineName}</div>
        <div className="text-xs text-text-tertiary">on: {trigger}</div>
      </div>
      <div className="relative" style={{ width, height, minWidth: width }}>
        {/* SVG layer for connection lines */}
        <svg
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: "visible" }}
        >
          {edges.map((edge) => {
            const a = nodeById.get(edge.from);
            const b = nodeById.get(edge.to);
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

        {/* Job node cards */}
        {nodes.map((n) => (
          <button
            key={n.job.id}
            onClick={() => onJobClick(n.job.id)}
            className={`absolute flex items-center gap-2.5 px-3 rounded-md border bg-surface-primary hover:shadow-sm transition-shadow text-left ${
              n.job.status === "running"
                ? "border-blue-300 dark:border-blue-700"
                : n.job.status === "failure" || n.job.status === "timed_out"
                  ? "border-red-300 dark:border-red-700"
                  : n.job.status === "success"
                    ? "border-border"
                    : "border-border"
            }`}
            style={{
              left: n.x,
              top: n.y,
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
            }}
          >
            <JobStatusIcon status={n.job.status} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{n.job.name}</div>
              {n.job.image && (
                <div className="text-[10px] text-text-tertiary font-mono truncate">
                  {n.job.image}
                </div>
              )}
            </div>
            <div className="text-xs text-text-secondary tabular-nums">
              {formatDuration(n.job.startedAt, n.job.finishedAt)}
            </div>
          </button>
        ))}
      </div>
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

export function PipelineRunView({
  owner,
  repo,
  run: initialRun,
  jobs: initialJobs,
  artifacts,
  isOwner,
}: {
  owner: string;
  repo: string;
  run: Run;
  jobs: Job[];
  artifacts: Artifact[];
  isOwner: boolean;
}) {
  const [run, setRun] = useState(initialRun);
  const [jobs, setJobs] = useState(initialJobs);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [stepLogs, setStepLogs] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);

  // Auto-refresh while running
  useEffect(() => {
    if (run.status !== "queued" && run.status !== "running") return;
    const interval = setInterval(async () => {
      const data = await getPipelineRunDetail(owner, repo, run.number);
      if (data.run) setRun(data.run);
      if (data.jobs) setJobs(data.jobs);
    }, 3000);
    return () => clearInterval(interval);
  }, [owner, repo, run.number, run.status]);

  const toggleStep = async (step: Step) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(step.id)) {
      newExpanded.delete(step.id);
    } else {
      newExpanded.add(step.id);
      // Load logs if not cached
      if (!stepLogs[step.id] && step.logPath) {
        const data = await getStepLogs(owner, repo, run.number, step.id);
        if (data.logs !== undefined) {
          setStepLogs((prev) => ({ ...prev, [step.id]: data.logs! }));
        }
      }
    }
    setExpandedSteps(newExpanded);
  };

  // Poll logs for running steps
  useEffect(() => {
    const runningSteps = jobs
      .flatMap((j) => j.steps)
      .filter((s) => s.status === "running" && expandedSteps.has(s.id));
    if (runningSteps.length === 0) return;
    const interval = setInterval(async () => {
      for (const step of runningSteps) {
        const data = await getStepLogs(owner, repo, run.number, step.id);
        if (data.logs !== undefined) {
          setStepLogs((prev) => ({ ...prev, [step.id]: data.logs! }));
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobs, expandedSteps, owner, repo, run.number]);

  const handleCancel = async () => {
    setCancelling(true);
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

  const handleJobClick = (jobId: string) => {
    // Scroll the matching job card into view; expand its first step's logs
    const el = document.getElementById(`job-${jobId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const job = jobs.find((j) => j.id === jobId);
      const firstFailedOrFirst = job?.steps.find((s) => s.status === "failure") || job?.steps[0];
      if (firstFailedOrFirst && !expandedSteps.has(firstFailedOrFirst.id)) {
        toggleStep(firstFailedOrFirst);
      }
    }
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
          <div className="flex gap-2">
            {(run.status === "queued" || run.status === "running") && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel"}
              </button>
            )}
            {(run.status === "failure" || run.status === "cancelled") && (
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary-hover"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* DAG visualization */}
      <PipelineGraph
        jobs={jobs}
        onJobClick={handleJobClick}
        pipelineName={run.pipelineName}
        trigger={run.trigger}
      />

      {/* Jobs */}
      <div className="space-y-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            id={`job-${job.id}`}
            className="border border-border rounded-lg overflow-hidden scroll-mt-4"
          >
            {/* Job header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-secondary">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[job.status] || ""}`}
              >
                <span>{STATUS_ICONS[job.status] || ""}</span>
                {job.status}
              </span>
              <span className="font-medium text-sm text-text-primary">{job.name}</span>
              <span className="text-xs text-text-secondary ml-auto">
                {formatDuration(job.startedAt, job.finishedAt)}
              </span>
            </div>

            {/* Steps */}
            <div>
              {job.steps.map((step, stepIdx) => (
                <div key={step.id}>
                  <button
                    onClick={() => toggleStep(step)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-surface-secondary ${
                      stepIdx > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="text-xs w-4">
                      {expandedSteps.has(step.id) ? "\u25BC" : "\u25B6"}
                    </span>
                    <span
                      className={`inline-flex items-center w-4 text-xs ${
                        step.status === "success"
                          ? "text-green-600"
                          : step.status === "failure"
                            ? "text-red-600"
                            : step.status === "running"
                              ? "text-blue-600"
                              : "text-text-tertiary"
                      }`}
                    >
                      {STATUS_ICONS[step.status] || ""}
                    </span>
                    <span className="text-sm text-text-primary">{step.name}</span>
                    {step.command && (
                      <span className="text-xs font-mono text-text-tertiary truncate max-w-xs">
                        {step.command}
                      </span>
                    )}
                    {step.uses && (
                      <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded">
                        {step.uses}
                      </span>
                    )}
                    <span className="text-xs text-text-secondary ml-auto">
                      {formatDuration(step.startedAt, step.finishedAt)}
                    </span>
                  </button>
                  {expandedSteps.has(step.id) && (
                    <div className="border-t border-border bg-[#1a1a2e] dark:bg-[#0d1117]">
                      <pre className="p-4 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                        {stepLogs[step.id] ||
                          (step.logPath ? "Loading logs..." : "No logs available")}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-text-primary mb-3">Artifacts</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            {artifacts.map((artifact, idx) => (
              <a
                key={artifact.id}
                href={`/api/repos/${owner}/${repo}/pipelines/artifacts/${artifact.id}/download`}
                className={`flex items-center justify-between px-4 py-2.5 hover:bg-surface-secondary hover:no-underline ${
                  idx > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-text-secondary"
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
                  <span className="text-sm text-text-primary">{artifact.name}</span>
                </div>
                <span className="text-xs text-text-secondary">
                  {formatBytes(artifact.sizeBytes)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
