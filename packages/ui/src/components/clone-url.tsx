"use client";

import { useState, useEffect } from "react";

export function CloneUrl({
  path,
  inline,
  hasLfs,
}: {
  path: string;
  inline?: boolean;
  hasLfs?: boolean;
}) {
  const [origin, setOrigin] = useState("");
  const [protocol, setProtocol] = useState<"https" | "ssh">("https");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const httpsUrl = `${origin}${path}`;
  const hostname = origin ? new URL(origin).hostname : "localhost";
  const sshUrl = `ssh://git@${hostname}:2223${path}`;

  const url = protocol === "https" ? httpsUrl : sshUrl;

  if (inline) {
    return <span>{url}</span>;
  }

  return (
    <>
      <div className="flex items-center">
        <div className="flex border border-border rounded-l-md overflow-hidden shrink-0">
          <button
            onClick={() => setProtocol("https")}
            className={`px-2 py-1 text-xs font-medium ${
              protocol === "https"
                ? "bg-surface-secondary text-text-primary"
                : "bg-surface text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            HTTPS
          </button>
          <button
            onClick={() => setProtocol("ssh")}
            className={`px-2 py-1 text-xs font-medium border-l border-border ${
              protocol === "ssh"
                ? "bg-surface-secondary text-text-primary"
                : "bg-surface text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            SSH
          </button>
        </div>
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="px-3 py-1 text-xs font-mono text-text-secondary bg-surface border border-l-0 border-border rounded-r-md w-full min-w-0 focus:outline-none"
        />
      </div>
      {hasLfs && (
        <p className="mt-1.5 text-xs text-text-secondary">
          This repository uses Git LFS. Run{" "}
          <code className="px-1 py-0.5 bg-surface-secondary rounded text-[11px]">
            git lfs install
          </code>{" "}
          before cloning.
        </p>
      )}
    </>
  );
}
