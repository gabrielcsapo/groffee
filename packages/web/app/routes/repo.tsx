import { Link } from "react-flight-router/client";
import {
  getRepo,
  getRepoTree,
  getRepoRefs,
  getRepoBlob,
  getRepoCommits,
  getRepoLanguages,
} from "../lib/server/repos";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { CloneUrl } from "@groffee/ui";
import { BranchSwitcherWrapper as BranchSwitcher } from "../components/branch-switcher-wrapper.client";
import { FileSearchProvider, FileSearchButton } from "../components/file-search";
import { renderMarkdown } from "../lib/markdown";
import { getSessionUser } from "../lib/server/auth";
import { RepoAboutSidebar } from "../components/repo-about-sidebar";
import { MarkdownCopyButtons } from "../components/markdown-copy-buttons.client";

function formatRelativeDate(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

export default async function Repo({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName } = params as { owner: string; repo: string };

  // Parallelize session lookup with repo fetch to avoid waterfall
  const [repoData, sessionUser] = await Promise.all([getRepo(owner, repoName), getSessionUser()]);

  if (repoData.error) {
    return (
      <div className="max-w-6xl min-w-0 mx-auto mt-4 sm:mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Repository not found</h1>
        </div>
      </div>
    );
  }

  const repository = repoData.repository!;
  const defaultBranch = repository.defaultBranch;

  const [treeData, refsData, commitsData, langData, editCtx] = await Promise.all([
    getRepoTree(owner, repoName, defaultBranch),
    getRepoRefs(owner, repoName),
    getRepoCommits(owner, repoName, defaultBranch, { limit: 1 }),
    getRepoLanguages(owner, repoName),
    getRepoEditContext(owner, repoName),
  ]);
  const canWrite = "canWrite" in editCtx ? editCtx.canWrite : false;

  const ref = treeData.ref || defaultBranch;
  const entries = treeData.entries || [];
  const hasLfs = (treeData as { hasLfs?: boolean }).hasLfs || false;
  const branches = (refsData.refs || []).filter((r: { type: string }) => r.type === "branch");
  const tags = (refsData.refs || []).filter((r: { type: string }) => r.type === "tag");
  const clonePath = `/${owner}/${repoName}.git`;
  const isOwner = sessionUser?.username === owner;
  const latestCommit = commitsData.commits?.[0] || null;
  const languages = langData.languages || [];

  // Detect special files
  const readmeEntry = entries.find(
    (e: { name: string; type: string }) =>
      e.type === "blob" && /^readme(\.(md|txt|markdown|rst))?$/i.test(e.name),
  );
  const licenseEntry = entries.find(
    (e: { name: string; type: string }) =>
      e.type === "blob" && /^licen[sc]e(\.(md|txt))?$/i.test(e.name),
  );

  let readmeHtml: string | null = null;
  let readmeFileName: string | null = null;
  if (readmeEntry) {
    const blobData = await getRepoBlob(owner, repoName, `${ref}/${readmeEntry.path}`);
    if (blobData.content) {
      readmeFileName = readmeEntry.name;
      const ext = readmeEntry.name.split(".").pop()?.toLowerCase();
      if (ext === "md" || ext === "markdown") {
        readmeHtml = renderMarkdown(blobData.content);
      } else {
        readmeHtml = `<pre>${blobData.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
      }
    }
  }

  return (
    <FileSearchProvider owner={owner} repo={repoName} currentRef={ref}>
      <div className="max-w-6xl mx-auto mt-8">
        <div className="flex flex-col xl:flex-row gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Actions bar */}
            {branches.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <BranchSwitcher
                    branches={branches}
                    tags={tags}
                    currentRef={ref}
                    basePath={`/${owner}/${repoName}`}
                    mode="tree"
                  />
                  <Link
                    to={`/${owner}/${repoName}/commits/${ref}`}
                    className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-link hover:no-underline"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                    {branches.length} branch{branches.length !== 1 ? "es" : ""}
                  </Link>
                  {tags.length > 0 && (
                    <Link
                      to={`/${owner}/${repoName}/tags`}
                      className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-link hover:no-underline"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      {tags.length} tag{tags.length !== 1 ? "s" : ""}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {canWrite && (
                    <Link to={`/${owner}/${repoName}/new/${ref}`} className="btn-secondary btn-sm">
                      Add file
                    </Link>
                  )}
                  <div className="w-56">
                    <FileSearchButton />
                  </div>
                </div>
              </div>
            )}

            {/* File tree */}
            {entries.length > 0 ? (
              <div className="border border-border rounded-lg overflow-x-auto bg-surface">
                {/* Last commit header */}
                {latestCommit && (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-surface-secondary border-b border-border text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Link
                        to={`/${owner}/${repoName}/commits/${ref}?author=${encodeURIComponent(latestCommit.author.email)}`}
                        className="font-medium text-text-primary hover:text-text-link hover:underline flex-shrink-0"
                      >
                        {latestCommit.author.name}
                      </Link>
                      <Link
                        to={`/${owner}/${repoName}/commit/${latestCommit.oid}`}
                        className="text-text-secondary hover:text-text-link hover:underline truncate hidden sm:inline"
                      >
                        {latestCommit.message.split("\n")[0]}
                      </Link>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <Link
                        to={`/${owner}/${repoName}/commit/${latestCommit.oid}`}
                        className="text-text-link hover:underline font-mono text-xs"
                      >
                        {latestCommit.oid.slice(0, 7)}
                      </Link>
                      <time
                        className="text-text-secondary whitespace-nowrap"
                        dateTime={new Date(latestCommit.author.timestamp * 1000).toISOString()}
                        title={new Date(latestCommit.author.timestamp * 1000).toLocaleString()}
                      >
                        {formatRelativeDate(latestCommit.author.timestamp)}
                      </time>
                      <Link
                        to={`/${owner}/${repoName}/commits/${ref}`}
                        className="flex items-center gap-1 text-text-secondary hover:text-text-link hover:no-underline whitespace-nowrap"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Commits
                      </Link>
                    </div>
                  </div>
                )}

                <table className="w-full min-w-[640px] text-sm">
                  <tbody>
                    {entries.map(
                      (
                        entry: {
                          name: string;
                          path: string;
                          type: string;
                          oid: string;
                          isLfs?: boolean;
                          lastCommit: {
                            oid: string;
                            message: string;
                            timestamp: number;
                          } | null;
                        },
                        i: number,
                      ) => (
                        <tr
                          key={entry.oid}
                          className={`hover:bg-surface-secondary ${i < entries.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <td className="py-2 px-4 whitespace-nowrap">
                            <Link
                              to={`/${owner}/${repoName}/${entry.type === "tree" ? "tree" : "blob"}/${ref}/${entry.path}`}
                              className="text-text-link hover:underline flex items-center gap-2"
                            >
                              {entry.type === "tree" ? (
                                <svg
                                  className="w-4 h-4 text-text-link"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                              ) : (
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
                              )}
                              {entry.name}
                              {entry.isLfs && (
                                <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-600">
                                  LFS
                                </span>
                              )}
                            </Link>
                          </td>
                          {/* Last-commit message — hidden on small screens to
                              keep the row from wrapping; the file name and the
                              age remain visible. */}
                          <td className="py-2 px-4 truncate max-w-xs hidden sm:table-cell">
                            {entry.lastCommit && (
                              <Link
                                to={`/${owner}/${repoName}/commit/${entry.lastCommit.oid}`}
                                className="text-text-secondary hover:text-text-link hover:underline"
                              >
                                {entry.lastCommit.message}
                              </Link>
                            )}
                          </td>
                          <td className="py-2 px-4 text-text-secondary whitespace-nowrap text-right">
                            {entry.lastCommit && (
                              <time
                                dateTime={new Date(entry.lastCommit.timestamp * 1000).toISOString()}
                                title={new Date(entry.lastCommit.timestamp * 1000).toLocaleString()}
                              >
                                {formatRelativeDate(entry.lastCommit.timestamp)}
                              </time>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : isOwner ? (
              <div className="space-y-4">
                {/* Quick setup */}
                <div className="border border-border rounded-lg overflow-hidden bg-surface">
                  <div className="flex items-center gap-2 px-4 py-3 bg-surface-secondary border-b border-border">
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-text-primary">Quick setup</span>
                    <span className="text-xs text-text-secondary">
                      — get started by cloning or pushing to this repository
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <CloneUrl path={clonePath} hasLfs={hasLfs} />
                  </div>
                </div>

                {/* Create new repo on command line */}
                <div className="border border-border rounded-lg overflow-hidden bg-surface">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-text-primary">
                      Create a new repository on the command line
                    </h3>
                  </div>
                  <div className="px-4 py-3">
                    <pre className="text-sm font-mono text-text-primary bg-surface-secondary rounded-md p-4 overflow-x-auto leading-relaxed">
                      {`echo "# ${repoName}" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin `}
                      <CloneUrl path={clonePath} inline />
                      {`
git push -u origin main`}
                    </pre>
                  </div>
                </div>

                {/* Push existing repo */}
                <div className="border border-border rounded-lg overflow-hidden bg-surface">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-text-primary">
                      Push an existing repository from the command line
                    </h3>
                  </div>
                  <div className="px-4 py-3">
                    <pre className="text-sm font-mono text-text-primary bg-surface-secondary rounded-md p-4 overflow-x-auto leading-relaxed">
                      {`git remote add origin `}
                      <CloneUrl path={clonePath} inline />
                      {`
git branch -M main
git push -u origin main`}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-border rounded-lg p-12 text-center bg-surface">
                <svg
                  className="w-12 h-12 mx-auto text-text-secondary mb-4"
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
                <h3 className="text-base font-semibold text-text-primary mb-1">
                  This repository is empty
                </h3>
                <p className="text-sm text-text-secondary">The owner hasn't pushed any code yet.</p>
              </div>
            )}

            {/* README */}
            {readmeHtml && readmeFileName && (
              <div
                id="readme"
                className="border border-border rounded-lg overflow-hidden bg-surface mt-4 scroll-mt-20"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-surface-secondary border-b border-border">
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
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">{readmeFileName}</span>
                </div>
                <MarkdownCopyButtons className="markdown-body px-6 py-5" html={readmeHtml} />
              </div>
            )}
          </div>

          <RepoAboutSidebar
            owner={owner}
            repo={repoName}
            description={repository.description}
            readmePath={readmeEntry?.path ?? null}
            licensePath={licenseEntry?.path ?? null}
            readmeAnchor
            gitRef={ref}
            languages={languages}
            hasLfs={hasLfs}
          />
        </div>
      </div>
    </FileSearchProvider>
  );
}
