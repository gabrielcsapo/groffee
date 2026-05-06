import { getRepo, getRepoRefs } from "../lib/server/repos";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { getSessionUser } from "../lib/server/session";
import RepoNewFileClient from "./repo-new-file.client";

/**
 * The splat is "<ref>" or "<ref>/<pathPrefix>". We try to peel off the ref
 * by matching against the repo's known branches/tags; everything left over
 * is the directory the new file will live in.
 */
export default async function RepoNewFile({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName } = params as { owner: string; repo: string };
  const splat = params!.splat || "";

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Sign in required</h1>
          <p className="text-sm text-text-secondary mt-2">You must be signed in to create files.</p>
        </div>
      </div>
    );
  }

  const [repoData, refsData, editCtx] = await Promise.all([
    getRepo(owner, repoName),
    getRepoRefs(owner, repoName),
    getRepoEditContext(owner, repoName),
  ]);

  if ("error" in editCtx || repoData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Repository not found</h1>
        </div>
      </div>
    );
  }

  if (!editCtx.canWrite) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Permission denied</h1>
          <p className="text-sm text-text-secondary mt-2">
            You don&apos;t have write access to this repository.
          </p>
        </div>
      </div>
    );
  }

  const refs = refsData.refs || [];
  const refNames = new Set(refs.map((r: { name: string }) => r.name));

  let resolvedRef = editCtx.defaultBranch;
  let pathPrefix = "";

  if (splat) {
    const parts = splat.split("/");
    let matched = false;
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.has(candidate)) {
        resolvedRef = candidate;
        pathPrefix = parts.slice(i).join("/");
        matched = true;
        break;
      }
    }
    if (!matched && parts.length > 0) {
      // Treat the first segment as the ref name even if it doesn't appear in
      // the known list (newly-created branches from PR mode may not be there).
      resolvedRef = parts[0];
      pathPrefix = parts.slice(1).join("/");
    }
  }

  return (
    <RepoNewFileClient
      owner={owner}
      repoName={repoName}
      ref={resolvedRef}
      pathPrefix={pathPrefix}
      editPolicy={editCtx.editPolicy}
    />
  );
}
