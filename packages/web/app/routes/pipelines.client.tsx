"use client";

import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-flight-router/client";
import { getPipelineRuns, dispatchPipeline } from "../lib/server/pipelines";
import { LoadMore } from "../components/load-more.client";

interface PipelineRun {
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
  createdAt: string;
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
  timed_out:
    "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700/40",
};

const STATUS_ICONS: Record<string, string> = {
  queued: "\u25CB",
  running: "\u25CE",
  success: "\u2713",
  failure: "\u2717",
  cancelled: "\u2298",
  timed_out: "\u23F1",
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.round((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return date.toLocaleDateString();
}

export function PipelinesView({
  owner,
  repo,
  initialStatus,
  initialRef,
  initialTrigger,
  initialActor,
  initialRuns,
  initialNextCursor,
  initialHasMore,
  hasConfig,
  configYaml,
  configError,
  canEditConfig = false,
  refOptions,
  actorOptions,
}: {
  owner: string;
  repo: string;
  initialStatus: string;
  initialRef: string;
  initialTrigger: string;
  initialActor: string;
  initialRuns: PipelineRun[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  hasConfig: boolean;
  configYaml: string | null;
  configError: string | null;
  canEditConfig?: boolean;
  refOptions: string[];
  actorOptions: string[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const refFilter = searchParams.get("ref") || "";
  const triggerFilter = searchParams.get("trigger") || "";
  const actorFilter = searchParams.get("actor") || "";
  const [runs, setRuns] = useState<PipelineRun[]>(initialRuns);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchRef, setDispatchRef] = useState("main");
  const [dispatching, setDispatching] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // All filter values are URL-driven. We pack them into the same options
  // object the server action accepts, so refresh + loadMore + filter-change
  // all stay in sync.
  const filterOptions = {
    ref: refFilter || undefined,
    trigger: (triggerFilter || undefined) as "push" | "pull_request" | "manual" | undefined,
    actor: actorFilter || undefined,
  };

  // Refresh just the first page (for live polling). Doesn't disturb already-
  // loaded older pages — we replace the freshest N rows.
  const refreshRuns = useCallback(() => {
    getPipelineRuns(owner, repo, statusFilter || undefined, filterOptions).then((data) => {
      if (data.runs) {
        setRuns(data.runs);
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore ?? false);
      }
    });
    // filterOptions is a fresh object each render; the underlying primitives
    // are tracked individually so this is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, statusFilter, refFilter, triggerFilter, actorFilter]);

  useEffect(() => {
    if (
      statusFilter === initialStatus &&
      refFilter === initialRef &&
      triggerFilter === initialTrigger &&
      actorFilter === initialActor
    ) {
      setRuns(initialRuns);
      setNextCursor(initialNextCursor);
      setHasMore(initialHasMore);
      return;
    }
    setLoading(true);
    getPipelineRuns(owner, repo, statusFilter || undefined, filterOptions).then((data) => {
      setRuns(data.runs || []);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore ?? false);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    statusFilter,
    refFilter,
    triggerFilter,
    actorFilter,
    initialStatus,
    initialRef,
    initialTrigger,
    initialActor,
    owner,
    repo,
    initialRuns,
    initialNextCursor,
    initialHasMore,
  ]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const data = await getPipelineRuns(owner, repo, statusFilter || undefined, {
      ...filterOptions,
      cursor: nextCursor,
    });
    if (!data.error && data.runs) {
      setRuns((prev) => [...prev, ...(data.runs as PipelineRun[])]);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, statusFilter, refFilter, triggerFilter, actorFilter, nextCursor]);

  // Auto-refresh if any runs are in progress
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "queued" || r.status === "running");
    if (!hasActive) return;
    const interval = setInterval(refreshRuns, 5000);
    return () => clearInterval(interval);
  }, [runs, refreshRuns]);

  const handleDispatch = async () => {
    setDispatching(true);
    const result = await dispatchPipeline(owner, repo, dispatchRef);
    setDispatching(false);
    setShowDispatch(false);
    if (!result.error) {
      refreshRuns();
    }
  };

  const filterButtons = [
    { label: "All", value: "" },
    { label: "Running", value: "running" },
    { label: "Success", value: "success" },
    { label: "Failed", value: "failure" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-text-primary">Pipelines</h2>
        <div className="flex gap-2">
          {hasConfig && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-border-hover"
            >
              {showConfig ? "Hide Config" : "View Config"}
            </button>
          )}
          {canEditConfig && (
            <Link
              to={`/${owner}/${repo}/pipelines/config`}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-border-hover hover:no-underline"
            >
              {hasConfig ? "Edit Config" : "Add Config"}
            </Link>
          )}
          <button
            onClick={() => setShowDispatch(!showDispatch)}
            className="px-3 py-1.5 text-sm bg-action text-white rounded-md hover:bg-action-hover"
          >
            Run Pipeline
          </button>
        </div>
      </div>

      {/* Manual dispatch dialog */}
      {showDispatch && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-surface-secondary">
          <h3 className="text-sm font-medium mb-2 text-text-primary">Dispatch Pipeline</h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-text-secondary block mb-1">Branch / Ref</label>
              <input
                type="text"
                value={dispatchRef}
                onChange={(e) => setDispatchRef(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface-primary text-text-primary"
                placeholder="main"
              />
            </div>
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="px-4 py-1.5 text-sm bg-action text-white rounded-md hover:bg-action-hover disabled:opacity-50"
            >
              {dispatching ? "Triggering..." : "Trigger"}
            </button>
            <button
              onClick={() => setShowDispatch(false)}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Config viewer */}
      {showConfig && configYaml && (
        <div className="mb-4 border border-border rounded-lg overflow-hidden">
          <div className="bg-surface-secondary px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">.groffee/pipelines.yml</span>
            {configError && (
              <span className="text-xs text-red-500">Validation error: {configError}</span>
            )}
          </div>
          <pre className="p-4 text-sm overflow-x-auto bg-surface-primary text-text-primary">
            <code>{configYaml}</code>
          </pre>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                if (btn.value) {
                  params.set("status", btn.value);
                } else {
                  params.delete("status");
                }
                setSearchParams(params);
              }}
              className={`px-3 py-1 text-sm rounded-md ${
                statusFilter === btn.value
                  ? "bg-selected-bg text-selected-text"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Ref / branch filter — alphabetized list capped at 100 (server-side) */}
        <select
          aria-label="Filter by branch"
          value={refFilter}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) params.set("ref", e.target.value);
            else params.delete("ref");
            setSearchParams(params);
          }}
          className="px-2 py-1 text-sm border border-border rounded-md bg-surface-primary text-text-primary"
        >
          <option value="">All branches</option>
          {refOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {/* Trigger filter — fixed enum */}
        <select
          aria-label="Filter by trigger"
          value={triggerFilter}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) params.set("trigger", e.target.value);
            else params.delete("trigger");
            setSearchParams(params);
          }}
          className="px-2 py-1 text-sm border border-border rounded-md bg-surface-primary text-text-primary"
        >
          <option value="">All triggers</option>
          <option value="push">push</option>
          <option value="pull_request">pull_request</option>
          <option value="manual">manual</option>
        </select>

        {/* Actor filter — alphabetized usernames capped at 100 (server-side) */}
        <select
          aria-label="Filter by actor"
          value={actorFilter}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) params.set("actor", e.target.value);
            else params.delete("actor");
            setSearchParams(params);
          }}
          className="px-2 py-1 text-sm border border-border rounded-md bg-surface-primary text-text-primary"
        >
          <option value="">All actors</option>
          {actorOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {(refFilter || triggerFilter || actorFilter) && (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete("ref");
              params.delete("trigger");
              params.delete("actor");
              setSearchParams(params);
            }}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      {!hasConfig && runs.length === 0 && (
        <div className="py-14">
          <pre
            className="font-mono text-[11px] leading-tight text-text-secondary/60 mb-6 select-none"
            aria-hidden="true"
          >
            {`         (   )
          ) (
         (   )
      _________
     |_________|___
    |             |\\
    |             | )
    |_____________|/
       \\_________/`}
          </pre>
          <h3 className="font-editorial font-bold text-2xl text-text-primary lowercase tracking-tight mb-2">
            nothing brewing.
          </h3>
          <p className="font-mono text-sm text-text-secondary">
            add{" "}
            <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
              .groffee/pipelines.yml
            </code>{" "}
            to your repo, then push.
          </p>
        </div>
      )}

      {/* Runs list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-secondary rounded-lg animate-pulse" />
          ))}
        </div>
      ) : runs.length > 0 ? (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            {runs.map((run, idx) => (
              <Link
                key={run.id}
                to={`/${owner}/${repo}/pipelines/runs/${run.number}`}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-surface-secondary hover:no-underline ${
                  idx > 0 ? "border-t border-border" : ""
                }`}
              >
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status] || ""}`}
                >
                  <span>{STATUS_ICONS[run.status] || ""}</span>
                  {run.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary text-sm">
                      {run.pipelineName}
                    </span>
                    <span className="text-text-tertiary text-xs">#{run.number}</span>
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {run.trigger} on <span className="font-mono">{run.ref}</span>
                    {" \u00B7 "}
                    <span className="font-mono">{run.commitOid.slice(0, 7)}</span>
                    {" \u00B7 by "}
                    {run.triggeredBy}
                  </div>
                </div>
                <div className="text-right text-xs text-text-secondary">
                  <div>{formatTime(run.createdAt)}</div>
                  <div>{formatDuration(run.startedAt, run.finishedAt)}</div>
                </div>
              </Link>
            ))}
          </div>
          <LoadMore hasMore={hasMore} onLoad={loadMore} />
        </>
      ) : (
        hasConfig && (
          <div className="text-center py-8 text-text-secondary text-sm">
            No pipeline runs{statusFilter ? ` with status "${statusFilter}"` : ""} yet.
          </div>
        )
      )}
    </div>
  );
}
