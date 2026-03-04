"use client";

import { useState, useEffect } from "react";
import { getSSHKeys, addSSHKey, deleteSSHKey } from "../lib/server/keys";
import { useConfirmDialog } from "../components/confirm-dialog.client";
import { SettingsNav } from "../components/settings-nav.client";

interface SshKey {
  id: string;
  title: string;
  fingerprint: string;
  createdAt: string;
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function SettingsKeysClient() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    getSSHKeys()
      .then((data) => {
        setKeys(data.keys || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setAdding(true);

    const result = await addSSHKey(title, publicKey);

    if (result.error) {
      setError(result.error);
      setAdding(false);
      return;
    }

    setKeys([...keys, result.key!]);
    setTitle("");
    setPublicKey("");
    setMessage("SSH key added successfully.");
    setAdding(false);
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm({
      title: "Delete SSH key?",
      message: "This action cannot be undone. You will need to re-add this key to use it again.",
    });
    if (!confirmed) return;

    setError("");
    setMessage("");
    const result = await deleteSSHKey(id);
    if (result.error) {
      setError(result.error);
    } else {
      setKeys(keys.filter((k) => k.id !== id));
      setMessage("SSH key deleted.");
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SettingsNav />
        <div className="skeleton w-32 h-7 mb-6" />
        <div className="bg-surface border border-border rounded-lg p-6 mb-6">
          <div className="skeleton w-full h-10 mb-3" />
          <div className="skeleton w-full h-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <SettingsNav />
      <h1 className="text-2xl font-bold text-text-primary mb-1">SSH Keys</h1>
      <p className="text-sm text-text-secondary mb-6">
        SSH keys allow you to push and pull from repositories over SSH.
      </p>

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

      {/* Existing keys */}
      {keys.length > 0 && (
        <div className="bg-surface border border-border rounded-lg mb-6">
          {keys.map((key, i) => (
            <div
              key={key.id}
              className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{key.title}</p>
                <p className="text-xs font-mono text-text-secondary truncate">{key.fingerprint}</p>
                <p className="text-xs text-text-secondary mt-0.5">Added {timeAgo(key.createdAt)}</p>
              </div>
              <button
                onClick={() => handleDelete(key.id)}
                className="btn-danger btn-sm ml-4 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {keys.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-6 mb-6 text-center">
          <p className="text-sm text-text-secondary">No SSH keys yet.</p>
        </div>
      )}

      {/* Test connection hint */}
      {keys.length > 0 && (
        <div className="bg-surface-secondary border border-border rounded-lg px-4 py-3 mb-6">
          <p className="text-sm font-medium text-text-primary mb-1">Test your SSH connection</p>
          <p className="text-xs text-text-secondary mb-2">
            After adding your key, verify it works by running:
          </p>
          <pre className="text-xs bg-surface p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto">
            ssh -T git@
            {typeof window !== "undefined" ? window.location.hostname : "hostname"} -p 2223
          </pre>
          <p className="text-xs text-text-secondary mt-2">
            You should see:{" "}
            <span className="font-mono">
              Hi &lt;username&gt;! You've successfully authenticated, but Groffee does not provide
              shell access.
            </span>
          </p>
        </div>
      )}

      {/* Add new key */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Add new SSH key</h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="e.g. My Laptop"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Public key</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              rows={4}
              placeholder="ssh-ed25519 AAAA..."
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Paste your public key. Supported types: ssh-rsa, ssh-ed25519, ecdsa.
            </p>
          </div>
          <div>
            <button type="submit" disabled={adding} className="btn-primary">
              {adding ? "Adding..." : "Add SSH key"}
            </button>
          </div>
        </form>
      </div>

      {/* How to generate a key */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Generating an SSH key</h2>
        <p className="text-sm text-text-secondary mb-4">
          If you don't have an SSH key yet, you can generate one using the instructions below. We
          recommend ed25519 keys for the best security and performance.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-1">macOS / Linux</h3>
            <p className="text-xs text-text-secondary mb-2">Open a terminal and run:</p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto">
              ssh-keygen -t ed25519 -C "your_email@example.com"
            </pre>
            <p className="text-xs text-text-secondary mt-2">
              Press Enter to accept the default file location. Optionally set a passphrase. Then
              copy your public key:
            </p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto mt-2">
              <span className="text-text-secondary"># macOS</span>
              {"\n"}
              pbcopy &lt; ~/.ssh/id_ed25519.pub{"\n"}
              {"\n"}
              <span className="text-text-secondary"># Linux</span>
              {"\n"}
              cat ~/.ssh/id_ed25519.pub
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-primary mb-1">Windows</h3>
            <p className="text-xs text-text-secondary mb-2">Open PowerShell or Git Bash and run:</p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto">
              ssh-keygen -t ed25519 -C "your_email@example.com"
            </pre>
            <p className="text-xs text-text-secondary mt-2">
              Press Enter to accept the default file location. Then copy your public key:
            </p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto mt-2">
              <span className="text-text-secondary"># PowerShell</span>
              {"\n"}
              Get-Content ~\.ssh\id_ed25519.pub | Set-Clipboard{"\n"}
              {"\n"}
              <span className="text-text-secondary"># Git Bash</span>
              {"\n"}
              cat ~/.ssh/id_ed25519.pub
            </pre>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  );
}
