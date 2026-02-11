"use client";

import { useState, useEffect } from "react";
import { useParams } from "react-router";

export default function RepoSettings() {
  const { owner, repo: repoName } = useParams();
  const [repo, setRepo] = useState<{
    description: string;
    isPublic: boolean;
    defaultBranch: string;
  } | null>(null);
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/repos/${owner}/${repoName}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.repository) {
          setRepo(data.repository);
          setDescription(data.repository.description || "");
          setIsPublic(data.repository.isPublic);
        }
      });
  }, [owner, repoName]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const res = await fetch(`/api/repos/${owner}/${repoName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, isPublic }),
    });

    const data = await res.json();
    if (res.ok) {
      setMessage("Settings saved.");
      setRepo(data.repository);
    } else {
      setError(data.error || "Failed to save settings");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (confirmDelete !== repoName) return;
    setDeleting(true);
    setError("");

    const res = await fetch(`/api/repos/${owner}/${repoName}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = `/${owner}`;
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete repository");
      setDeleting(false);
    }
  }

  if (!repo) {
    return (
      <div className="max-w-2xl mx-auto mt-4">
        <div className="bg-surface border border-border rounded-lg p-6 mb-6">
          <div className="skeleton w-24 h-6 mb-4" />
          <div className="flex flex-col gap-4">
            <div className="skeleton w-full h-10" />
            <div className="skeleton w-48 h-5" />
            <div className="skeleton w-32 h-10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-4">
      {message && (
        <div className="mb-4 p-3 rounded-md bg-diff-add-bg border border-success/30 text-success text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      {/* General settings */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">General</h2>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Short description of your repository"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-text-primary mb-2">Visibility</legend>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium text-sm">Public</span>
                  <p className="text-xs text-text-secondary">Anyone can see this repository.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium text-sm">Private</span>
                  <p className="text-xs text-text-secondary">Only you can see this repository.</p>
                </div>
              </label>
            </div>
          </fieldset>

          <div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-surface border border-danger/30 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-danger mb-2">Danger zone</h2>
        <p className="text-sm text-text-secondary mb-4">
          Once you delete a repository, there is no going back. This will permanently delete the
          <strong>
            {" "}
            {owner}/{repoName}{" "}
          </strong>
          repository, wiki, issues, comments, and all associated data.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Type <strong>{repoName}</strong> to confirm:
            </label>
            <input
              type="text"
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-danger focus:border-danger"
              placeholder={repoName}
            />
          </div>
          <div>
            <button
              onClick={handleDelete}
              disabled={confirmDelete !== repoName || deleting}
              className="btn-danger"
            >
              {deleting ? "Deleting..." : "Delete this repository"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
