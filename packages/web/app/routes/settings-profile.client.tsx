"use client";

import { useState, useEffect } from "react";
import { SettingsNav } from "../components/settings-nav.client";
import { getProfile, updateProfile } from "../lib/server/auth";

export default function SettingsProfileClient() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getProfile()
      .then((data) => {
        if (data.user) {
          setEmail(data.user.email);
          setDisplayName(data.user.displayName || "");
          setBio(data.user.bio || "");
          setUsername(data.user.username);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    const result = await updateProfile({ email, displayName, bio });
    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage("Profile updated successfully.");
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SettingsNav />
        <div className="skeleton w-32 h-7 mb-6" />
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="skeleton w-full h-10 mb-3" />
          <div className="skeleton w-full h-10 mb-3" />
          <div className="skeleton w-full h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <SettingsNav />
      <h1 className="text-2xl font-bold text-text-primary mb-1">Profile</h1>
      <p className="text-sm text-text-secondary mb-6">Manage your account information.</p>

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

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Username</label>
            <input
              type="text"
              value={username}
              disabled
              className="w-full px-3 py-2 border border-border rounded-md bg-surface-secondary text-sm text-text-secondary cursor-not-allowed"
            />
            <p className="text-xs text-text-secondary mt-1">Username cannot be changed.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Email <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Display name <span className="text-text-secondary">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Bio <span className="text-text-secondary">(optional)</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y"
              placeholder="Tell us about yourself..."
            />
          </div>
          <div className="border-t border-border pt-4">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Update profile"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
