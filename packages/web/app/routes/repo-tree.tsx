import { Link } from "react-router";
import { getRepoTree, getRepoRefs } from "../lib/server/repos";
import { CloneUrl } from "../components/clone-url";
import { BranchSwitcher } from "../components/branch-switcher";

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

export default async function RepoTree({
  params,
}: {
  params: { owner: string; repo: string; "*": string };
}) {
  const { owner, repo: repoName } = params;
  const splat = params["*"] || "";

  const [treeData, refsData] = await Promise.all([
    getRepoTree(owner, repoName, splat),
    getRepoRefs(owner, repoName),
  ]);

  if (treeData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Path not found</h1>
          <p className="text-sm text-text-secondary mt-2">{treeData.error}</p>
        </div>
      </div>
    );
  }

  const { entries, ref, path: treePath } = treeData as { entries: NonNullable<typeof treeData.entries>; ref: string; path: string };
  const pathParts = treePath ? treePath.split("/") : [];
  const branches = (refsData.refs || []).filter((r: { type: string }) => r.type === "branch");
  const clonePath = `/${owner}/${repoName}.git`;

  return (
    <div className="max-w-4xl mx-auto mt-8">
      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {branches.length > 0 && (
            <BranchSwitcher
              branches={branches}
              currentRef={ref}
              basePath={`/${owner}/${repoName}`}
            />
          )}
          <Link
            to={`/${owner}/${repoName}/commits/${ref}`}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-link hover:no-underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Commits
          </Link>
          {branches.length > 0 && (
            <span className="text-sm text-text-secondary">
              {branches.length} branch{branches.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>
        <CloneUrl path={clonePath} />
      </div>

      {/* Breadcrumbs (when navigating into subdirectories) */}
      {treePath && (
        <div className="flex items-center gap-1.5 text-sm mb-4 text-text-secondary">
          <Link to={`/${owner}/${repoName}/tree/${ref}`} className="text-text-link hover:underline">
            {repoName}
          </Link>
          {pathParts.map((part: string, i: number) => {
            const partPath = pathParts.slice(0, i + 1).join("/");
            const isLast = i === pathParts.length - 1;
            return (
              <span key={partPath} className="flex items-center gap-1.5">
                <span>/</span>
                {isLast ? (
                  <span className="font-semibold text-text-primary">{part}</span>
                ) : (
                  <Link
                    to={`/${owner}/${repoName}/tree/${ref}/${partPath}`}
                    className="text-text-link hover:underline"
                  >
                    {part}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* File tree */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <table className="w-full text-sm">
          <tbody>
            {treePath && (
              <tr className="border-b border-border hover:bg-surface-secondary">
                <td className="py-2 px-4">
                  <Link
                    to={
                      pathParts.length > 1
                        ? `/${owner}/${repoName}/tree/${ref}/${pathParts.slice(0, -1).join("/")}`
                        : `/${owner}/${repoName}/tree/${ref}`
                    }
                    className="text-text-link hover:underline flex items-center gap-2"
                  >
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
                        d="M11 17l-5-5m0 0l5-5m-5 5h12"
                      />
                    </svg>
                    ..
                  </Link>
                </td>
                <td></td>
                <td></td>
              </tr>
            )}
            {entries.map(
              (
                entry: {
                  name: string;
                  path: string;
                  type: string;
                  oid: string;
                  lastCommit: { oid: string; message: string; timestamp: number } | null;
                },
                i: number,
              ) => (
                <tr
                  key={entry.oid}
                  className={`hover:bg-surface-secondary ${i < entries.length - 1 || treePath ? "border-b border-border" : ""}`}
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
    </div>
  );
}
