"use client";

import { useState, useEffect } from "react";
import { getTokens, createToken, revokeToken } from "../lib/server/tokens";

interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { value: "repo", label: "repo", description: "Full control of repositories" },
  { value: "read:repo", label: "read:repo", description: "Read-only access to repositories" },
  { value: "user", label: "user", description: "Read/write user settings" },
  { value: "audit", label: "audit", description: "Read audit logs" },
];

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

export default function SettingsTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["repo", "user"]);
  const [expiresIn, setExpiresIn] = useState("never");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    getTokens()
      .then((data) => {
        if (data.error === "Unauthorized") {
          window.location.href = "/login";
          return;
        }
        setTokens(data.tokens || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setNewToken(null);
    setCreating(true);

    let expiresAt: string | undefined = undefined;
    if (expiresIn !== "never") {
      const ms = parseInt(expiresIn, 10) * 24 * 60 * 60 * 1000;
      expiresAt = new Date(Date.now() + ms).toISOString();
    }

    const result = await createToken(name, selectedScopes, expiresAt);

    if (result.error) {
      setError(result.error);
      setCreating(false);
      return;
    }

    setTokens([...tokens, result.token as unknown as Token]);
    setNewToken(result.plainToken!);
    setName("");
    setSelectedScopes(["repo", "user"]);
    setExpiresIn("never");
    setMessage("Token created. Copy it now — it won't be shown again.");
    setCreating(false);
  }

  async function handleDelete(id: string) {
    setError("");
    setMessage("");
    setNewToken(null);
    const result = await revokeToken(id);
    if (result.error) {
      setError(result.error);
    } else {
      setTokens(tokens.filter((t) => t.id !== id));
      setMessage("Token revoked.");
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="skeleton w-48 h-7 mb-6" />
        <div className="bg-surface border border-border rounded-lg p-6 mb-6">
          <div className="skeleton w-full h-10 mb-3" />
          <div className="skeleton w-full h-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Personal Access Tokens</h1>
      <p className="text-sm text-text-secondary mb-6">
        Tokens can be used to authenticate with the API and Git over HTTP. Use them as a password
        with your username, or as a Bearer token in the Authorization header.
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

      {/* New token display (shown once after creation) */}
      {newToken && (
        <div className="mb-4 p-4 rounded-md bg-warning-bg border border-warning/30">
          <p className="text-sm font-medium text-text-primary mb-2">
            Your new personal access token:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-surface rounded border border-border text-sm font-mono text-text-primary select-all break-all">
              {newToken}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newToken);
                setMessage("Token copied to clipboard.");
              }}
              className="btn-secondary btn-sm shrink-0"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-warning mt-2">
            Make sure to copy your personal access token now. You won't be able to see it again.
          </p>
        </div>
      )}

      {/* Existing tokens */}
      {tokens.length > 0 && (
        <div className="bg-surface border border-border rounded-lg mb-6">
          {tokens.map((token, i) => {
            const scopes: string[] = JSON.parse(token.scopes);
            return (
              <div
                key={token.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-text-primary">{token.name}</p>
                    <code className="text-xs font-mono text-text-secondary">
                      {token.tokenPrefix}...
                    </code>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {scopes.map((scope) => (
                      <span
                        key={scope}
                        className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary text-text-secondary border border-border"
                      >
                        {scope}
                      </span>
                    ))}
                    <span className="text-xs text-text-secondary">
                      Created {timeAgo(token.createdAt)}
                    </span>
                    {token.lastUsedAt && (
                      <span className="text-xs text-text-secondary">
                        Last used {timeAgo(token.lastUsedAt)}
                      </span>
                    )}
                    {token.expiresAt && (
                      <span className="text-xs text-text-secondary">
                        Expires {new Date(token.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(token.id)}
                  className="btn-danger btn-sm ml-4 shrink-0"
                >
                  Revoke
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tokens.length === 0 && !newToken && (
        <div className="bg-surface border border-border rounded-lg p-6 mb-6 text-center">
          <p className="text-sm text-text-secondary">No personal access tokens yet.</p>
        </div>
      )}

      {/* Create new token */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Generate new token</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Token name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="e.g. CI/CD pipeline"
              required
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-text-primary mb-2">Scopes</legend>
            <div className="flex flex-col gap-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <label key={scope.value} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <code className="text-sm font-mono">{scope.label}</code>
                    <p className="text-xs text-text-secondary">{scope.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Expiration</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="never">No expiration</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={creating || selectedScopes.length === 0}
              className="btn-primary"
            >
              {creating ? "Generating..." : "Generate token"}
            </button>
          </div>
        </form>
      </div>

      {/* Usage instructions */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Using your token</h2>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-1">API Authentication</h3>
            <p className="text-xs text-text-secondary mb-2">
              Pass the token in the Authorization header:
            </p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto">
              curl -H "Authorization: Bearer groffee_..." \{"\n"}
              {"  "}http://localhost:3000/api/repos
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-primary mb-1">Git over HTTP</h3>
            <p className="text-xs text-text-secondary mb-2">
              Use the token as your password when cloning or pushing:
            </p>
            <pre className="text-xs bg-surface-secondary p-3 rounded-md border border-border font-mono text-text-primary overflow-x-auto">
              git clone http://username:groffee_...@localhost:3000/owner/repo.git
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
