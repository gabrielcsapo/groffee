import { useState } from "react";
import { BrowserChrome } from "./browser-chrome";
import { MockHeader, MockRepoSubNav } from "./_chrome";

/**
 * Interactive pipeline run mock. Visually 1:1 with the live product's
 * `/pipelines/runs/:n` page — full chrome, breadcrumb header with status
 * pill + action buttons, DAG card with curved edges between job nodes,
 * and per-job step lists with collapse carets and run history rail.
 *
 * Drift control: same theme tokens (`--color-action`, `--color-success`,
 * `--color-danger`, surface/border/canvas), same shared chrome from
 * `./_chrome`. The DAG layout math mirrors `pipeline-run.client.tsx` —
 * NODE_WIDTH / NODE_HEIGHT / COLUMN_GAP constants kept in sync with the
 * live `computeJobLayout()` so node spacing reads identically.
 */

type JobStatus =
  | "success"
  | "failure"
  | "running"
  | "queued"
  | "cancelled"
  | "skipped"
  | "timed_out";

interface MockStep {
  name: string;
  command: string;
  duration: string;
  status: JobStatus;
}

interface MockJob {
  id: string;
  name: string;
  image: string;
  status: JobStatus;
  duration: string;
  needs?: string[];
  steps: MockStep[];
}

// Mirrors the real run at playground/pipelines/runs/1 — same pipeline
// name, same jobs, same outcome. Push `.groffee/pipelines.yml` to your
// own repo and you get this view.
const jobs: MockJob[] = [
  {
    id: "lint-markdown",
    name: "Lint markdown",
    image: "node:22-slim",
    status: "success",
    duration: "1s",
    steps: [
      {
        name: "Check trailing newline",
        command: 'for f in $(find . -name "*.md" -not -path "…',
        duration: "0s",
        status: "success",
      },
    ],
  },
  {
    id: "check-links",
    name: "Check links",
    image: "node:22-slim",
    status: "success",
    duration: "9s",
    steps: [
      {
        name: "Install markdown-link-check",
        command: "npm install -g markdown-link-check@3",
        duration: "8s",
        status: "success",
      },
      {
        name: "Verify links",
        command: 'for f in $(find . -name "*.md" -not -path "…',
        duration: "0s",
        status: "success",
      },
    ],
  },
  {
    id: "summary",
    name: "Summary",
    image: "node:22-slim",
    status: "success",
    duration: "0s",
    needs: ["lint-markdown", "check-links"],
    steps: [
      {
        name: "Print outcome",
        command: 'echo "All docs checks passed for ${COMMIT_S…',
        duration: "0s",
        status: "success",
      },
    ],
  },
];

// Right-rail run history. First run on a branch shows "No other runs",
// matching the live empty-state copy verbatim.
const history: Array<{ num: number; sha: string; status: JobStatus; date: string; by: string }> =
  [];

// ── Status helpers ────────────────────────────────────────────────────────

const STATUS_PILL: Record<JobStatus, string> = {
  success: "bg-success/10 text-success border border-success/30",
  failure: "bg-danger/10 text-danger border border-danger/30",
  running: "bg-info-bg text-info border border-info/30",
  queued: "bg-surface-secondary text-text-secondary border border-border",
  cancelled: "bg-surface-secondary text-text-secondary border border-border",
  skipped: "bg-surface-secondary text-text-secondary border border-border",
  timed_out: "bg-accent/10 text-accent border border-accent/30",
};

const STATUS_ICON: Record<JobStatus, string> = {
  success: "✓",
  failure: "✕",
  running: "◎",
  queued: "○",
  cancelled: "⊘",
  skipped: "→",
  timed_out: "⏱",
};

/** Small filled circle in the DAG node header — matches `<JobStatusIcon>`
 * in the live `pipeline-run.client.tsx`. */
function JobStatusBadge({ status }: { status: JobStatus }) {
  if (status === "success") {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-success text-white text-[11px]">
        ✓
      </span>
    );
  }
  if (status === "failure" || status === "timed_out") {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-danger text-white text-[11px]">
        ✕
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-info bg-info/15">
        <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse" />
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-border bg-surface" />
  );
}

// ── DAG layout ────────────────────────────────────────────────────────────
// Mirrors constants in packages/web/app/routes/pipeline-run.client.tsx so
// node spacing reads identically across docs + product.

const NODE_W = 220;
const NODE_H = 56;
const COL_GAP = 80;
const ROW_GAP = 16;
const PAD = 16;

interface NodeLayout {
  job: MockJob;
  x: number;
  y: number;
}

function layout(jobs: MockJob[]): {
  nodes: NodeLayout[];
  edges: Array<{ from: string; to: string }>;
  w: number;
  h: number;
} {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  // Depth = max(depth(needs)) + 1
  const depth = new Map<string, number>();
  function d(j: MockJob): number {
    if (depth.has(j.id)) return depth.get(j.id)!;
    if (!j.needs || j.needs.length === 0) {
      depth.set(j.id, 0);
      return 0;
    }
    const v = Math.max(...j.needs.map((n) => (byId.get(n) ? d(byId.get(n)!) + 1 : 0)));
    depth.set(j.id, v);
    return v;
  }
  jobs.forEach(d);

  const cols = new Map<number, MockJob[]>();
  jobs.forEach((j) => {
    const c = depth.get(j.id) || 0;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c)!.push(j);
  });

  const nodes: NodeLayout[] = [];
  let maxX = 0;
  let maxY = 0;
  cols.forEach((col, c) => {
    let y = PAD;
    col.forEach((job) => {
      const x = PAD + c * (NODE_W + COL_GAP);
      nodes.push({ job, x, y });
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
      y += NODE_H + ROW_GAP;
    });
  });

  const edges: Array<{ from: string; to: string }> = [];
  jobs.forEach((j) => (j.needs || []).forEach((n) => edges.push({ from: n, to: j.id })));

  return { nodes, edges, w: maxX + PAD, h: maxY + PAD };
}

function PipelineDAG({
  activeJobId,
  onJobClick,
}: {
  activeJobId: string | null;
  onJobClick: (id: string) => void;
}) {
  const { nodes, edges, w, h } = layout(jobs);
  const byId = new Map(nodes.map((n) => [n.job.id, n]));

  return (
    <div className="border border-border rounded-lg bg-surface-secondary p-4 mb-6 overflow-x-auto">
      <div className="mb-3">
        <div className="text-sm font-semibold text-text-primary">docs</div>
        <div className="text-xs text-text-tertiary">on: push</div>
      </div>
      <div className="relative" style={{ width: w, height: h, minWidth: w }}>
        {/* Curved connectors between nodes — same Bezier path the live DAG uses. */}
        <svg
          width={w}
          height={h}
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: "visible" }}
        >
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <g key={`${e.from}-${e.to}`} className="text-border">
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  fill="none"
                />
                <circle cx={x1} cy={y1} r={3} fill="currentColor" />
                <circle cx={x2} cy={y2} r={3} fill="currentColor" />
              </g>
            );
          })}
        </svg>

        {nodes.map(({ job, x, y }) => {
          const active = activeJobId === job.id;
          const danger = job.status === "failure" || job.status === "timed_out";
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => onJobClick(job.id)}
              className={`absolute flex items-center gap-2.5 px-3 rounded-md bg-surface border text-left transition-colors ${
                danger
                  ? "border-danger/40"
                  : active
                    ? "border-accent"
                    : "border-border hover:border-text-tertiary"
              }`}
              style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
            >
              <JobStatusBadge status={job.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{job.name}</div>
                <div className="text-[10px] text-text-tertiary font-mono truncate">{job.image}</div>
              </div>
              <div className="text-xs text-text-secondary tabular-nums">{job.duration}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step row (collapsible caret) ──────────────────────────────────────────

function StepRow({ step }: { step: MockStep }) {
  const success = step.status === "success";
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm border-b border-border last:border-b-0">
      <span className="text-text-tertiary text-xs w-3">▶</span>
      <span
        className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
          success ? "text-success" : "text-danger"
        }`}
        aria-hidden="true"
      >
        {success ? "✓" : "✕"}
      </span>
      <span className="text-text-primary">{step.name}</span>
      <code className="font-mono text-xs text-text-secondary truncate max-w-md">
        {step.command}
      </code>
      <span className="ml-auto text-xs text-text-secondary tabular-nums">{step.duration}</span>
    </div>
  );
}

// ── Job card (header + step list) ─────────────────────────────────────────

function JobCard({ job, isActive }: { job: MockJob; isActive: boolean }) {
  return (
    <div
      id={`mock-job-${job.id}`}
      className={`border rounded-lg overflow-hidden bg-surface transition-colors ${
        isActive ? "border-accent" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-secondary">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium font-mono ${STATUS_PILL[job.status]}`}
        >
          <span>{STATUS_ICON[job.status]}</span>
          {job.status}
        </span>
        <span className="text-sm font-medium text-text-primary">{job.name}</span>
        <span className="ml-auto text-xs text-text-secondary tabular-nums">{job.duration}</span>
      </div>
      <div>
        {job.steps.map((s, i) => (
          <StepRow key={i} step={s} />
        ))}
      </div>
    </div>
  );
}

// ── History rail ──────────────────────────────────────────────────────────

function HistoryRail() {
  return (
    <aside className="border border-border rounded-lg overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-medium text-text-primary">History</div>
      </div>
      {history.length === 0 ? (
        <div className="px-4 py-3 text-sm text-text-secondary">
          No other runs on <span className="font-mono text-xs">main</span> yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {history.map((h) => (
            <div key={h.num} className="px-4 py-2.5 flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                  h.status === "failure"
                    ? "text-danger"
                    : h.status === "cancelled"
                      ? "text-text-tertiary"
                      : "text-success"
                }`}
                aria-hidden="true"
              >
                {STATUS_ICON[h.status]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-text-primary">
                  #{h.num} <span className="text-text-secondary">{h.sha}</span>
                </div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {h.date} · {h.by}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ── Header (breadcrumb + actions) ────────────────────────────────────────

function PipelineHeader() {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="text-text-secondary text-sm">Pipelines</span>
          <span className="text-text-tertiary">/</span>
          <h2 className="text-xl font-semibold text-text-primary">docs #1</h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono bg-success/10 text-success border border-success/30">
            <span>✓</span>
            success
          </span>
        </div>
        <div className="text-sm text-text-secondary">
          Triggered by <span className="font-medium">gabrielcsapo</span> via{" "}
          <span className="font-medium">push</span> on{" "}
          <span className="font-mono text-xs bg-surface-secondary px-1.5 py-0.5 rounded">main</span>
          {" · "}
          <span className="font-mono text-xs">45617f6</span>
          {" · "}10s
        </div>
      </div>
      <div className="flex gap-2 items-start shrink-0">
        <span className="px-3 py-1.5 text-sm border border-border rounded-md text-text-secondary">
          Download all logs
        </span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

export function MockPipelineRun() {
  // Click a DAG node to highlight + scroll the matching job card — same
  // behavior as `handleJobClick` in the live pipeline-run page.
  const [active, setActive] = useState<string | null>("summary");

  const onJobClick = (id: string) => {
    setActive(id);
    // Best-effort scroll into view within the BrowserChrome frame. Falls
    // back silently if the element isn't in the DOM yet (SSR pre-hydrate).
    const el = typeof document !== "undefined" ? document.getElementById(`mock-job-${id}`) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <BrowserChrome url="groffee.local/gabrielcsapo/playground/pipelines/runs/1">
      <div className="bg-canvas">
        <MockHeader />
        <MockRepoSubNav
          activeTab="pipelines"
          tabs={[
            { label: "code" },
            { label: "issues" },
            { label: "pull requests", count: 1 },
            { label: "pipelines", dot: true },
            { label: "activity" },
            { label: "settings" },
          ]}
        />
        <div className="px-5 py-6 max-w-[1180px] mx-auto">
          <PipelineHeader />
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-6">
            <div className="min-w-0">
              <PipelineDAG activeJobId={active} onJobClick={onJobClick} />
              <div className="space-y-4">
                {jobs.map((j) => (
                  <JobCard key={j.id} job={j} isActive={active === j.id} />
                ))}
              </div>
            </div>
            <HistoryRail />
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}
