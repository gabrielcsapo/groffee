"use client";

import { useState, useEffect } from "react";
import { useParams } from "react-router";

export default function NewPullRequest() {
  const { owner, repo: repoName } = useParams();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/repos/${owner}/${repoName}/refs`)
      .then((r) => r.json())
      .then((data) => {
        const branchNames = (data.refs || [])
          .filter((r: { type: string }) => r.type === "branch")
          .map((r: { name: string }) => r.name);
        setBranches(branchNames);
        if (data.defaultBranch) setTargetBranch(data.defaultBranch);
      });
  }, [owner, repoName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/repos/${owner}/${repoName}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, sourceBranch, targetBranch }),
    });

    const data = await res.json();
    if (res.ok) {
      window.location.href = `/${owner}/${repoName}/pull/${data.pullRequest.number}`;
    } else {
      setError(data.error || "Failed to create pull request");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-4">
      {error && (
        <div className="mb-4 p-3 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">New pull request</h2>
        {/* Branch selection */}
        <div className="flex gap-4 mb-4 pb-4 border-b border-border">
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1">base</label>
            <select
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-2 text-text-secondary font-mono">←</div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1">compare</label>
            <select
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select branch</option>
              {branches
                .filter((b) => b !== targetBranch)
                .map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Title"
            className="w-full px-3 py-2 border border-border rounded-md bg-surface text-base font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="mb-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !title.trim() || !sourceBranch || !targetBranch}
            className="btn-primary"
          >
            {submitting ? "Creating..." : "Create pull request"}
          </button>
        </div>
      </form>
    </div>
  );
}
