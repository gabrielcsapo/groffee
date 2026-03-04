"use client";

import { useState } from "react";
import { SettingsNav } from "../components/settings-nav.client";
import { changePassword } from "../lib/server/auth";

export default function SettingsPasswordClient() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <SettingsNav />
      <h1 className="text-2xl font-bold text-text-primary mb-1">Change password</h1>
      <p className="text-sm text-text-secondary mb-6">
        Update your password to keep your account secure.
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

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Current password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              New password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <p className="text-xs text-text-secondary mt-1">Must be at least 8 characters.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Confirm new password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div className="border-t border-border pt-4">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Update password"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
