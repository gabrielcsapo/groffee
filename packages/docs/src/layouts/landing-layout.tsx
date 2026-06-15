import { Link, Outlet } from "react-router";
import { Wordmark } from "@groffee/ui";
import { ThemeToggle } from "../components/theme-toggle";
import { GitHubLink } from "../components/github-link";

export function LandingLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — mirrors the live product's transparent-over-canvas chrome.
       * The Wordmark replaces the icon+text construction; nav links use the
       * lowercase monospace voice the product uses for `explore` / `docs`. */}
      <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-5">
          <Link
            to="/"
            className="shrink-0 hover:no-underline hover:opacity-80"
            aria-label="Groffee home"
          >
            <Wordmark
              height={22}
              textColor="var(--color-text-primary)"
              cupColor="var(--color-accent)"
            />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/docs/getting-started"
              className="text-text-secondary font-mono text-xs hover:text-text-primary hover:no-underline px-2 py-1.5 rounded-md hover:bg-surface-secondary transition-colors"
            >
              docs
            </Link>
            <Link
              to="/docs/api"
              className="text-text-secondary font-mono text-xs hover:text-text-primary hover:no-underline px-2 py-1.5 rounded-md hover:bg-surface-secondary transition-colors"
            >
              api
            </Link>
            <GitHubLink />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-6 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border mt-auto">
        <div className="max-w-5xl mx-auto px-5 py-6 flex items-center justify-between text-xs text-text-secondary font-mono">
          <p>
            <span className="font-editorial italic">groffee</span> · locally roasted git
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/docs/getting-started"
              className="text-text-secondary hover:text-text-primary hover:no-underline"
            >
              docs
            </Link>
            <Link
              to="/docs/api"
              className="text-text-secondary hover:text-text-primary hover:no-underline"
            >
              api
            </Link>
            <span>self-hosted</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
