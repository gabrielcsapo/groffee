"use client";

import { useEffect, useRef, useState } from "react";

type Tab = "https" | "ssh" | "cli";

interface CloneInfo {
  owner: string;
  repo: string;
  hasLfs?: boolean;
}

/**
 * Clone helper popover. Replaces the inline HTTPS/SSH toggle on the repo home
 * About sidebar with a single "Clone" button that opens a small popover with
 * tabs for HTTPS, SSH, CLI helper, and an "Open in VS Code" deep link.
 *
 * Host is read from `window.location.host` rather than hardcoded so this works
 * across deployments (groffee.local, prod hostname, IP, etc.).
 */
export function ClonePopover({ owner, repo, hasLfs }: CloneInfo) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("https");
  const [origin, setOrigin] = useState("");
  const [copiedTab, setCopiedTab] = useState<Tab | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const path = `/${owner}/${repo}.git`;
  const httpsUrl = origin ? `${origin}${path}` : `${path}`;
  const hostname = origin ? new URL(origin).hostname : "localhost";
  const sshUrl = `git@${hostname}:${owner}/${repo}.git`;
  const httpsCmd = `git clone ${httpsUrl}`;
  const sshCmd = `git clone ${sshUrl}`;
  const cliCmd = `gh repo clone ${owner}/${repo}`;
  const vscodeUrl = `vscode://vscode.git/clone?url=${encodeURIComponent(httpsUrl)}`;

  async function copy(tabName: Tab, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTab(tabName);
      setTimeout(() => setCopiedTab(null), 1500);
    } catch {
      // Best effort — clipboard may be unavailable in some contexts (e.g., http).
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "https", label: "HTTPS" },
    { id: "ssh", label: "SSH" },
    { id: "cli", label: "CLI" },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center justify-center gap-1.5 w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 hover:bg-surface-secondary"
      >
        <svg
          className="w-4 h-4 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
        <span className="font-medium">Clone</span>
        <svg
          className="w-3 h-3 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 z-30 mt-1 w-80 bg-surface border border-border rounded-md shadow-lg overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex text-sm border-b border-border bg-surface-secondary/40">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-3 py-1.5 ${
                  tab === t.id
                    ? "text-text-primary font-medium border-b-2 border-primary -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2">
            {tab === "https" && (
              <>
                <p className="text-xs text-text-secondary">Clone using the web URL.</p>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={httpsCmd}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-2 py-1 text-xs font-mono text-text-secondary bg-surface-secondary border border-border rounded-md min-w-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copy("https", httpsCmd)}
                    className="btn-secondary btn-sm whitespace-nowrap"
                  >
                    {copiedTab === "https" ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            )}

            {tab === "ssh" && (
              <>
                <p className="text-xs text-text-secondary">
                  Use an SSH key and a passphrase from your account.
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={sshCmd}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-2 py-1 text-xs font-mono text-text-secondary bg-surface-secondary border border-border rounded-md min-w-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copy("ssh", sshCmd)}
                    className="btn-secondary btn-sm whitespace-nowrap"
                  >
                    {copiedTab === "ssh" ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            )}

            {tab === "cli" && (
              <>
                <p className="text-xs text-text-secondary">
                  Work fast with the GitHub-compatible CLI.
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={cliCmd}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-2 py-1 text-xs font-mono text-text-secondary bg-surface-secondary border border-border rounded-md min-w-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copy("cli", cliCmd)}
                    className="btn-secondary btn-sm whitespace-nowrap"
                  >
                    {copiedTab === "cli" ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            )}

            {hasLfs && (
              <p className="text-[11px] text-text-secondary">
                This repository uses Git LFS. Run{" "}
                <code className="px-1 py-0.5 bg-surface-secondary rounded text-[11px]">
                  git lfs install
                </code>{" "}
                before cloning.
              </p>
            )}

            <div className="pt-1 border-t border-border">
              <a
                href={vscodeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-surface-secondary text-text-primary"
              >
                <svg
                  className="w-4 h-4 text-text-secondary"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.7 1.3a1.7 1.7 0 0 1 1 .26L22 3.4a1.7 1.7 0 0 1 .76 2.27l-9 18a1.7 1.7 0 0 1-2.61.41l-3.6-3.6-4.31 3.27a.85.85 0 0 1-1.27-.46L0 19.5l6.5-7.5L0 4.5l1.97-3.79a.85.85 0 0 1 1.27-.46l4.31 3.27 3.6-3.6A1.7 1.7 0 0 1 12.5 0c.42 0 .82.14 1.13.4l4.07 3.4-3.07 7-3.83 4 3.83 4 3.07 7-4.07 3.4c-.31.26-.71.4-1.13.4z" />
                </svg>
                Open in VS Code
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
