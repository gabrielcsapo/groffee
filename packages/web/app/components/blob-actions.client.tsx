"use client";

import { useState } from "react";
import { Link } from "react-flight-router/client";

interface Props {
  owner: string;
  repoName: string;
  refName: string;
  path: string;
  canEdit: boolean;
}

export function BlobActions({ owner, repoName, refName, path, canEdit }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(`Delete ${path.split("/").pop()}`);
  const [description, setDescription] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${owner}/${repoName}/contents/${refName}/${path}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: message.trim() || `Delete ${path}`,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setDeleting(false);
        return;
      }
      if (data.prNumber) {
        window.location.href = `/${owner}/${repoName}/pull/${data.prNumber}`;
      } else {
        const parent = path.split("/").slice(0, -1).join("/");
        window.location.href = parent
          ? `/${owner}/${repoName}/tree/${refName}/${parent}`
          : `/${owner}/${repoName}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {canEdit && (
          <Link
            to={`/${owner}/${repoName}/edit/${refName}/${path}`}
            className="text-xs text-text-link hover:underline"
          >
            Edit
          </Link>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs text-danger hover:underline"
        >
          Delete
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-text-primary mb-2">Delete file</h2>
            <p className="text-sm text-text-secondary mb-4">
              Permanently delete <span className="font-mono">{path}</span> from{" "}
              <span className="font-mono">{refName}</span>?
            </p>
            {error && (
              <div className="mb-3 p-2 rounded-md bg-danger-bg border border-danger/30 text-danger text-xs">
                {error}
              </div>
            )}
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Commit message"
              className="w-full px-3 py-2 mb-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional extended description"
              className="w-full px-3 py-2 mb-4 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[60px]"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (deleting) return;
                  setConfirming(false);
                  setError(null);
                }}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !message.trim()}
                className="btn-danger"
              >
                {deleting ? "Deleting..." : "Delete file"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
