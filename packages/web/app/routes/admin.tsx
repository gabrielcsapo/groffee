"use client";

import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { getSessionUser } from "../lib/server/auth";
import { getAdminDashboard } from "../lib/server/admin";

interface DashboardData {
  users: number;
  repos: number;
  sessions: number;
  logs: number;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
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

function AdminNav() {
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
                ? "bg-primary/10 text-primary"
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

export { AdminNav };

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);

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
        if (d) setData(d);
      })
      .catch(() => setAuthorized(false))
      .finally(() => setLoading(false));
  }, []);

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
      <h1 className="text-2xl font-bold mb-1">Admin Dashboard</h1>
      <p className="text-text-secondary text-sm mb-6">System overview and management</p>
      <AdminNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Users" value={data.users} />
        <StatCard label="Repositories" value={data.repos} />
        <StatCard label="Active Sessions" value={data.sessions} />
        <StatCard label="Log Entries" value={data.logs} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-text-secondary font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}
