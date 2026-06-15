"use client";

import { useState } from "react";
import { Link } from "react-flight-router/client";

interface Props {
  owner: string;
  repoName: string;
  refName: string;
  path: string;
  initialContent: string;
  editPolicy: "direct" | "pull_request";
  defaultBranch: string;
  branchExists: boolean;
}

export default function RepoEditClient(props: Props) {
  const { owner, repoName, refName, path, initialContent, editPolicy } = props;
  const fileName = path.split("/").pop() || path;

  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState(`Update ${fileName}`);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPR = editPolicy === "pull_request";
  const submitLabel = isPR ? "Propose changes" : "Commit changes";

  const pathParts = path.split("/");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/repos/${owner}/${repoName}/contents/${refName}/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content,
          message: message.trim() || `Update ${fileName}`,
          description: description.trim() || undefined,
          intent: "edit",
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
        window.location.href = `/${owner}/${repoName}/blob/${refName}/${path}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    if (
      content !== initialContent &&
      !window.confirm("Discard your changes and return to the file?")
    ) {
      return;
    }
    window.location.href = `/${owner}/${repoName}/blob/${refName}/${path}`;
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
        {pathParts.map((part, i) => {
          const partPath = pathParts.slice(0, i + 1).join("/");
          const isLast = i === pathParts.length - 1;
          return (
            <span key={partPath} className="flex items-center gap-1.5">
              <span className="text-text-secondary">/</span>
              {isLast ? (
                <span className="font-semibold text-text-primary">{part}</span>
              ) : (
                <Link
                  to={`/${owner}/${repoName}/tree/${refName}/${partPath}`}
                  className="text-text-link hover:underline"
                >
                  {part}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border">
            <input
              type="text"
              value={path}
              readOnly
              className="text-sm font-mono bg-transparent border-none outline-none flex-1 text-text-primary"
            />
            <span className="text-xs text-text-secondary ml-3">
              Editing on <span className="font-mono">{refName}</span>
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-4 py-3 font-mono text-sm bg-surface text-text-primary outline-none resize-y min-h-[480px]"
            spellCheck={false}
            wrap="off"
          />
        </div>

        <div className="border border-border rounded-lg p-4 bg-surface mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            {isPR ? "Propose file change" : "Commit changes"}
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
          <button type="button" onClick={handleDiscard} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || content === initialContent}
            className="btn-primary"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
