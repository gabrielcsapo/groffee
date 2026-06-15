"use client";

import { useState } from "react";
import { Link } from "react-flight-router/client";

interface Props {
  owner: string;
  repoName: string;
  refName: string;
  pathPrefix: string;
  editPolicy: "direct" | "pull_request";
}

export default function RepoNewFileClient(props: Props) {
  const { owner, repoName, refName, pathPrefix, editPolicy } = props;

  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("Create new file");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPR = editPolicy === "pull_request";
  const submitLabel = isPR ? "Propose new file" : "Commit new file";
  const fullPath = pathPrefix ? `${pathPrefix}/${filename}` : filename;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filename.trim()) {
      setError("Please enter a filename.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/repos/${owner}/${repoName}/contents/${refName}/${fullPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content,
          message: message.trim() || `Create ${filename.split("/").pop() || filename}`,
          description: description.trim() || undefined,
          intent: "create",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      if (data.prNumber) {
        window.location.href = `/${owner}/${repoName}/pull/${data.prNumber}`;
      } else {
        window.location.href = `/${owner}/${repoName}/blob/${refName}/${fullPath}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if ((filename || content) && !window.confirm("Discard your changes and return to the tree?")) {
      return;
    }
    const target = pathPrefix
      ? `/${owner}/${repoName}/tree/${refName}/${pathPrefix}`
      : `/${owner}/${repoName}`;
    window.location.href = target;
  }

  return (
    <div className="max-w-4xl mx-auto mt-8">
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
        <span className="text-text-secondary text-sm">{refName}</span>
        {pathPrefix && (
          <>
            <span className="text-text-secondary">/</span>
            <Link
              to={`/${owner}/${repoName}/tree/${refName}/${pathPrefix}`}
              className="text-text-link hover:underline"
            >
              {pathPrefix}
            </Link>
          </>
        )}
        <span className="text-text-secondary">/</span>
        <span className="font-semibold text-text-primary text-sm">{filename || "new-file"}</span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-secondary border-b border-border">
            {pathPrefix && (
              <span className="text-sm font-mono text-text-secondary">{pathPrefix}/</span>
            )}
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Filename including extension"
              className="text-sm font-mono bg-transparent border-none outline-none flex-1 text-text-primary"
              required
              autoFocus
            />
            <span className="text-xs text-text-secondary ml-3">
              On <span className="font-mono">{refName}</span>
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-4 py-3 font-mono text-sm bg-surface text-text-primary outline-none resize-y min-h-[480px]"
            spellCheck={false}
            wrap="off"
            placeholder="// File contents..."
          />
        </div>

        <div className="border border-border rounded-lg p-4 bg-surface mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            {isPR ? "Propose new file" : "Commit new file"}
          </h3>
          {isPR && (
            <p className="text-xs text-text-secondary mb-3">
              A new branch will be created and a pull request opened against{" "}
              <span className="font-mono">{refName}</span>.
            </p>
          )}
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            className="w-full px-3 py-2 mb-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            required
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add an optional extended description..."
            className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[80px]"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !filename.trim()} className="btn-primary">
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
