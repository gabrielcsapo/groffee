"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router";
import { GroffeeLogo } from "../components/groffee-logo";
import { timeAgo } from "../lib/time";
import { getSessionUser } from "../lib/server/auth";

interface Repo {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  owner: string;
  updatedAt: string;
}

function RecentPublicRepos({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Recent repositories</h2>
        <Link to="/explore" className="text-sm text-text-link hover:underline">
          Explore all
        </Link>
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        {repos.map((repo, i) => (
          <div
            key={repo.id}
            className={`px-4 py-3 ${i < repos.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-text-secondary shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                <Link
                  to={`/${repo.owner}/${repo.name}`}
                  className="text-sm font-semibold text-text-link hover:underline"
                >
                  {repo.owner}
                  <span className="text-text-secondary font-normal">/</span>
                  {repo.name}
                </Link>
                <span className="badge badge-public">Public</span>
              </div>
              {repo.updatedAt && (
                <span className="text-xs text-text-secondary">
                  Updated {timeAgo(repo.updatedAt)}
                </span>
              )}
            </div>
            {repo.description && (
              <p className="text-xs text-text-secondary mt-0.5 ml-6">{repo.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LandingHero() {
  return (
    <div className="text-center mb-12">
      <GroffeeLogo size={64} className="mx-auto text-text-primary mb-4" />
      <h1 className="text-4xl font-bold text-text-primary mb-3">Groffee</h1>
      <p className="text-xl text-text-secondary mb-2">
        The best way to deal with git is with a little bit of coffee.
      </p>
      <p className="text-text-secondary mb-6">
        Self-hosted git platform. Create repositories, collaborate with your team, and manage your
        code.
      </p>
    </div>
  );
}

function LoggedOutActions() {
  return (
    <div className="flex gap-3 justify-center mb-12">
      <Link to="/register" className="btn-primary px-6 py-2.5">
        Sign up for free
      </Link>
      <Link to="/login" className="btn-secondary px-6 py-2.5">
        Sign in
      </Link>
    </div>
  );
}

function LoggedInActions({ username }: { username: string }) {
  return (
    <div className="flex gap-3 justify-center mb-12">
      <Link to="/new" className="btn-primary px-6 py-2.5">
        New repository
      </Link>
      <Link to={`/${username}`} className="btn-secondary px-6 py-2.5">
        Your repositories
      </Link>
      <Link to="/explore" className="btn-secondary px-6 py-2.5">
        Explore
      </Link>
    </div>
  );
}

export function HomeView({ initialRepos }: { initialRepos: Repo[] }) {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionUser()
      .then((u) => {
        if (u) setUser({ username: u.username });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto mt-12">
      <LandingHero />
      {loading ? (
        <div className="flex gap-3 justify-center mb-12">
          <div className="skeleton w-36 h-10 rounded-md" />
          <div className="skeleton w-36 h-10 rounded-md" />
        </div>
      ) : user ? (
        <LoggedInActions username={user.username} />
      ) : (
        <LoggedOutActions />
      )}
      <RecentPublicRepos repos={initialRepos} />
    </div>
  );
}
