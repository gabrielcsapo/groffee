import type { ReactNode } from "react";
import { Link } from "react-router";
import { GroffeeLogo, RepoNav, BranchSwitcher, Badge, CloneUrl } from "@groffee/ui";

function FileIcon({ isDir }: { isDir?: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

const mockFiles = [
  { name: "packages", isDir: true, message: "feat: add git LFS support", time: "2 days ago" },
  { name: "scripts", isDir: true, message: "chore: update build scripts", time: "5 days ago" },
  { name: ".gitignore", isDir: false, message: "chore: ignore data directory", time: "1 week ago" },
  { name: "Dockerfile", isDir: false, message: "feat: multi-stage Docker build", time: "3 days ago" },
  { name: "package.json", isDir: false, message: "chore: updates to latest deps", time: "4 days ago" },
  { name: "README.md", isDir: false, message: "docs: update installation guide", time: "1 week ago" },
  { name: "tsconfig.base.json", isDir: false, message: "fix: strict mode for shared config", time: "2 weeks ago" },
];

/** Wraps content in a macOS-style browser chrome frame */
function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-lg bg-surface">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary border-b border-border">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        {/* URL bar */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 bg-surface rounded-md border border-border px-3 py-1 max-w-md w-full">
            <svg className="w-3 h-3 text-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs text-text-secondary truncate">{url}</span>
          </div>
        </div>
        {/* Spacer to balance traffic lights */}
        <div className="w-[54px]" />
      </div>
      {/* Browser content */}
      <div className="pointer-events-none select-none">
        {children}
      </div>
    </div>
  );
}

function MockRepoPreview() {
  return (
    <BrowserChrome url="groffee.example.com/gabrielcsapo/groffee">
      {/* App header bar */}
      <div className="bg-header-bg px-4 h-10 flex items-center gap-2">
        <GroffeeLogo size={18} className="text-white" />
        <span className="text-white text-xs font-semibold">Groffee</span>
      </div>

      <div className="p-4">
        {/* Repo header */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-text-secondary">gabrielcsapo</span>
            <span className="text-text-secondary">/</span>
            <span className="text-sm font-semibold text-primary">groffee</span>
            <Badge variant="public">Public</Badge>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            A self-hosted Git platform built with React 19, Vite, and modern web technologies.
          </p>
          <RepoNav
            owner="gabrielcsapo"
            repo="groffee"
            currentPath="/gabrielcsapo/groffee"
            openIssueCount={3}
            openPrCount={1}
          />
        </div>

        {/* Branch & clone row */}
        <div className="py-3 border-b border-border flex items-center gap-3 flex-wrap mb-0">
          <BranchSwitcher
            branches={[{ name: "main" }, { name: "develop" }, { name: "feat/lfs-support" }]}
            currentRef="main"
            onBranchChange={() => {}}
          />
          <div className="flex-1 min-w-0 max-w-xs ml-auto">
            <CloneUrl path="/gabrielcsapo/groffee.git" />
          </div>
        </div>

        {/* File tree */}
        <div className="border border-border rounded-md overflow-hidden mt-3">
          <div className="divide-y divide-border">
            {mockFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-3 px-4 py-2 text-sm"
              >
                <FileIcon isDir={file.isDir} />
                <span className={`shrink-0 ${file.isDir ? "text-primary font-medium" : "text-text-primary"}`}>
                  {file.name}
                </span>
                <span className="text-text-secondary text-xs truncate flex-1">{file.message}</span>
                <span className="text-text-secondary text-xs shrink-0">{file.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

export function Component() {
  return (
    <div className="py-12 not-prose">
      {/* Hero */}
      <div className="text-center mb-16">
        <GroffeeLogo size={72} className="mx-auto mb-6 text-text-primary" />
        <h1 className="text-4xl font-bold text-text-primary mb-4">Groffee</h1>
        <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto leading-relaxed">
          A self-hosted Git platform built with React 19, Vite, and modern web
          technologies. Manage repositories, issues, and pull requests on your own
          infrastructure.
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

      {/* Mock app preview */}
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

      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Self-Hosted</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Run on your own servers. Full control over your data, users, and
            repositories. No external dependencies.
          </p>
        </div>
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Git Protocol</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Smart HTTP and SSH protocol support. Clone, push, and pull with standard
            Git tools. Git LFS included.
          </p>
        </div>
        <div className="card p-6">
          <div className="w-10 h-10 rounded-lg bg-merged/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-merged" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Modern Stack</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            React 19 with Server Components, Vite 7, Tailwind CSS 4, and SQLite via
            Drizzle ORM.
          </p>
        </div>
      </div>

      {/* Quick links */}
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
