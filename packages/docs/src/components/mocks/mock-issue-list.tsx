import { Badge } from "@groffee/ui";
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

export function MockIssueList() {
  const open = issues.filter((i) => i.state === "open").length;
  const closed = issues.filter((i) => i.state === "closed").length;

  return (
    <BrowserChrome url="groffee.example.com/gabrielcsapo/groffee/issues">
      <div className="bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center gap-4 text-xs">
          <span className="text-text-primary font-medium">{open} Open</span>
          <span className="text-text-secondary">{closed} Closed</span>
        </div>
        <div className="divide-y divide-border">
          {issues.map((issue) => (
            <div key={issue.number} className="px-4 py-3 flex items-start gap-3 text-sm">
              <svg
                className={`w-4 h-4 mt-0.5 shrink-0 ${issue.state === "open" ? "text-success" : "text-merged"}`}
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
                    <Badge key={l} variant="public">
                      {l}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  #{issue.number} opened {issue.age} by {issue.author}
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
