import { BrowserChrome } from "./browser-chrome";

interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  comments: number;
  author: string;
  age: string;
}

const issues: Issue[] = [
  {
    number: 14,
    title: "Add LFS garbage collection",
    state: "open",
    labels: ["enhancement", "lfs"],
    comments: 3,
    author: "alice",
    age: "2 days ago",
  },
  {
    number: 13,
    title: "SSH host-key rotation docs are unclear",
    state: "open",
    labels: ["docs"],
    comments: 1,
    author: "bob",
    age: "5 days ago",
  },
  {
    number: 12,
    title: "Repo description not updating after edit",
    state: "open",
    labels: ["bug"],
    comments: 7,
    author: "carol",
    age: "1 week ago",
  },
  {
    number: 11,
    title: "Empty repos should show clone instructions",
    state: "closed",
    labels: ["enhancement"],
    comments: 2,
    author: "alice",
    age: "2 weeks ago",
  },
];

// Small label color map — the actual product lets users define label colors,
// but for the mock we hand-tint a few common categories so the visual reads
// as "real labels," not as identical neutral pills.
const LABEL_TINT: Record<string, string> = {
  bug: "bg-danger/10 text-danger border border-danger/25",
  enhancement: "bg-action/10 text-action border border-action/25",
  docs: "bg-info-bg text-info border border-info/25",
  lfs: "bg-accent/10 text-accent border border-accent/25",
};

function LabelChip({ label }: { label: string }) {
  const tint = LABEL_TINT[label] ?? "bg-surface-secondary text-text-secondary border border-border";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${tint}`}>{label}</span>
  );
}

export function MockIssueList() {
  const open = issues.filter((i) => i.state === "open").length;

  return (
    <BrowserChrome url="groffee.local/gabrielcsapo/groffee/issues">
      <div className="bg-surface">
        {/* Filter row — Open/Closed pill toggles + "New issue" CTA on the
         * right, mirroring the live product's `/repo/issues` header. */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-xs">
          <div className="inline-flex border border-border rounded-md overflow-hidden font-mono">
            <span className="bg-selected-bg text-selected-text px-3 py-1">{open} open</span>
            <span className="border-l border-border px-3 py-1 text-text-secondary">closed</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 bg-action text-white px-3 py-1 rounded-md text-xs font-medium">
            new issue
          </span>
        </div>
        <div className="divide-y divide-border">
          {issues.map((issue) => (
            <div key={issue.number} className="px-4 py-3 flex items-start gap-3 text-sm">
              <svg
                className={`w-4 h-4 mt-0.5 shrink-0 ${issue.state === "open" ? "text-success" : "text-text-secondary"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-primary truncate">{issue.title}</span>
                  {issue.labels.map((l) => (
                    <LabelChip key={l} label={l} />
                  ))}
                </div>
                <div className="text-xs text-text-secondary mt-0.5 font-mono">
                  #{issue.number} · opened {issue.age} by {issue.author}
                </div>
              </div>
              {issue.comments > 0 && (
                <div className="text-xs text-text-secondary shrink-0 flex items-center gap-1">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  {issue.comments}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}
