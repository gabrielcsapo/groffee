"use client";

import { useState, useEffect } from "react";
import { useParams } from "react-flight-router/client";
import {
  getRepo,
  getRepoRefs,
  updateRepo,
  updateDefaultBranch,
  renameRepository,
  setRepoArchived,
  deleteRepo,
  getRepoAuditLogs,
  getRepoSearchIndexStatus,
  reindexRepoSearch,
} from "../lib/server/repos";
import { getCollaborators, addCollaborator, removeCollaborator } from "../lib/server/collaborators";
import { getSessionUser } from "../lib/server/auth";
import {
  listRepoSecrets,
  createRepoSecret,
  updateRepoSecret,
  deleteRepoSecret,
} from "../lib/server/secrets";
import { listRepoInvites, createRepoInvite, revokeRepoInvite } from "../lib/server/invites";
import { listDeployKeys, addDeployKey, deleteDeployKey } from "../lib/server/deploy-keys";

export default function RepoSettingsClient() {
  const { owner, repo: repoName } = useParams();
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [repo, setRepo] = useState<{
    description: string | null;
    isPublic: boolean;
    defaultBranch: string;
    editPolicy?: "direct" | "pull_request";
    isArchived?: boolean;
  } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [editPolicy, setEditPolicy] = useState<"direct" | "pull_request">("direct");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string>("");
  const [savingDefaultBranch, setSavingDefaultBranch] = useState(false);
  const [renameTo, setRenameTo] = useState("");
  const [renaming, setRenaming] = useState(false);
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
  const [secrets, setSecrets] = useState<
    {
      id: string;
      name: string;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
      lastUsedAt: string | null;
    }[]
  >([]);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretError, setSecretError] = useState("");
  // For per-row inline rotation. We never load the current value — rotating
  // means typing a brand-new value, the old one is overwritten on save.
  const [rotatingName, setRotatingName] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [rotateBusy, setRotateBusy] = useState(false);
  // Invites: active list + form for generating new invites
  type ActiveInvite = {
    id: string;
    token: string;
    permission: string;
    createdAt: string;
    expiresAt: string | null;
    createdBy: string;
  };
  const [invites, setInvites] = useState<ActiveInvite[]>([]);
  const [invitePerm, setInvitePerm] = useState<"read" | "write" | "admin">("write");
  const [inviteExpiry, setInviteExpiry] = useState<"1" | "24" | "168" | "0">("168");
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  // Search-index status. Loaded after the main payload — no need to block
  // the page render on it. `reindexing` flips while the server action runs.
  const [searchIndex, setSearchIndex] = useState<{
    lastIndexedAt: string | null;
    latestRefAt: string | null;
    status: "fresh" | "stale" | "never";
  } | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexError, setReindexError] = useState("");
  // Deploy keys (per-repo public keys for CI/automation).
  type DeployKeyRow = {
    id: string;
    name: string;
    fingerprint: string;
    readOnly: boolean;
    createdAt: string;
  };
  const [deployKeysList, setDeployKeysList] = useState<DeployKeyRow[]>([]);
  const [newDeployKeyName, setNewDeployKeyName] = useState("");
  const [newDeployKeyValue, setNewDeployKeyValue] = useState("");
  const [newDeployKeyReadOnly, setNewDeployKeyReadOnly] = useState(true);
  const [addingDeployKey, setAddingDeployKey] = useState(false);
  const [deployKeyError, setDeployKeyError] = useState("");

  useEffect(() => {
    Promise.all([
      getSessionUser(),
      getRepo(owner!, repoName!),
      getCollaborators(owner!, repoName!).catch(() => ({ collaborators: undefined })),
      getRepoAuditLogs(owner!, repoName!, { limit: 20 }).catch(() => ({ logs: undefined })),
      listRepoSecrets(owner!, repoName!).catch(() => ({ secrets: undefined })),
      listRepoInvites(owner!, repoName!).catch(() => ({ active: undefined })),
      getRepoRefs(owner!, repoName!).catch(() => ({ refs: undefined })),
      listDeployKeys(owner!, repoName!).catch(() => ({ keys: undefined })),
    ]).then(
      ([
        sessionUser,
        repoData,
        collabData,
        auditData,
        secretsData,
        inviteData,
        refsData,
        deployData,
      ]) => {
        if (sessionUser) setUser({ username: sessionUser.username });
        if (repoData.repository) {
          setRepo(repoData.repository);
          setDescription(repoData.repository.description || "");
          setIsPublic(repoData.repository.isPublic);
          setEditPolicy((repoData.repository.editPolicy as "direct" | "pull_request") || "direct");
          setDefaultBranch(repoData.repository.defaultBranch);
        }
        if (collabData.collaborators) setCollaborators(collabData.collaborators);
        if (auditData.logs) setAuditLogs(auditData.logs);
        if (secretsData.secrets) setSecrets(secretsData.secrets);
        if ("active" in inviteData && inviteData.active) setInvites(inviteData.active);
        if ("refs" in refsData && refsData.refs) {
          setBranches(
            refsData.refs
              .filter((r: { type: string }) => r.type === "branch")
              .map((r: { name: string }) => r.name),
          );
        }
        if ("keys" in deployData && deployData.keys) {
          setDeployKeysList(deployData.keys);
        }
        setLoading(false);
      },
    );

    // Search-index status loaded separately. Owner-only; ignore errors so
    // collaborators (who shouldn't see this section anyway) don't see noise.
    getRepoSearchIndexStatus(owner!, repoName!)
      .then((status) => {
        if ("error" in status && status.error) return;
        const s = status as {
          lastIndexedAt: string | null;
          latestRefAt: string | null;
          status: "fresh" | "stale" | "never";
        };
        setSearchIndex({
          lastIndexedAt: s.lastIndexedAt,
          latestRefAt: s.latestRefAt,
          status: s.status,
        });
      })
      .catch(() => {});
  }, [owner, repoName]);

  const isOwner = user?.username === owner;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const result = await updateRepo(owner!, repoName!, {
      description,
      isPublic,
      editPolicy,
    });

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

  if (loading || !repo) {
    return (
      <div className="max-w-6xl mx-auto mt-4">
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

  if (!isOwner) {
    return (
      <div className="max-w-6xl mx-auto mt-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Access denied</h1>
          <p className="text-sm text-text-secondary mt-2">
            Only the repository owner can access settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-4">
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

          <fieldset>
            <legend className="text-sm font-medium text-text-primary mb-2">Edit policy</legend>
            <p className="text-xs text-text-secondary mb-2">
              Controls how edits made through the in-browser editor are committed.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="editPolicy"
                  checked={editPolicy === "direct"}
                  onChange={() => setEditPolicy("direct")}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium text-sm">Direct commit</span>
                  <p className="text-xs text-text-secondary">
                    Edit-in-browser writes directly to the default branch.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="editPolicy"
                  checked={editPolicy === "pull_request"}
                  onChange={() => setEditPolicy("pull_request")}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium text-sm">Always open a pull request</span>
                  <p className="text-xs text-text-secondary">
                    Each in-browser edit creates a new branch and pull request for review.
                  </p>
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

        {/* Rename */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className="block text-sm font-medium text-text-primary mb-1">
            Repository name
          </label>
          <p className="text-xs text-text-secondary mb-2">
            Renaming the repository updates its URL. Existing clones will need to be re-pointed.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const target = renameTo.trim();
              if (!target || target === repoName) return;
              setRenaming(true);
              setError("");
              setMessage("");
              const result = await renameRepository(owner!, repoName!, target);
              setRenaming(false);
              if (result.error) {
                setError(result.error);
              } else if (result.newSlug) {
                window.location.href = `/${result.newSlug}/settings`;
              }
            }}
            className="flex items-end gap-3"
          >
            <input
              type="text"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              placeholder={repoName}
              pattern="^[a-zA-Z0-9._-]+$"
              title="Letters, numbers, dots, dashes, and underscores."
              className="flex-1 px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <button
              type="submit"
              disabled={renaming || !renameTo.trim() || renameTo.trim() === repoName}
              className="btn-secondary"
            >
              {renaming ? "Renaming…" : "Rename"}
            </button>
          </form>
        </div>

        {/* Archive */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className="block text-sm font-medium text-text-primary mb-1">
            Archive this repository
          </label>
          <p className="text-xs text-text-secondary mb-2">
            Archived repositories are read-only. Pushes, issue/PR writes, comments, in-browser
            edits, and secret/invite changes are blocked until you unarchive. Reads (clones, pulls,
            browsing) stay open.
          </p>
          <button
            type="button"
            disabled={archiveBusy}
            onClick={async () => {
              const willArchive = !repo?.isArchived;
              if (
                willArchive &&
                !confirm(`Archive ${owner}/${repoName}? This will make the repo read-only.`)
              )
                return;
              setArchiveBusy(true);
              setError("");
              setMessage("");
              const result = await setRepoArchived(owner!, repoName!, willArchive);
              setArchiveBusy(false);
              if (result.error) {
                setError(result.error);
              } else {
                if (repo) setRepo({ ...repo, isArchived: result.isArchived });
                setMessage(result.isArchived ? "Repository archived." : "Repository unarchived.");
              }
            }}
            className={repo?.isArchived ? "btn-secondary" : "btn-secondary"}
          >
            {archiveBusy
              ? "Working…"
              : repo?.isArchived
                ? "Unarchive repository"
                : "Archive repository"}
          </button>
        </div>

        {/* Default branch */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className="block text-sm font-medium text-text-primary mb-1">Default branch</label>
          <p className="text-xs text-text-secondary mb-2">
            The branch that fronts the repo home and is the default base for new pull requests.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingDefaultBranch(true);
              setError("");
              setMessage("");
              const result = await updateDefaultBranch(owner!, repoName!, defaultBranch);
              setSavingDefaultBranch(false);
              if (result.error) {
                setError(result.error);
              } else {
                setMessage(`Default branch set to "${defaultBranch}".`);
                if (repo) setRepo({ ...repo, defaultBranch });
              }
            }}
            className="flex items-end gap-3"
          >
            <select
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              disabled={branches.length === 0}
              className="px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {branches.length === 0 && <option value="">{repo?.defaultBranch}</option>}
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={
                savingDefaultBranch ||
                branches.length === 0 ||
                !defaultBranch ||
                defaultBranch === repo?.defaultBranch
              }
              className="btn-secondary"
            >
              {savingDefaultBranch ? "Updating…" : "Update"}
            </button>
          </form>
        </div>
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

            const result = await addCollaborator(
              owner!,
              repoName!,
              newCollab.trim(),
              newCollabPerm,
            );

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

      {/* Invites */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Invites</h2>
        <p className="text-sm text-text-secondary mb-4">
          Generate a single-use invite link. Anyone logged in who opens the link will be added as a
          collaborator at the chosen permission.
        </p>

        {inviteError && (
          <div className="mb-3 p-2 rounded-md bg-danger-bg border border-danger/30 text-danger text-xs">
            {inviteError}
          </div>
        )}

        {invites.length > 0 && (
          <div className="border border-border rounded-md mb-4">
            {invites.map((invite, i) => {
              const inviteUrl =
                typeof window !== "undefined"
                  ? `${window.location.origin}/invite/${invite.token}`
                  : `/invite/${invite.token}`;
              return (
                <div
                  key={invite.id}
                  className={`px-4 py-3 flex items-center justify-between gap-3 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border">
                        {invite.permission}
                      </span>
                      <span className="text-xs text-text-secondary">
                        by {invite.createdBy} · created{" "}
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                      {invite.expiresAt && (
                        <span className="text-xs text-text-secondary">
                          · expires {new Date(invite.expiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <code className="block text-xs font-mono text-text-secondary mt-1 truncate">
                      {inviteUrl}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteUrl);
                          setCopiedInviteId(invite.id);
                          setTimeout(() => setCopiedInviteId(null), 1500);
                        } catch {
                          setInviteError("Could not copy to clipboard");
                        }
                      }}
                      className="btn-secondary btn-sm"
                    >
                      {copiedInviteId === invite.id ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("Revoke this invite link?")) return;
                        const result = await revokeRepoInvite(owner!, repoName!, invite.id);
                        if (result.error) {
                          setInviteError(result.error);
                        } else {
                          setInvites((prev) => prev.filter((i) => i.id !== invite.id));
                        }
                      }}
                      className="btn-danger btn-sm"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setGeneratingInvite(true);
            setInviteError("");
            const expiresInHours = inviteExpiry === "0" ? undefined : parseInt(inviteExpiry, 10);
            const result = await createRepoInvite(owner!, repoName!, {
              permission: invitePerm,
              expiresInHours,
            });
            setGeneratingInvite(false);
            if (result.error) {
              setInviteError(result.error);
            } else if (result.invite) {
              setInvites([
                {
                  id: result.invite.id,
                  token: result.invite.token,
                  permission: result.invite.permission,
                  createdAt: result.invite.createdAt,
                  expiresAt: result.invite.expiresAt,
                  createdBy: user?.username || "you",
                },
                ...invites,
              ]);
            }
          }}
          className="flex items-end gap-3 flex-wrap"
        >
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Permission</label>
            <select
              value={invitePerm}
              onChange={(e) => setInvitePerm(e.target.value as "read" | "write" | "admin")}
              className="px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Expires in</label>
            <select
              value={inviteExpiry}
              onChange={(e) => setInviteExpiry(e.target.value as "1" | "24" | "168" | "0")}
              className="px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="1">1 hour</option>
              <option value="24">1 day</option>
              <option value="168">7 days</option>
              <option value="0">Never</option>
            </select>
          </div>
          <button type="submit" disabled={generatingInvite} className="btn-primary">
            {generatingInvite ? "Generating…" : "Generate invite"}
          </button>
        </form>
      </div>

      {/* Search index */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Search index</h2>
        <p className="text-sm text-text-secondary mb-4">
          Code search is powered by a SQLite FTS5 index that is rebuilt incrementally on every push.
          Use this to force a clean rebuild — useful after a force-push or when the index falls out
          of sync.
        </p>

        {reindexError && (
          <div className="mb-3 p-2 rounded-md bg-danger-bg border border-danger/30 text-danger text-xs">
            {reindexError}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">Last indexed:</span>
              <span className="font-medium">
                {searchIndex?.lastIndexedAt
                  ? new Date(searchIndex.lastIndexedAt).toLocaleString()
                  : "never"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-text-secondary">Status:</span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                  searchIndex?.status === "fresh"
                    ? "bg-diff-add-bg border-success/30 text-success"
                    : "bg-surface-secondary border-border text-text-secondary"
                }`}
              >
                {searchIndex?.status ?? "unknown"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setReindexing(true);
              setReindexError("");
              const result = await reindexRepoSearch(owner!, repoName!);
              setReindexing(false);
              if (result.error) {
                setReindexError(result.error);
              } else if (result.lastIndexedAt) {
                setSearchIndex({
                  lastIndexedAt: result.lastIndexedAt,
                  latestRefAt: searchIndex?.latestRefAt ?? null,
                  status: "fresh",
                });
                setMessage("Search index rebuilt.");
              }
            }}
            disabled={reindexing}
            className="btn-primary"
          >
            {reindexing ? "Reindexing…" : "Reindex now"}
          </button>
        </div>
      </div>

      {/* Pipeline secrets */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Pipeline secrets</h2>
        <p className="text-sm text-text-secondary mb-4">
          Encrypted environment variables injected into pipeline jobs as{" "}
          <code className="font-mono text-xs bg-surface-secondary px-1 py-0.5 rounded">
            ${"{SECRET_NAME}"}
          </code>
          . Values are written once and never displayed again — to change one, type a new value.
        </p>

        {secretError && (
          <div className="mb-3 p-2 rounded-md bg-danger-bg border border-danger/30 text-danger text-xs">
            {secretError}
          </div>
        )}

        {secrets.length > 0 && (
          <div className="border border-border rounded-md mb-4">
            {secrets.map((secret, i) => (
              <div key={secret.id} className={`px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-medium text-text-primary">
                        {secret.name}
                      </span>
                      <span className="text-xs text-text-secondary">
                        added by {secret.createdBy}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Last used:{" "}
                      {secret.lastUsedAt ? new Date(secret.lastUsedAt).toLocaleString() : "never"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRotatingName(rotatingName === secret.name ? null : secret.name);
                        setRotateValue("");
                        setSecretError("");
                      }}
                      className="btn-secondary btn-sm"
                    >
                      {rotatingName === secret.name ? "Cancel" : "Update"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !confirm(`Delete secret "${secret.name}"? Pipelines using it will fail.`)
                        )
                          return;
                        const result = await deleteRepoSecret(owner!, repoName!, secret.name);
                        if (result.error) {
                          setSecretError(result.error);
                        } else {
                          setSecrets((prev) => prev.filter((s) => s.id !== secret.id));
                        }
                      }}
                      className="btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {rotatingName === secret.name && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!rotateValue) return;
                      setRotateBusy(true);
                      setSecretError("");
                      const result = await updateRepoSecret(
                        owner!,
                        repoName!,
                        secret.name,
                        rotateValue,
                      );
                      setRotateBusy(false);
                      if (result.error) {
                        setSecretError(result.error);
                      } else {
                        setRotateValue("");
                        setRotatingName(null);
                        setSecrets((prev) =>
                          prev.map((s) =>
                            s.id === secret.id
                              ? { ...s, updatedAt: result.updatedAt || new Date().toISOString() }
                              : s,
                          ),
                        );
                        setMessage(`Secret "${secret.name}" updated.`);
                      }
                    }}
                    className="flex items-end gap-2 mt-3"
                  >
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        New value
                      </label>
                      <input
                        type="password"
                        value={rotateValue}
                        onChange={(e) => setRotateValue(e.target.value)}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Paste new secret value"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={rotateBusy || !rotateValue}
                      className="btn-primary btn-sm"
                    >
                      {rotateBusy ? "Saving…" : "Save"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newSecretName.trim() || !newSecretValue) return;
            setSavingSecret(true);
            setSecretError("");
            const result = await createRepoSecret(
              owner!,
              repoName!,
              newSecretName.trim(),
              newSecretValue,
            );
            setSavingSecret(false);
            if (result.error) {
              setSecretError(result.error);
            } else if (result.secret) {
              setSecrets([...secrets, result.secret]);
              setNewSecretName("");
              // Always clear the value field on save — never reflect plaintext back.
              setNewSecretValue("");
              setMessage(`Secret "${result.secret.name}" added.`);
            }
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              type="text"
              value={newSecretName}
              onChange={(e) => setNewSecretName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="MY_SECRET_KEY"
              pattern="^[A-Z][A-Z0-9_]*$"
              title="Uppercase letters, digits, and underscores. Must start with a letter."
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-primary mb-1">Value</label>
            <input
              type="password"
              value={newSecretValue}
              onChange={(e) => setNewSecretValue(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Paste secret value"
            />
          </div>
          <button
            type="submit"
            disabled={savingSecret || !newSecretName.trim() || !newSecretValue}
            className="btn-primary"
          >
            {savingSecret ? "Saving..." : "Save"}
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

      {/* Deploy keys */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Deploy keys</h2>
        <p className="text-sm text-text-secondary mb-4">
          Per-repo SSH public keys used by CI/automation to access this repo without a user account.
          Read-only keys can fetch but not push. Distinct from your{" "}
          <a className="text-text-link hover:underline" href="/settings/keys">
            account SSH keys
          </a>
          .
        </p>

        {deployKeyError && (
          <div className="mb-3 p-2 rounded-md bg-danger-bg border border-danger/30 text-danger text-xs">
            {deployKeyError}
          </div>
        )}

        {deployKeysList.length > 0 && (
          <div className="border border-border rounded-md mb-4">
            {deployKeysList.map((key, i) => (
              <div
                key={key.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{key.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary border border-border">
                      {key.readOnly ? "read-only" : "read/write"}
                    </span>
                  </div>
                  <code className="block text-xs font-mono text-text-secondary mt-1 truncate">
                    {key.fingerprint}
                  </code>
                  <p className="text-xs text-text-secondary mt-0.5">
                    added {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete deploy key "${key.name}"?`)) return;
                    const result = await deleteDeployKey(owner!, repoName!, key.id);
                    if (result.error) {
                      setDeployKeyError(result.error);
                    } else {
                      setDeployKeysList((prev) => prev.filter((k) => k.id !== key.id));
                    }
                  }}
                  className="btn-danger btn-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDeployKeyName.trim() || !newDeployKeyValue.trim()) return;
            setAddingDeployKey(true);
            setDeployKeyError("");
            const result = await addDeployKey(
              owner!,
              repoName!,
              newDeployKeyName.trim(),
              newDeployKeyValue.trim(),
              newDeployKeyReadOnly,
            );
            setAddingDeployKey(false);
            if (result.error) {
              setDeployKeyError(result.error);
            } else if (result.key) {
              setDeployKeysList([...deployKeysList, result.key]);
              setNewDeployKeyName("");
              setNewDeployKeyValue("");
              setNewDeployKeyReadOnly(true);
              setMessage(`Deploy key "${result.key.name}" added.`);
            }
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Title</label>
            <input
              type="text"
              value={newDeployKeyName}
              onChange={(e) => setNewDeployKeyName(e.target.value)}
              placeholder="ci-bot@example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Public key</label>
            <textarea
              value={newDeployKeyValue}
              onChange={(e) => setNewDeployKeyValue(e.target.value)}
              rows={4}
              placeholder="ssh-ed25519 AAAA…"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={newDeployKeyReadOnly}
              onChange={(e) => setNewDeployKeyReadOnly(e.target.checked)}
            />
            Allow read-only access only
          </label>
          <div>
            <button
              type="submit"
              disabled={addingDeployKey || !newDeployKeyName.trim() || !newDeployKeyValue.trim()}
              className="btn-primary"
            >
              {addingDeployKey ? "Adding…" : "Add deploy key"}
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
              placeholder="Type repository name to confirm"
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
