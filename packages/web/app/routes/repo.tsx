import { Link } from "react-router";
import {
  getRepo,
  getRepoTree,
  getRepoRefs,
  getRepoBlob,
  getRepoCommits,
  getRepoLanguages,
} from "../lib/server/repos";
import { CloneUrl } from "../components/clone-url";
import { BranchSwitcher } from "../components/branch-switcher";
import {
  FileSearchProvider,
  FileSearchButton,
} from "../components/file-search";
import { renderMarkdown } from "../lib/markdown";

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

export default async function Repo({
  params,
}: {
  params: { owner: string; repo: string };
}) {
  const { owner, repo: repoName } = params;

  const repoData = await getRepo(owner, repoName);

  if (repoData.error) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">
            Repository not found
          </h1>
        </div>
      </div>
    );
  }

  const repository = repoData.repository!;
  const defaultBranch = repository.defaultBranch;

  const [treeData, refsData, commitsData, langData] = await Promise.all([
    getRepoTree(owner, repoName, defaultBranch),
    getRepoRefs(owner, repoName),
    getRepoCommits(owner, repoName, defaultBranch, { limit: 1 }),
    getRepoLanguages(owner, repoName),
  ]);

  const ref = treeData.ref || defaultBranch;
  const entries = treeData.entries || [];
  const branches = (refsData.refs || []).filter(
    (r: { type: string }) => r.type === "branch",
  );
  const tags = (refsData.refs || []).filter(
    (r: { type: string }) => r.type === "tag",
  );
  const clonePath = `/${owner}/${repoName}.git`;
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
    const blobData = await getRepoBlob(
      owner,
      repoName,
      `${ref}/${readmeEntry.path}`,
    );
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
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Actions bar */}
          {branches.length > 0 && (
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <BranchSwitcher
                  branches={branches}
                  currentRef={ref}
                  basePath={`/${owner}/${repoName}`}
                />
                <Link
                  to={`/${owner}/${repoName}/commits/${ref}`}
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
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  {branches.length} branch{branches.length !== 1 ? "es" : ""}
                </Link>
                {tags.length > 0 && (
                  <span className="flex items-center gap-1 text-sm text-text-secondary">
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
                  </span>
                )}
              </div>
              <div className="w-56">
                <FileSearchButton />
              </div>
            </div>
          )}

          {/* File tree */}
          {entries.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden bg-surface">
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
                      className="text-text-secondary hover:text-text-link hover:underline truncate"
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
                      dateTime={new Date(
                        latestCommit.author.timestamp * 1000,
                      ).toISOString()}
                      title={new Date(
                        latestCommit.author.timestamp * 1000,
                      ).toLocaleString()}
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

              <table className="w-full text-sm">
                <tbody>
                  {entries.map(
                    (
                      entry: {
                        name: string;
                        path: string;
                        type: string;
                        oid: string;
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
                          </Link>
                        </td>
                        <td className="py-2 px-4 truncate max-w-xs">
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
                              dateTime={new Date(
                                entry.lastCommit.timestamp * 1000,
                              ).toISOString()}
                              title={new Date(
                                entry.lastCommit.timestamp * 1000,
                              ).toLocaleString()}
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
          ) : (
            <div className="border border-border rounded-lg p-10 text-center bg-surface">
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
              <p className="text-sm text-text-secondary mb-4">
                Push some code to get started:
              </p>
              <pre className="text-left bg-surface-secondary p-4 rounded-md border border-border text-sm overflow-x-auto font-mono text-text-primary">
                git remote add origin <CloneUrl path={clonePath} />
                {"\n"}git push -u origin main
              </pre>
            </div>
          )}

          {/* README */}
          {readmeHtml && readmeFileName && (
            <div className="border border-border rounded-lg overflow-hidden bg-surface mt-4">
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
                <span className="text-sm font-medium text-text-primary">
                  {readmeFileName}
                </span>
              </div>
              <div
                className="markdown-body px-6 py-5"
                dangerouslySetInnerHTML={{ __html: readmeHtml }}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 hidden lg:block">
          {/* About section */}
          <div className="border-b border-border pb-4 mb-4">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              About
            </h3>
            {repository.description ? (
              <p className="text-sm text-text-secondary mb-3">
                {repository.description}
              </p>
            ) : (
              <p className="text-sm text-text-tertiary italic mb-3">
                No description provided
              </p>
            )}
            <div className="space-y-2.5 text-sm">
              {readmeFileName && (
                <a
                  href="#readme"
                  className="flex items-center gap-2 text-text-secondary hover:text-text-link"
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
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  Readme
                </a>
              )}
              {licenseEntry && (
                <Link
                  to={`/${owner}/${repoName}/blob/${ref}/${licenseEntry.path}`}
                  className="flex items-center gap-2 text-text-secondary hover:text-text-link"
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
                      d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                    />
                  </svg>
                  License
                </Link>
              )}
              <Link
                to={`/${owner}/${repoName}/activity`}
                className="flex items-center gap-2 text-text-secondary hover:text-text-link"
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
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                Activity
              </Link>
            </div>
          </div>

          {/* Clone section */}
          <div className="border-b border-border pb-4 mb-4">
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Clone
            </h3>
            <CloneUrl path={clonePath} />
          </div>

          {/* Languages */}
          {languages.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-text-primary mb-3">
                Languages
              </h3>
              {/* Color bar */}
              <div className="flex w-full rounded-full overflow-hidden mb-3" style={{ height: "10px" }}>
                {languages.map((lang) => (
                  <div
                    key={lang.name}
                    style={{
                      width: `${lang.percentage}%`,
                      minWidth: "3px",
                      height: "100%",
                      backgroundColor: lang.color,
                    }}
                    title={`${lang.name} ${lang.percentage}%`}
                  />
                ))}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {languages.map((lang) => (
                  <div key={lang.name} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: lang.color }}
                    />
                    <span className="text-text-primary font-medium">
                      {lang.name}
                    </span>
                    <span className="text-text-secondary">
                      {lang.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </FileSearchProvider>
  );
}
