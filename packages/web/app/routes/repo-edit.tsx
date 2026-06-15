import { getRepoBlob, getRepoRefs } from "../lib/server/repos";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { getSessionUser } from "../lib/server/session";
import RepoEditClient from "./repo-edit.client";

export default async function RepoEdit({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName } = params as { owner: string; repo: string };
  const splat = params!.splat || "";

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Sign in required</h1>
          <p className="text-sm text-text-secondary mt-2">You must be signed in to edit files.</p>
        </div>
      </div>
    );
  }

  const [blobData, refsData, editCtx] = await Promise.all([
    getRepoBlob(owner, repoName, splat),
    getRepoRefs(owner, repoName),
    getRepoEditContext(owner, repoName),
  ]);

  if ("error" in editCtx) {
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

  if ("error" in blobData || blobData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">File not found</h1>
          <p className="text-sm text-text-secondary mt-2">
            {(blobData as { error?: string }).error}
          </p>
        </div>
      </div>
    );
  }

  const data = blobData as {
    content: string | null;
    ref: string;
    path: string;
    isBinary?: boolean;
    size?: number;
    lfsPointer?: { oid: string; size: number; stored: boolean };
  };

  // Refuse editing binary or LFS-backed content via the in-browser editor.
  if (data.isBinary || data.lfsPointer) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Cannot edit this file</h1>
          <p className="text-sm text-text-secondary mt-2">
            Binary files and Git LFS objects can&apos;t be edited in the browser.
          </p>
        </div>
      </div>
    );
  }

  // Refuse files larger than 1 MB.
  const sizeBytes =
    typeof data.size === "number" ? data.size : data.content ? data.content.length : 0;
  if (sizeBytes > 1024 * 1024) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">File too large</h1>
          <p className="text-sm text-text-secondary mt-2">
            Files over 1&nbsp;MB can&apos;t be edited in the browser.
          </p>
        </div>
      </div>
    );
  }

  const branches = (refsData.refs || []).filter((r: { type: string }) => r.type === "branch");

  return (
    <RepoEditClient
      owner={owner}
      repoName={repoName}
      refName={data.ref}
      path={data.path}
      initialContent={data.content || ""}
      editPolicy={editCtx.editPolicy}
      defaultBranch={editCtx.defaultBranch}
      branchExists={branches.some((b: { name: string }) => b.name === data.ref)}
    />
  );
}
