"use client";

import { useState, useEffect } from "react";
import { Link, useLocation } from "react-flight-router/client";
import { getSessionUser } from "../lib/server/auth";
import { getAdminDashboard, getAdminAuditLog, backfillPullRequests } from "../lib/server/admin";

interface DashboardData {
  users: number;
  repos: number;
  sessions: number;
  logs: number;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  dbSizeBytes: number;
  artifactsSizeBytes: number;
  storage: { id: string; name: string; owner: string; diskUsageBytes: number | null }[];
  searchIndex: { lastReindexAt: string | null; pendingCount: number };
  auditEvents: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    targetLabel?: string | null;
    ipAddress: string | null;
    createdAt: string;
    username: string;
    userId: string;
  }[];
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function AdminNav() {
  const location = useLocation();
  const links = [
    { to: "/admin", label: "Dashboard", exact: true },
    { to: "/admin/logs", label: "Logs", exact: false },
    { to: "/admin/users", label: "Users", exact: false },
  ];

  return (
    <nav className="flex gap-1 mb-6 border-b border-border pb-3">
      {links.map((link) => {
        const active = link.exact
          ? location.pathname === link.to
          : location.pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`px-3 py-1.5 rounded-md text-sm font-medium hover:no-underline transition-colors ${
              active
                ? "bg-selected-bg text-selected-text"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);

  // Audit-log filters / pagination state. Kept separate from the initial
  // payload so users can refine without refetching the whole dashboard.
  const [auditFilter, setAuditFilter] = useState({ action: "", username: "", ip: "" });
  const [auditEvents, setAuditEvents] = useState<DashboardData["auditEvents"]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  useEffect(() => {
    getSessionUser()
      .then((user) => {
        if (!user?.isAdmin) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        return getAdminDashboard();
      })
      .then((d) => {
        if (d) {
          setData(d as DashboardData);
          setAuditEvents((d as DashboardData).auditEvents);
        }
      })
      .catch(() => setAuthorized(false))
      .finally(() => setLoading(false));
  }, []);

  async function applyAuditFilter() {
    setAuditLoading(true);
    const result = await getAdminAuditLog({
      action: auditFilter.action || undefined,
      username: auditFilter.username || undefined,
      ip: auditFilter.ip || undefined,
      limit: 50,
    });
    setAuditEvents(result.events);
    setAuditCursor(result.nextCursor);
    setAuditLoading(false);
  }

  async function loadMoreAudit() {
    if (!auditCursor) return;
    setAuditLoading(true);
    const result = await getAdminAuditLog({
      cursor: auditCursor,
      action: auditFilter.action || undefined,
      username: auditFilter.username || undefined,
      ip: auditFilter.ip || undefined,
      limit: 50,
    });
    setAuditEvents((prev) => [...prev, ...result.events]);
    setAuditCursor(result.nextCursor);
    setAuditLoading(false);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Admin</h1>
        <div className="animate-pulse-subtle space-y-4">
          <div className="h-10 bg-surface-secondary rounded w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-surface-secondary rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-text-secondary">You need admin privileges to access this page.</p>
        <Link to="/" className="text-primary mt-4 inline-block">
          Go home
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight mb-1">
        admin
      </h1>
      <p className="text-text-secondary text-sm mb-6">System overview and management</p>
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Users" value={data.users} />
        <StatCard label="Repositories" value={data.repos} />
        <StatCard label="Active Sessions" value={data.sessions} />
        <StatCard label="Log Entries" value={data.logs} />
        <StatCard label="DB size" valueLabel={formatBytes(data.dbSizeBytes)} />
        <StatCard label="Artifacts size" valueLabel={formatBytes(data.artifactsSizeBytes)} />
        <StatCard
          label="Last reindex"
          valueLabel={formatRelative(data.searchIndex.lastReindexAt)}
        />
        <StatCard label="Repos pending reindex" value={data.searchIndex.pendingCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">System</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Uptime</span>
              <span className="font-medium">{formatUptime(data.uptime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Memory (RSS)</span>
              <span className="font-medium">{data.memory.rss} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Heap Used</span>
              <span className="font-medium">
                {data.memory.heapUsed} / {data.memory.heapTotal} MB
              </span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Quick Links</h2>
          <div className="space-y-2">
            <Link
              to="/admin/logs"
              className="flex items-center gap-2 text-sm text-primary hover:no-underline hover:underline"
            >
              View system logs
            </Link>
            <Link
              to="/admin/users"
              className="flex items-center gap-2 text-sm text-primary hover:no-underline hover:underline"
            >
              Manage users
            </Link>
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-xs text-text-secondary mb-2">
                Backfill <code>pull_requests</code> rows from merge commits on each repo&apos;s
                default branch.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setBackfilling(true);
                  setBackfillResult(null);
                  try {
                    const result = await backfillPullRequests(null);
                    const totalInserted = result.summaries.reduce((sum, s) => sum + s.inserted, 0);
                    const totalSkipped = result.summaries.reduce((sum, s) => sum + s.skipped, 0);
                    setBackfillResult(
                      `Inserted ${totalInserted} PRs across ${result.summaries.length} repo(s) (skipped ${totalSkipped} existing).`,
                    );
                  } catch (err) {
                    setBackfillResult(`Failed: ${err instanceof Error ? err.message : err}`);
                  }
                  setBackfilling(false);
                }}
                disabled={backfilling}
                className="btn-secondary btn-sm"
              >
                {backfilling ? "Backfilling…" : "Backfill PRs from history"}
              </button>
              {backfillResult && (
                <p className="text-xs text-text-secondary mt-2">{backfillResult}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Storage by repo */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Storage by repo (top 20)</h2>
        {data.storage.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No measured storage yet. Run{" "}
            <code className="font-mono text-xs">pnpm admin recompute-storage</code> first.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-secondary border-b border-border">
                <th className="text-left py-2 font-medium">Repo</th>
                <th className="text-right py-2 font-medium">Disk usage</th>
              </tr>
            </thead>
            <tbody>
              {data.storage.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <Link to={`/${row.owner}/${row.name}`} className="text-primary hover:underline">
                      {row.owner}/{row.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {formatBytes(row.diskUsageBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent audit events */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Recent audit events</h2>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <input
            type="text"
            value={auditFilter.action}
            onChange={(e) => setAuditFilter((p) => ({ ...p, action: e.target.value }))}
            placeholder="action contains…"
            className="px-3 py-1.5 border border-border rounded-md bg-surface text-xs"
          />
          <input
            type="text"
            value={auditFilter.username}
            onChange={(e) => setAuditFilter((p) => ({ ...p, username: e.target.value }))}
            placeholder="username"
            className="px-3 py-1.5 border border-border rounded-md bg-surface text-xs"
          />
          <input
            type="text"
            value={auditFilter.ip}
            onChange={(e) => setAuditFilter((p) => ({ ...p, ip: e.target.value }))}
            placeholder="IP contains…"
            className="px-3 py-1.5 border border-border rounded-md bg-surface text-xs"
          />
          <button
            type="button"
            onClick={applyAuditFilter}
            disabled={auditLoading}
            className="btn-primary btn-sm"
          >
            {auditLoading ? "Loading…" : "Apply"}
          </button>
        </div>
        {auditEvents.length === 0 ? (
          <p className="text-sm text-text-secondary">No audit events match.</p>
        ) : (
          <div className="border border-border rounded-md">
            {auditEvents.map((ev, i) => (
              <div
                key={ev.id}
                className={`flex items-center gap-3 px-3 py-2 text-xs ${i > 0 ? "border-t border-border" : ""}`}
              >
                <span className="font-medium w-32 truncate">{ev.username}</span>
                <span className="font-mono px-2 py-0.5 rounded bg-surface-secondary border border-border whitespace-nowrap">
                  {ev.action}
                </span>
                <span
                  className="text-text-secondary truncate flex-1"
                  title={`${ev.targetType}:${ev.targetId}`}
                >
                  {ev.targetLabel
                    ? `${ev.targetType}: ${ev.targetLabel}`
                    : `${ev.targetType}:${ev.targetId.slice(0, 8)}`}
                </span>
                <span className="text-text-secondary whitespace-nowrap">{ev.ipAddress || "—"}</span>
                <time className="text-text-secondary whitespace-nowrap">
                  {new Date(ev.createdAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        )}
        {auditCursor && (
          <button
            type="button"
            onClick={loadMoreAudit}
            disabled={auditLoading}
            className="btn-secondary btn-sm mt-3"
          >
            {auditLoading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueLabel,
}: {
  label: string;
  value?: number;
  valueLabel?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-text-secondary font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {valueLabel ?? (typeof value === "number" ? value.toLocaleString() : "—")}
      </p>
    </div>
  );
}
