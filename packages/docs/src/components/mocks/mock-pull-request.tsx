import { useState } from "react";
import { StatusPill } from "@groffee/ui";
import { BrowserChrome } from "./browser-chrome";
import { MockHeader, MockRepoSubNav } from "./_chrome";

/**
 * Interactive PR mock. Visually 1:1 with the live product's PR detail
 * page — full chrome header (Wordmark + search pill + nav + icons),
 * repo sub-nav, PR title row, Title Case sans tab strip, and three
 * panels (Conversation / Files changed / Commits) that swap via local
 * state.
 *
 * Drift control: status pill renders through `<StatusPill>` from
 * @groffee/ui, wordmark via `<Wordmark>`, and diff colors via the same
 * `--color-diff-add-bg` / `--color-diff-del-bg` tokens the product
 * consumes. When any of those tokens or components change, this mock
 * tracks them automatically.
 */

type Tab = "conversation" | "files" | "commits";

// ── PR tab strip ───────────────────────────────────────────────────────────

function prTabClass(active: boolean) {
  return `px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors ${
    active
      ? "border-accent text-text-primary"
      : "border-transparent text-text-secondary hover:text-text-primary"
  }`;
}

// ── Tab content panels ─────────────────────────────────────────────────────

function ConversationPanel() {
  return (
    <div className="space-y-3">
      {/* Comment card — header strip + markdown body, same pattern the live
       * pull-conversation renders. */}
      <div className="border border-border rounded-md bg-surface">
        <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-mono font-medium">
            G
          </span>
          <span className="font-bold text-text-primary">gabrielcsapo</span>
          <span className="text-text-secondary text-xs">(edited)</span>
        </div>
        <div className="px-4 py-3 text-sm text-text-primary leading-relaxed space-y-3">
          <div>
            <h4 className="text-base font-semibold mb-1.5">Summary</h4>
            <ul className="list-disc ml-5 space-y-0.5 text-text-secondary">
              <li>
                Add{" "}
                <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs font-mono">
                  ONBOARDING.md
                </code>{" "}
                covering clone / install / first-PR flow.
              </li>
              <li>
                Add{" "}
                <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs font-mono">
                  CONTRIBUTING.md
                </code>{" "}
                documenting branch naming, commit hygiene, and PR expectations.
              </li>
              <li>
                Link both from{" "}
                <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs font-mono">
                  README.md
                </code>
                .
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-base font-semibold mb-1.5">Why</h4>
            <p className="text-text-secondary">
              This is the seed PR for exercising Groffee&apos;s PR review surfaces (inline diff
              comments, threaded review, merge/squash, CI badge) on a real repository.
            </p>
          </div>
          <div>
            <h4 className="text-base font-semibold mb-1.5">Test plan</h4>
            <ul className="ml-5 space-y-0.5 text-text-secondary">
              <li className="flex items-start gap-2">
                <input type="checkbox" disabled className="mt-1" />
                <span>
                  Render README on{" "}
                  <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs font-mono">
                    main
                  </code>{" "}
                  after merge and confirm CONTRIBUTING link resolves.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" disabled className="mt-1" />
                <span>Confirm files-changed shows all three diffs.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Checks card — header strip pattern matches live. */}
      <div className="border border-border rounded-md bg-surface">
        <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary">
          Checks
        </div>
        <div className="px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-text-secondary">
            No pipelines have run on{" "}
            <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs font-mono">
              feature/onboarding
            </code>{" "}
            yet.
          </span>
          <span className="text-text-link text-xs whitespace-nowrap">Configure pipelines →</span>
        </div>
      </div>
    </div>
  );
}

interface DiffLine {
  kind: "add" | "remove" | "context" | "hunk";
  oldNum?: number;
  newNum?: number;
  text: string;
}

interface DiffFile {
  path: string;
  status: "added" | "modified";
  added: number;
  removed: number;
  hunks: DiffLine[];
}

// Real diff content pulled from `playground/pull/1` so the mock reads as
// the same artifact rendered in two places — not a contrived example.
const files: DiffFile[] = [
  {
    path: "CONTRIBUTING.md",
    status: "added",
    added: 17,
    removed: 0,
    hunks: [
      { kind: "hunk", text: "@@ -0,0 +1,17 @@" },
      { kind: "add", newNum: 1, text: "# Contributing" },
      { kind: "add", newNum: 2, text: "" },
      { kind: "add", newNum: 3, text: "## Branching" },
      { kind: "add", newNum: 4, text: "" },
      { kind: "add", newNum: 5, text: "- Branch from `main`." },
      {
        kind: "add",
        newNum: 6,
        text: "- Use the prefix `feature/`, `fix/`, or `chore/` followed by a short slug.",
      },
      { kind: "add", newNum: 7, text: "" },
      { kind: "add", newNum: 8, text: "## Commits" },
      { kind: "add", newNum: 9, text: "" },
      { kind: "add", newNum: 10, text: "- One logical change per commit." },
      { kind: "add", newNum: 11, text: "- Reference issues in the body, not the subject line." },
      { kind: "add", newNum: 12, text: "" },
      { kind: "add", newNum: 13, text: "## Pull requests" },
      { kind: "add", newNum: 14, text: "" },
      { kind: "add", newNum: 15, text: "- Open early. Mark as draft if work is in progress." },
      { kind: "add", newNum: 16, text: "- One reviewer minimum before merge." },
      { kind: "add", newNum: 17, text: "- Squash on merge to keep `main` linear." },
    ],
  },
  { path: "ONBOARDING.md", status: "added", added: 18, removed: 0, hunks: [] },
  { path: "README.md", status: "modified", added: 4, removed: 0, hunks: [] },
];

function diffLineBg(kind: DiffLine["kind"]) {
  if (kind === "add") return "bg-diff-add-bg";
  if (kind === "remove") return "bg-diff-del-bg";
  if (kind === "hunk") return "bg-surface-secondary text-text-secondary";
  return "";
}

/**
 * Tiny markdown "syntax highlighter" — just enough to make the mock look
 * like Shiki ran over it. Tints `# heading` / `## heading` lines, inline
 * `` `code` `` spans, and markdown list dashes. The real product uses
 * Shiki server-side; this hand-tinted approximation reads as the same
 * surface without bundling Shiki in the docs build.
 */
function renderMarkdownDiffLine(text: string) {
  // Heading lines
  const headingMatch = /^(#+)\s(.+)$/.exec(text);
  if (headingMatch) {
    return (
      <>
        <span className="text-info">{headingMatch[1]} </span>
        <span className="text-info font-medium">{headingMatch[2]}</span>
      </>
    );
  }
  // Tokenize on backticks so inline code can pop.
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <span key={i} className="text-accent">
              {p}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function FilesPanel() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const active = files[activeIdx];

  return (
    <div className="flex gap-4">
      {/* Left rail — file list with filter + per-file stats. Matches the
       * live product's `DiffSidebar`. */}
      <aside className="w-56 shrink-0">
        <div className="border border-border rounded-md bg-surface overflow-hidden">
          <div className="px-3 py-2 bg-surface-secondary border-b border-border text-xs font-medium text-text-secondary">
            {files.length} files changed
          </div>
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Filter files..."
              disabled
              className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded text-text-primary placeholder:text-text-secondary"
            />
          </div>
          <ul>
            {files.map((f, i) => {
              const isActive = i === activeIdx;
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 border-b border-border/50 last:border-b-0 ${
                      isActive
                        ? "bg-selected-bg text-selected-text"
                        : "hover:bg-surface-secondary text-text-primary"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        f.status === "added" ? "bg-success" : "bg-warning"
                      }`}
                    />
                    <span className="truncate flex-1">{f.path}</span>
                    <span className="text-[10px] font-medium text-diff-add-text">+{f.added}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Right column — active file diff. */}
      <div className="flex-1 min-w-0 border border-border rounded-md bg-surface overflow-hidden">
        <div className="px-3 py-2 bg-surface-secondary border-b border-border flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand file" : "Collapse file"}
            className="text-text-secondary hover:text-text-primary p-0.5 -ml-1"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
              className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
            >
              <path d="M4 6l4 4 4-4H4z" />
            </svg>
          </button>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-diff-add-bg text-diff-add-text">
            {active.status}
          </span>
          <span className="font-mono font-medium text-text-primary truncate">{active.path}</span>
          <span className="ml-auto flex items-center gap-3 font-mono shrink-0">
            <span className="text-diff-add-text">+{active.added}</span>
            <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
              <input type="checkbox" disabled className="w-3.5 h-3.5 accent-action" />
              Viewed
            </label>
          </span>
        </div>
        {!collapsed && active.hunks.length > 0 && (
          <div className="font-mono text-[11px]">
            {active.hunks.map((l, i) => {
              if (l.kind === "hunk") {
                return (
                  <div key={i} className="px-4 py-1 bg-surface-secondary text-text-secondary">
                    {l.text}
                  </div>
                );
              }
              return (
                <div key={i} className={`flex ${diffLineBg(l.kind)}`}>
                  <span className="w-8 shrink-0 text-right pr-1.5 text-text-secondary/60 select-none tabular-nums">
                    {l.oldNum ?? ""}
                  </span>
                  <span className="w-8 shrink-0 text-right pr-1.5 text-text-secondary/60 select-none tabular-nums border-r border-border/40">
                    {l.newNum ?? ""}
                  </span>
                  <span className="w-4 shrink-0 text-center text-text-secondary select-none">
                    {l.kind === "add" ? "+" : l.kind === "remove" ? "-" : " "}
                  </span>
                  <span className="flex-1 whitespace-pre py-0.5 pr-2 text-text-primary">
                    {renderMarkdownDiffLine(l.text)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!collapsed && active.hunks.length === 0 && (
          <div className="px-4 py-6 text-xs text-text-secondary text-center">
            Click a file in the rail to view its diff.
          </div>
        )}
      </div>
    </div>
  );
}

function CIDot({ status }: { status: "success" | "failure" | "running" }) {
  const cls =
    status === "success"
      ? "border-success/40 text-success bg-success/15"
      : status === "failure"
        ? "border-danger/40 text-danger bg-danger/15"
        : "border-warning/40 text-warning bg-warning/15";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

const commits = [
  {
    sha: "5d85c95",
    title: "Add contributing guide and link from README",
    author: "gabrielcsapo",
    age: "1 day ago",
  },
  { sha: "b673c16", title: "Add onboarding guide", author: "gabrielcsapo", age: "1 day ago" },
];

function CommitsPanel() {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-surface">
      <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary">
        2 commits
      </div>
      <ul className="divide-y divide-border">
        {commits.map((c) => (
          <li key={c.sha} className="px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-mono font-medium shrink-0">
              {c.author[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">{c.title}</div>
              <div className="text-xs text-text-secondary mt-0.5">
                {c.author} committed {c.age}
              </div>
            </div>
            <CIDot status="success" />
            <code className="text-[10px] font-mono text-text-secondary bg-surface-secondary border border-border rounded px-2 py-1">
              {c.sha}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Mock root ──────────────────────────────────────────────────────────────

export function MockPullRequest() {
  const [tab, setTab] = useState<Tab>("conversation");

  return (
    <BrowserChrome url="groffee.local/gabrielcsapo/playground/pull/1">
      <div className="bg-canvas">
        <MockHeader />
        <MockRepoSubNav />

        <div className="px-5 pb-6 max-w-[1180px] mx-auto">
          {/* PR title + meta row */}
          <div className="mt-6 mb-6">
            <h1 className="text-2xl font-semibold text-text-primary mb-2">
              Add onboarding and contributing guides!{" "}
              <span className="text-text-secondary font-normal">#1</span>
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusPill state="open" />
              <span className="text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">gabrielcsapo</span> wants to merge
                <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                  feature/onboarding
                </code>
                into
                <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                  main
                </code>
              </span>
              <span className="text-xs text-text-secondary">(edited)</span>
            </div>
          </div>

          {/* Tab strip — Title Case sans, amber underline (matches live). */}
          <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "conversation"}
              onClick={() => setTab("conversation")}
              className={prTabClass(tab === "conversation")}
            >
              Conversation
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "files"}
              onClick={() => setTab("files")}
              className={prTabClass(tab === "files")}
            >
              Files changed (3)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "commits"}
              onClick={() => setTab("commits")}
              className={prTabClass(tab === "commits")}
            >
              Commits (2)
            </button>
          </div>

          {/* Active panel */}
          {tab === "conversation" && <ConversationPanel />}
          {tab === "files" && <FilesPanel />}
          {tab === "commits" && <CommitsPanel />}
        </div>
      </div>
    </BrowserChrome>
  );
}
