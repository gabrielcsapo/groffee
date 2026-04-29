"use client";

import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-flight-router/client";
import { getPipelineRuns, dispatchPipeline } from "../lib/server/pipelines";

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
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failure: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  timed_out: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
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
  initialRuns,
  hasConfig,
  configYaml,
  configError,
}: {
  owner: string;
  repo: string;
  initialRuns: PipelineRun[];
  hasConfig: boolean;
  configYaml: string | null;
  configError: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const [runs, setRuns] = useState<PipelineRun[]>(initialRuns);
  const [loading, setLoading] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchRef, setDispatchRef] = useState("main");
  const [dispatching, setDispatching] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const refreshRuns = useCallback(() => {
    getPipelineRuns(owner, repo, statusFilter || undefined).then((data) => {
      if (data.runs) setRuns(data.runs);
    });
  }, [owner, repo, statusFilter]);

  useEffect(() => {
    if (statusFilter) {
      setLoading(true);
      getPipelineRuns(owner, repo, statusFilter).then((data) => {
        setRuns(data.runs || []);
        setLoading(false);
      });
    } else {
      setRuns(initialRuns);
    }
  }, [statusFilter, owner, repo, initialRuns]);

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
          <button
            onClick={() => setShowDispatch(!showDispatch)}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary-hover"
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
              className="px-4 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50"
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

      {/* Status filter */}
      <div className="flex gap-1 mb-4">
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
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {!hasConfig && runs.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <div className="text-4xl mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-1">No pipelines configured</h3>
          <p className="text-sm">
            Add a{" "}
            <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
              .groffee/pipelines.yml
            </code>{" "}
            file to your repository to get started.
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
                  <span className="font-medium text-text-primary text-sm">{run.pipelineName}</span>
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
