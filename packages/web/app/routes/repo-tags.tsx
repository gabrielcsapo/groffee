import { Link } from "react-flight-router/client";
import { getRepoTags } from "../lib/server/repos";
import { RepoTagsLoadMore } from "./repo-tags.client";

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

export default async function RepoTags({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName } = params as { owner: string; repo: string };

  const result = await getRepoTags(owner, repoName, { limit: 30 });

  if ("error" in result) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Repository not found</h1>
          <p className="text-sm text-text-secondary mt-2">{result.error}</p>
        </div>
      </div>
    );
  }

  const { tags, nextCursor } = result;

  return (
    <div className="max-w-6xl mx-auto mt-8">
      <h1 className="text-xl font-semibold text-text-primary mb-4">Tags</h1>

      {tags.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center bg-surface">
          <p className="text-sm text-text-primary font-medium">No tags yet</p>
          <p className="text-xs text-text-secondary mt-1">
            Push tags to this repository to see them here.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          <ul>
            {tags.map((tag, i) => (
              <li
                key={tag.name}
                className={`px-4 py-3 flex items-start justify-between gap-4 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/${owner}/${repoName}/tree/${encodeURIComponent(tag.name)}`}
                      className="text-text-link font-medium hover:underline flex items-center gap-1.5"
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
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      {tag.name}
                    </Link>
                    <Link
                      to={`/${owner}/${repoName}/commit/${tag.commitOid}`}
                      className="text-xs font-mono text-text-link hover:underline"
                    >
                      {tag.shortOid}
                    </Link>
                  </div>
                  {tag.subject && (
                    <p className="text-sm text-text-secondary mt-1 truncate">{tag.subject}</p>
                  )}
                  <p className="text-xs text-text-secondary mt-1">
                    {tag.authorName}{" "}
                    <time
                      dateTime={new Date(tag.authorTimestamp * 1000).toISOString()}
                      title={new Date(tag.authorTimestamp * 1000).toLocaleString()}
                    >
                      {formatRelativeDate(tag.authorTimestamp)}
                    </time>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Link
                    to={`/${owner}/${repoName}/commits/${encodeURIComponent(tag.name)}`}
                    className="text-xs text-text-link hover:underline"
                  >
                    Commits
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextCursor && <RepoTagsLoadMore owner={owner} repo={repoName} initialCursor={nextCursor} />}
    </div>
  );
}
