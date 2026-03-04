import { Link } from "react-flight-router/client";
import { getRepoCommit } from "../lib/server/repos";
import { CommitDiffView } from "./repo-commit.client";

export default async function RepoCommit({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName, sha } = params as { owner: string; repo: string; sha: string };

  const data = await getRepoCommit(owner, repoName, sha);

  if (data.error) {
    return (
      <div className="max-w-5xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Commit not found</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    );
  }

  const commit = data.commit!;
  const diff = data.diff;

  const diffFiles = diff ?? [];

  return (
    <div className="max-w-6xl mx-auto mt-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-lg mb-4">
        <Link to={`/${owner}`} className="text-text-link hover:underline">
          {owner}
        </Link>
        <span className="text-text-secondary">/</span>
        <Link to={`/${owner}/${repoName}`} className="text-text-link hover:underline">
          {repoName}
        </Link>
        <span className="text-text-secondary">/</span>
        <span className="text-text-primary">commit</span>
        <span className="text-text-secondary">/</span>
        <span className="font-semibold text-text-primary font-mono text-sm">{sha.slice(0, 7)}</span>
      </div>

      {/* Commit info */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h1 className="text-xl font-semibold text-text-primary mb-2">
          {commit.message.split("\n")[0]}
        </h1>
        {commit.message.includes("\n") && (
          <pre className="text-sm text-text-secondary whitespace-pre-wrap mb-3">
            {commit.message.split("\n").slice(1).join("\n").trim()}
          </pre>
        )}
        <div className="flex items-center gap-3 text-sm text-text-secondary border-t border-border pt-3 mt-3">
          <span className="font-medium text-text-primary">{commit.author.name}</span>
          <span>committed {new Date(commit.author.timestamp * 1000).toLocaleString()}</span>
        </div>
        <div className="mt-2">
          <code className="text-xs bg-surface-secondary px-2 py-1 rounded border border-border text-text-secondary font-mono">
            {sha}
          </code>
        </div>
      </div>

      {/* Diff */}
      {diffFiles.length > 0 ? (
        <CommitDiffView diff={diffFiles} />
      ) : (
        <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
          {commit.parents.length === 0 ? "Initial commit — no diff available." : "No changes."}
        </div>
      )}
    </div>
  );
}
