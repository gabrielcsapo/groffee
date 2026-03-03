"use client";

import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-flight-router/client";
import { getSessionUser } from "../lib/server/auth";
import { getSystemLogs } from "../lib/server/admin";
import { AdminNav } from "./admin.client";

interface LogEntry {
  id: string;
  level: string;
  message: string;
  metadata: string | null;
  requestId: string | null;
  userId: string | null;
  source: string | null;
  duration: number | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  createdAt: Date;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "bg-text-secondary/10 text-text-secondary",
  info: "bg-info/10 text-info",
  warn: "bg-warning/10 text-warning",
  error: "bg-danger/10 text-danger",
};

const LIMIT = 50;

export default function AdminLogsClient() {
  const [searchParams, setSearchParams] = useSearchParams();
  const level = searchParams.get("level") || "";
  const source = searchParams.get("source") || "";
  const search = searchParams.get("search") || "";
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSystemLogs({
        level: level || undefined,
        source: source || undefined,
        search: search || undefined,
        limit: LIMIT,
        offset,
      });
      setLogs(result.logs as unknown as LogEntry[]);
      setTotal(result.total);
    } catch {
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  }, [level, source, search, offset]);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    // Reset offset when filters change
    if (!("offset" in updates)) {
      params.delete("offset");
    }
    setSearchParams(params);
  }

  useEffect(() => {
    getSessionUser()
      .then((user) => {
        if (!user?.isAdmin) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        return fetchLogs();
      })
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authorized) {
      fetchLogs();
    }
  }, [fetchLogs, authorized]);

  if (!authorized) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-text-secondary">Admin access required.</p>
        <Link to="/" className="text-primary mt-4 inline-block">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">System Logs</h1>
      <p className="text-text-secondary text-sm mb-6">
        View structured request and application logs
      </p>
      <AdminNav />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex gap-1">
          {["", "debug", "info", "warn", "error"].map((l) => (
            <button
              key={l}
              onClick={() => updateParams({ level: l })}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                level === l
                  ? "bg-primary text-white"
                  : "bg-surface-secondary text-text-secondary hover:text-text-primary"
              }`}
            >
              {l || "All"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["", "http", "ssh"].map((s) => (
            <button
              key={s}
              onClick={() => updateParams({ source: s })}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                source === s
                  ? "bg-primary text-white"
                  : "bg-surface-secondary text-text-secondary hover:text-text-primary"
              }`}
            >
              {s || "All sources"}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Custom source..."
          value={!["", "http", "ssh"].includes(source) ? source : ""}
          onChange={(e) => updateParams({ source: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
          className="px-2.5 py-1 text-xs border border-border rounded-md bg-surface w-32"
        />
        <input
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={(e) => updateParams({ search: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
          className="px-2.5 py-1 text-xs border border-border rounded-md bg-surface w-48"
        />
        <button
          onClick={() => fetchLogs()}
          className="px-3 py-1 text-xs bg-primary text-white rounded-md hover:brightness-110"
        >
          Apply
        </button>
        <button
          onClick={() => fetchLogs()}
          className="px-3 py-1 text-xs bg-surface-secondary text-text-secondary rounded-md hover:text-text-primary ml-auto"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-secondary text-text-secondary">
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium w-16">Level</th>
              <th className="text-left px-3 py-2 font-medium w-20">Source</th>
              <th className="text-left px-3 py-2 font-medium">Message</th>
              <th className="text-left px-3 py-2 font-medium w-16">Status</th>
              <th className="text-left px-3 py-2 font-medium w-16">Duration</th>
              <th className="text-left px-3 py-2 font-medium w-20">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-text-secondary">
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-text-secondary">
                  No logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-border hover:bg-surface-secondary/50">
                  <td className="px-3 py-1.5 text-text-secondary whitespace-nowrap font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${LEVEL_COLORS[log.level] || ""}`}
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{log.source || "-"}</td>
                  <td className="px-3 py-1.5 truncate max-w-md" title={log.message}>
                    {log.message}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary font-mono">
                    {log.statusCode || "-"}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary font-mono">
                    {log.duration != null ? `${log.duration}ms` : "-"}
                  </td>
                  <td
                    className="px-3 py-1.5 text-text-secondary font-mono"
                    title={log.requestId || ""}
                  >
                    {log.requestId ? log.requestId.slice(0, 8) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-text-secondary">
            Showing {offset + 1}-{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => updateParams({ offset: String(Math.max(0, offset - LIMIT)) })}
              disabled={offset === 0}
              className="px-3 py-1 text-xs border border-border rounded-md disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => updateParams({ offset: String(offset + LIMIT) })}
              disabled={offset + LIMIT >= total}
              className="px-3 py-1 text-xs border border-border rounded-md disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
