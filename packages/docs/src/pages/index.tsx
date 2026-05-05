import { Link } from "react-router";
import { GroffeeLogo } from "@groffee/ui";
import { MockRepoPreview, MockIssueList } from "../components/mocks";

interface Comparison {
  groffee: string;
  others: string;
}

const comparisons: Comparison[] = [
  {
    groffee: "A single Node process serves the web app, API, Git smart-HTTP, and SSH.",
    others: "Multiple services (web, sidecar, queue, SSH daemon) wired together with config.",
  },
  {
    groffee: "Bring your own host. SQLite + a directory of bare repos is the entire data layer.",
    others: "Database server, object store, and external session/cache services to run separately.",
  },
  {
    groffee:
      "Built on React Server Components — pages render server-side from the git layer directly.",
    others: "Heavy client bundles, REST round-trips, or template engines that haven't aged well.",
  },
  {
    groffee: "No cloud account, no telemetry, no licensing dance. It's MIT-style open source.",
    others: "Vendor lock-in, paid seats, or telemetry baked into the binary.",
  },
];

export function Component() {
  return (
    <div className="py-12 not-prose">
      <div className="text-center mb-16">
        <GroffeeLogo size={72} className="mx-auto mb-6 text-text-primary" />
        <h1 className="text-4xl font-bold text-text-primary mb-4">Groffee</h1>
        <p className="text-lg text-text-secondary mb-2 max-w-2xl mx-auto leading-relaxed">
          The best way to deal with git is with a little bit of coffee.
        </p>
        <p className="text-sm text-text-secondary mb-8 max-w-2xl mx-auto">
          Self-hosted git platform. Built with React 19, Vite, and modern web technologies.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/docs/getting-started" className="btn-primary hover:no-underline">
            Get Started
          </Link>
          <Link to="/docs/api" className="btn-secondary hover:no-underline">
            API Reference
          </Link>
        </div>
      </div>

      <div className="mb-16">
        <h2 className="text-lg font-semibold text-text-primary mb-2 text-center">
          See it in action
        </h2>
        <p className="text-sm text-text-secondary mb-6 text-center">
          A familiar repository view built with real Groffee components.
        </p>
        <div className="max-w-4xl mx-auto">
          <MockRepoPreview />
        </div>
      </div>

      <div className="mb-16">
        <h2 className="text-lg font-semibold text-text-primary mb-2 text-center">Why Groffee?</h2>
        <p className="text-sm text-text-secondary mb-6 text-center max-w-2xl mx-auto">
          Self-hosted git platforms tend to either bury you in operational complexity or lock you
          into a SaaS bill. Groffee picks a different lane.
        </p>
        <div className="max-w-3xl mx-auto card divide-y divide-border">
          {comparisons.map((c, i) => (
            <div
              key={i}
              className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border"
            >
              <div className="p-4">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                  Groffee
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{c.groffee}</p>
              </div>
              <div className="p-4 bg-surface-secondary/30">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Typical alternatives
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{c.others}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Self-Hosted</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Run on your own servers. Full control over your data, users, and repositories. No
            external dependencies.
          </p>
        </div>
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Git Protocol</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Smart HTTP and SSH protocol support. Clone, push, and pull with standard Git tools. Git
            LFS included.
          </p>
        </div>
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-merged/10 flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-merged"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Modern Stack</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            React 19 with Server Components, Vite 7, Tailwind CSS 4, and SQLite via Drizzle ORM.
          </p>
        </div>
      </div>

      <div className="mb-16">
        <h2 className="text-lg font-semibold text-text-primary mb-2 text-center">
          Issues, the way you'd expect
        </h2>
        <p className="text-sm text-text-secondary mb-6 text-center">
          Tracking, labels, and comments — without a separate service.
        </p>
        <div className="max-w-3xl mx-auto">
          <MockIssueList />
        </div>
      </div>

      <div className="border-t border-border pt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/docs/getting-started"
            className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group"
          >
            <div className="text-sm font-medium text-text-primary group-hover:text-primary">
              Getting Started
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Install, configure, and run Groffee locally.
            </div>
          </Link>
          <Link
            to="/docs/architecture"
            className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group"
          >
            <div className="text-sm font-medium text-text-primary group-hover:text-primary">
              Architecture
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Packages, rendering model, and data storage.
            </div>
          </Link>
          <Link
            to="/docs/deployment"
            className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group"
          >
            <div className="text-sm font-medium text-text-primary group-hover:text-primary">
              Deployment
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Docker, reverse proxy, and production setup.
            </div>
          </Link>
          <Link
            to="/docs/api"
            className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group"
          >
            <div className="text-sm font-medium text-text-primary group-hover:text-primary">
              API Reference
            </div>
            <div className="text-xs text-text-secondary mt-1">
              REST API endpoints for repos, issues, and PRs.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
