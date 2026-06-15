import { Wordmark } from "@groffee/ui";

/**
 * Shared product-chrome pieces used by every interactive mock so the docs
 * and live UI stay aligned. When the live header or repo sub-nav change,
 * this is the one place to update — all mocks (PR, pipelines, etc.) track
 * automatically.
 */

export function MockHeader() {
  return (
    <div className="bg-canvas border-b border-border">
      <div className="px-5 h-14 flex items-center gap-5">
        <Wordmark height={22} cupColor="var(--color-accent)" />
        <div className="flex-1 max-w-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs text-text-secondary bg-surface-secondary border border-border rounded-md">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="flex-1">type / to search</span>
            <kbd className="text-[10px] text-text-secondary bg-canvas border border-border rounded px-1 py-0.5 leading-none">
              /
            </kbd>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-text-secondary font-mono text-xs px-2 py-1.5">explore</span>
          <span className="text-text-secondary font-mono text-xs px-2 py-1.5">docs</span>
        </div>
        <div className="h-6 w-px bg-border" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <svg
            className="w-4 h-4 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
          <svg
            className="w-4 h-4 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-medium font-mono">
            G
          </span>
        </div>
      </div>
    </div>
  );
}

interface SubNavTab {
  label: string;
  count?: number;
  dot?: boolean;
}

export function MockRepoSubNav({
  owner = "gabrielcsapo",
  repo = "playground",
  activeTab = "pull requests",
  tabs = [
    { label: "code" },
    { label: "issues" },
    { label: "pull requests", count: 1 },
    { label: "pipelines" },
    { label: "activity" },
    { label: "settings" },
  ],
}: {
  owner?: string;
  repo?: string;
  activeTab?: string;
  tabs?: SubNavTab[];
}) {
  return (
    <div className="px-5 pt-5 max-w-[1180px] mx-auto">
      <div className="flex items-center gap-1.5 text-lg mb-2">
        <svg
          className="w-5 h-5 text-text-secondary"
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
        <span className="text-text-link">{owner}</span>
        <span className="text-text-secondary">/</span>
        <span className="text-text-link font-semibold">{repo}</span>
        <span className="ml-2 badge badge-public">Public</span>
      </div>
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {tabs.map((t) => {
          const active = t.label === activeTab;
          return (
            <span
              key={t.label}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-mono lowercase border-b-2 -mb-px whitespace-nowrap shrink-0 ${
                active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={`text-[11px] tabular-nums ${active ? "text-accent" : "text-text-secondary"}`}
                >
                  {t.count}
                </span>
              )}
              {t.dot && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                  aria-label="updates"
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
