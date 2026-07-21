"use client";

import { Link } from "react-flight-router/client";
import { Wordmark, RepositoryRow } from "@groffee/ui";
import { timeAgo } from "../lib/time";

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
            className={`${i < repos.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
          >
            <RepositoryRow
              owner={repo.owner}
              name={repo.name}
              description={repo.description}
              isPublic={repo.isPublic}
              updatedAt={repo.updatedAt}
              dense
              linkAs={({ to, className, children }) => (
                <Link to={to} className={className}>
                  {children}
                </Link>
              )}
              timeAgo={timeAgo}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Typographic hero. The wordmark "groffee" is set in Fraunces Black at a
 * size that owns the page — left-aligned, lowercase, no centering, no card.
 * Underneath sits a single monospace tagline with a blinking terminal
 * cursor. The brand mark recurs as a subtle ornament next to the wordmark
 * rather than being centered above it. */
function LandingHero() {
  return (
    <header className="mb-10 pt-6 pb-4 border-b border-border">
      {/* Baked wordmark — text and cup are a single SVG so the brand renders
       * identically across browsers and never has the layout-thrash from
       * font-swap. The cup ligature replaces the `o`. */}
      <h1 aria-label="groffee" className="-ml-1">
        <Wordmark
          height={140}
          textColor="var(--color-text-primary)"
          cupColor="var(--color-accent)"
          className="max-w-full h-auto"
        />
      </h1>
      <p className="font-mono text-sm text-text-secondary mt-4 cursor-blink">
        git, locally roasted.
      </p>
    </header>
  );
}

function LoggedOutActions() {
  return (
    <div className="flex items-center gap-5 mb-10 font-mono text-sm">
      <Link to="/register" className="text-accent hover:underline">
        → new account
      </Link>
      <Link to="/login" className="text-text-secondary hover:text-text-primary">
        sign in
      </Link>
    </div>
  );
}

function LoggedInActions({ username }: { username: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-10 font-mono text-sm">
      <Link to="/new" className="text-accent hover:underline">
        → new repository
      </Link>
      <Link to={`/${username}`} className="text-text-secondary hover:text-text-primary">
        your repos
      </Link>
      <Link to="/explore" className="text-text-secondary hover:text-text-primary">
        explore
      </Link>
    </div>
  );
}

export function HomeView({
  initialRepos,
  initialUsername,
}: {
  initialRepos: Repo[];
  initialUsername: string | null;
}) {
  return (
    <div className="max-w-3xl mt-2">
      <LandingHero />
      {initialUsername ? <LoggedInActions username={initialUsername} /> : <LoggedOutActions />}
      <RecentPublicRepos repos={initialRepos} />
    </div>
  );
}
