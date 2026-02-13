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
  const [collaborators, setCollaborators] = useState<
    { id: string; username: string; permission: string; createdAt: string }[]
  >([]);
  const [newCollab, setNewCollab] = useState("");
  const [newCollabPerm, setNewCollabPerm] = useState("write");
  const [addingCollab, setAddingCollab] = useState(false);

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
    fetch(`/api/repos/${owner}/${repoName}/collaborators`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.collaborators) setCollaborators(data.collaborators);
      })
      .catch(() => {});
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
        <div className="mb-4 p-3 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
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

      {/* Collaborators */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Collaborators</h2>
        <p className="text-sm text-text-secondary mb-4">
          Collaborators can push to this repository.
        </p>

        {collaborators.length > 0 && (
          <div className="border border-border rounded-md mb-4">
            {collaborators.map((collab, i) => (
              <div
                key={collab.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">{collab.username}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border">
                    {collab.permission}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch(
                      `/api/repos/${owner}/${repoName}/collaborators/${collab.id}`,
                      { method: "DELETE" },
                    );
                    if (res.ok) {
                      setCollaborators(collaborators.filter((c) => c.id !== collab.id));
                    }
                  }}
                  className="btn-danger btn-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newCollab.trim()) return;
            setAddingCollab(true);
            setError("");
            setMessage("");

            const res = await fetch(`/api/repos/${owner}/${repoName}/collaborators`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: newCollab.trim(), permission: newCollabPerm }),
            });

            const data = await res.json();
            if (res.ok) {
              setCollaborators([...collaborators, data.collaborator]);
              setNewCollab("");
              setMessage("Collaborator added.");
            } else {
              setError(data.error || "Failed to add collaborator");
            }
            setAddingCollab(false);
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-primary mb-1">Username</label>
            <input
              type="text"
              value={newCollab}
              onChange={(e) => setNewCollab(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Permission</label>
            <select
              value={newCollabPerm}
              onChange={(e) => setNewCollabPerm(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={addingCollab} className="btn-primary">
            {addingCollab ? "Adding..." : "Add"}
          </button>
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
