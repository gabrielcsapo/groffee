"use client";

import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { getRepo, updateRepo, deleteRepo, getRepoAuditLogs } from "../lib/server/repos";
import { getCollaborators, addCollaborator, removeCollaborator } from "../lib/server/collaborators";

export default function RepoSettings() {
  const { owner, repo: repoName } = useParams();
  const [repo, setRepo] = useState<{
    description: string | null;
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
  const [auditLogs, setAuditLogs] = useState<
    {
      id: string;
      action: string;
      username: string;
      metadata: string | null;
      ipAddress: string | null;
      createdAt: string;
    }[]
  >([]);

  useEffect(() => {
    getRepo(owner!, repoName!).then((data) => {
      if (data.repository) {
        setRepo(data.repository);
        setDescription(data.repository.description || "");
        setIsPublic(data.repository.isPublic);
      }
    });
    getCollaborators(owner!, repoName!).then((data) => {
      if (data.collaborators) setCollaborators(data.collaborators);
    }).catch(() => {});
    getRepoAuditLogs(owner!, repoName!, { limit: 20 }).then((data) => {
      if (data.logs) setAuditLogs(data.logs);
    }).catch(() => {});
  }, [owner, repoName]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const result = await updateRepo(owner!, repoName!, { description, isPublic });

    if (result.error) {
      setError(result.error);
    } else {
      setMessage("Settings saved.");
      if (result.repository) setRepo(result.repository);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (confirmDelete !== repoName) return;
    setDeleting(true);
    setError("");

    const result = await deleteRepo(owner!, repoName!);
    if (result.error) {
      setError(result.error);
      setDeleting(false);
    } else {
      window.location.href = `/${owner}`;
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
                    const result = await removeCollaborator(owner!, repoName!, collab.id);
                    if (!result.error) {
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

            const result = await addCollaborator(owner!, repoName!, newCollab.trim(), newCollabPerm);

            if (result.error) {
              setError(result.error);
            } else {
              setCollaborators([...collaborators, result.collaborator!]);
              setNewCollab("");
              setMessage("Collaborator added.");
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

      {/* Audit Log */}
      {auditLogs.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">Audit log</h2>
          <p className="text-sm text-text-secondary mb-4">
            Recent administrative actions on this repository.
          </p>
          <div className="border border-border rounded-md overflow-hidden">
            {auditLogs.map((log, i) => {
              const meta = log.metadata ? JSON.parse(log.metadata) : {};
              return (
                <div
                  key={log.id}
                  className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{log.username}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border font-mono">
                        {log.action}
                      </span>
                      {meta.name && (
                        <span className="text-xs text-text-secondary">{meta.name}</span>
                      )}
                    </div>
                    {log.ipAddress && log.ipAddress !== "unknown" && (
                      <p className="text-xs text-text-secondary mt-0.5">from {log.ipAddress}</p>
                    )}
                  </div>
                  <time className="text-xs text-text-secondary whitespace-nowrap ml-3">
                    {new Date(log.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
