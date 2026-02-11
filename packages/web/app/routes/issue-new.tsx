"use client";

import { useState } from "react";
import { useParams } from "react-router";

export default function NewIssue() {
  const { owner, repo: repoName } = useParams();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/repos/${owner}/${repoName}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });

    const data = await res.json();
    if (res.ok) {
      window.location.href = `/${owner}/${repoName}/issue/${data.issue.number}`;
    } else {
      setError(data.error || "Failed to create issue");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-4">
      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">New issue</h2>
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
            rows={8}
            placeholder="Leave a comment..."
            className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y"
          />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={submitting || !title.trim()} className="btn-primary">
            {submitting ? "Creating..." : "Submit new issue"}
          </button>
        </div>
      </form>
    </div>
  );
}
