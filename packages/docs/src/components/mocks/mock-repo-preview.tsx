import { Wordmark, RepoNav, BranchSwitcher, Badge, CloneUrl } from "@groffee/ui";
import { BrowserChrome } from "./browser-chrome";

function FileIcon({ isDir }: { isDir?: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
      </svg>
    );
  }
  return (
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
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

const mockFiles = [
  { name: "packages", isDir: true, message: "feat: add git LFS support", time: "2 days ago" },
  { name: "scripts", isDir: true, message: "chore: update build scripts", time: "5 days ago" },
  { name: ".gitignore", isDir: false, message: "chore: ignore data directory", time: "1 week ago" },
  {
    name: "Dockerfile",
    isDir: false,
    message: "feat: multi-stage Docker build",
    time: "3 days ago",
  },
  {
    name: "package.json",
    isDir: false,
    message: "chore: updates to latest deps",
    time: "4 days ago",
  },
  {
    name: "README.md",
    isDir: false,
    message: "docs: update installation guide",
    time: "1 week ago",
  },
  {
    name: "tsconfig.base.json",
    isDir: false,
    message: "fix: strict mode for shared config",
    time: "2 weeks ago",
  },
];

export function MockRepoPreview() {
  return (
    <BrowserChrome url="groffee.local/gabrielcsapo/groffee">
      {/* Header — transparent over the canvas with a hairline border, same
       * as the live product's `root.tsx` chrome. The wordmark replaces the
       * old icon+text construction. */}
      <div className="bg-canvas px-4 h-12 flex items-center gap-5 border-b border-border">
        <Wordmark height={22} cupColor="var(--color-accent)" />
        <span className="ml-auto font-mono text-xs text-text-secondary">explore</span>
        <span className="font-mono text-xs text-text-secondary">docs</span>
      </div>

      <div className="p-4">
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2 font-mono text-sm">
            <FileIcon isDir />
            <span className="text-text-secondary">gabrielcsapo</span>
            <span className="text-text-secondary">/</span>
            <span className="font-semibold text-text-primary">groffee</span>
            <Badge variant="public">Public</Badge>
          </div>
          <p className="text-xs text-text-secondary mb-3">git, locally roasted.</p>
          <RepoNav
            owner="gabrielcsapo"
            repo="groffee"
            currentPath="/gabrielcsapo/groffee"
            openIssueCount={3}
            openPrCount={1}
          />
        </div>

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

        <div className="border border-border rounded-md overflow-hidden mt-3">
          <div className="divide-y divide-border">
            {mockFiles.map((file) => (
              <div key={file.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                <FileIcon isDir={file.isDir} />
                <span
                  className={`shrink-0 font-mono ${file.isDir ? "text-accent font-medium" : "text-text-primary"}`}
                >
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
