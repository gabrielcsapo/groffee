"use client";

import { useEffect, useState } from "react";
import { Link, useParams, useRouter } from "react-flight-router/client";
import { getSessionUser } from "../lib/server/auth";
import { getRepoInviteByToken, acceptRepoInvite } from "../lib/server/invites";

interface InviteData {
  id: string;
  permission: string;
  expiresAt: string | null;
  expired: boolean;
  used: boolean;
  repo: {
    owner: string;
    name: string;
    description: string | null;
    isPublic: boolean;
  };
  createdBy: string;
}

export default function InviteAcceptClient() {
  const { token } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSessionUser();
      if (!user) {
        // Bounce to login with a return URL
        if (typeof window !== "undefined") {
          window.location.href = `/login?return=${encodeURIComponent(`/invite/${token}`)}`;
        }
        return;
      }
      const result = await getRepoInviteByToken(token!);
      if (cancelled) return;
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("invite" in result && result.invite) {
        setInvite(result.invite);
      }
      setAuthChecked(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError("");
    const result = await acceptRepoInvite(token!);
    setAccepting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.repo) {
      router.navigate(`/${result.repo.owner}/${result.repo.name}`);
    }
  }

  if (loading || !authChecked) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="skeleton w-32 h-6 mb-3" />
          <div className="skeleton w-full h-4 mb-2" />
          <div className="skeleton w-2/3 h-4" />
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary mb-2">Invite unavailable</h1>
          <p className="text-sm text-text-secondary mb-4">
            {error || "This invite link is invalid or has been revoked."}
          </p>
          <Link to="/" className="btn-secondary">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (invite.used || invite.expired) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary mb-2">
            {invite.used ? "Invite already used" : "Invite expired"}
          </h1>
          <p className="text-sm text-text-secondary mb-4">
            {invite.used
              ? "This invite has already been redeemed or revoked."
              : "This invite link has expired. Ask the repository owner to issue a new one."}
          </p>
          <Link to={`/${invite.repo.owner}/${invite.repo.name}`} className="btn-secondary">
            View repository
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h1 className="text-xl font-semibold text-text-primary mb-1">
          Join {invite.repo.owner}/{invite.repo.name}
        </h1>
        <p className="text-sm text-text-secondary mb-4">
          {invite.createdBy} invited you to collaborate as{" "}
          <span className="font-medium">{invite.permission}</span>.
        </p>
        {invite.repo.description && (
          <p className="text-sm text-text-secondary border-l-2 border-border pl-3 mb-4 italic">
            {invite.repo.description}
          </p>
        )}
        {invite.expiresAt && (
          <p className="text-xs text-text-secondary mb-4">
            Expires {new Date(invite.expiresAt).toLocaleString()}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={handleAccept} disabled={accepting} className="btn-primary">
            {accepting ? "Joining…" : "Accept"}
          </button>
          <Link to="/" className="btn-secondary">
            Decline
          </Link>
        </div>
      </div>
    </div>
  );
}
