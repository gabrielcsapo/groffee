"use client";

import { useState, useEffect, useRef } from "react";
import { SettingsNav } from "../components/settings-nav.client";
import { Avatar } from "../components/avatar";
import { getProfile, updateProfile } from "../lib/server/auth";
import {
  getCurrentUserProfile,
  updateUserAvatar,
  removeUserAvatar,
  updateUserProfile,
} from "../lib/server/users";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap on the form (server still allows 10 MB for general uploads)
const BIO_MAX_LENGTH = 280;

export default function SettingsProfileClient() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUploadId, setAvatarUploadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getProfile(), getCurrentUserProfile()])
      .then(([profile, current]) => {
        if (profile.user) {
          setEmail(profile.user.email);
          setDisplayName(profile.user.displayName || "");
          setBio(profile.user.bio || "");
          setUsername(profile.user.username);
        }
        if (current.user) {
          setAvatarUploadId(current.user.avatarUploadId);
          setWebsite(current.user.website || "");
          setLocation(current.user.location || "");
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

    // updateProfile (auth.ts) owns email + displayName + bio writes; the new
    // P6 fields (website, location) live on updateUserProfile (users.ts) which
    // does the URL/length validation. We call them sequentially so a website
    // validation error shows up before we claim success.
    const result = await updateProfile({ email, displayName, bio });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const extra = await updateUserProfile({ website, location });
    setSaving(false);

    if (extra.error) {
      setError(extra.error);
    } else {
      setMessage("Profile updated successfully.");
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError("");
    setAvatarMessage("");

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please select an image file.");
      return;
    }

    // Avatar UI cap: 2 MB. The general upload endpoint still accepts 10 MB
    // for markdown attachments — we just don't want users uploading huge
    // photos as avatars when the result is rendered at 32-160 px.
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(
        `Avatar must be ${AVATAR_MAX_BYTES / (1024 * 1024)} MB or smaller (file is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      );
      return;
    }

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAvatarError(body.error || "Upload failed");
        return;
      }
      const body = (await res.json()) as { url: string };
      // url shape: /api/uploads/<oid>
      const oid = body.url.split("/").pop() || "";
      const apply = await updateUserAvatar({ uploadOid: oid });
      if (apply.error) {
        setAvatarError(apply.error);
        return;
      }
      setAvatarUploadId(oid);
      setAvatarMessage("Avatar updated.");
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  }

  async function handleAvatarRemove() {
    setAvatarError("");
    setAvatarMessage("");
    const res = await removeUserAvatar();
    if (res.error) {
      setAvatarError(res.error);
      return;
    }
    setAvatarUploadId(null);
    setAvatarMessage("Avatar removed.");
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
      <h1 className="font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight mb-1">
        profile
      </h1>
      <p className="text-sm text-text-secondary mb-6">Manage your account information.</p>

      {/* Avatar section */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <h2 className="text-base font-semibold text-text-primary mb-1">Avatar</h2>
        <p className="text-xs text-text-secondary mb-4">PNG, JPEG, GIF, WebP, or SVG up to 2 MB.</p>

        {avatarMessage && (
          <div className="mb-3 p-2.5 rounded-md bg-diff-add-bg border border-success/30 text-success text-sm">
            {avatarMessage}
          </div>
        )}
        {avatarError && (
          <div className="mb-3 p-2.5 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
            {avatarError}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <Avatar user={{ username, avatarUploadId }} size="xl" className="border-2" />
          <div className="flex flex-col gap-2">
            <label className="btn-secondary btn-sm cursor-pointer inline-block w-fit">
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={handleAvatarChange}
                disabled={uploadingAvatar}
                className="hidden"
              />
              {uploadingAvatar
                ? "Uploading..."
                : avatarUploadId
                  ? "Change avatar"
                  : "Upload avatar"}
            </label>
            {avatarUploadId && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={uploadingAvatar}
                className="btn-danger btn-sm w-fit"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

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
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-sm font-medium text-text-primary">
                Bio <span className="text-text-secondary">(optional)</span>
              </label>
              <span
                className={`text-xs ${bio.length > BIO_MAX_LENGTH ? "text-danger" : "text-text-secondary"}`}
              >
                {bio.length} / {BIO_MAX_LENGTH}
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={
                BIO_MAX_LENGTH + 50 /* let user paste then trim, server still rejects > 280 */
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y"
              placeholder="Tell us about yourself..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Website <span className="text-text-secondary">(optional)</span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Location <span className="text-text-secondary">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
