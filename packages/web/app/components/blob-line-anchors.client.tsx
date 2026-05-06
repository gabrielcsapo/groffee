"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Parse a hash like "#L42" or "#L42-L60" into a [start, end] range.
 * Returns null if the hash isn't a recognizable line range.
 */
function parseHash(hash: string): [number, number] | null {
  const m = hash.match(/^#?L(\d+)(?:-L(\d+))?$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = m[2] ? parseInt(m[2], 10) : a;
  if (Number.isNaN(a) || Number.isNaN(b) || a < 1 || b < 1) return null;
  return a <= b ? [a, b] : [b, a];
}

/**
 * Apply / remove the highlight CSS class on line rows based on the current hash.
 */
function applyHighlight(range: [number, number] | null) {
  if (typeof document === "undefined") return;
  const prev = document.querySelectorAll(".blob-line-highlight");
  prev.forEach((el) => el.classList.remove("blob-line-highlight"));
  if (!range) return;
  const [start, end] = range;
  for (let i = start; i <= end; i++) {
    const row = document.getElementById(`L${i}`);
    if (row) row.classList.add("blob-line-highlight");
  }
}

/**
 * Wraps the blob table and watches `window.location.hash` to highlight the
 * referenced line(s). Also scrolls the first highlighted line into view on
 * initial load (the browser handles native scroll-to-id, but we re-trigger
 * to handle late-mounting content / shiki suspense fallbacks).
 */
export function BlobHashHighlight({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const sync = () => {
      const range = parseHash(window.location.hash);
      applyHighlight(range);
      if (range) {
        const target = document.getElementById(`L${range[0]}`);
        if (target) {
          target.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
    };
    // Initial pass — content may have just rendered, so re-apply.
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return <>{children}</>;
}

/**
 * Click target for a single line number in the blob table.
 *
 * - Plain click: sets hash to `#L<n>` and stores `n` as the anchor for
 *   subsequent shift-clicks.
 * - Shift-click: extends the selection from the stored anchor to `n`,
 *   producing a range hash like `#L42-L60`.
 *
 * The anchor is stored in module state so it persists across re-renders
 * but is reset whenever a non-shift click happens.
 */
let selectionAnchor: number | null = null;

export function BlobLineNumber({ lineNumber }: { lineNumber: number }) {
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Allow opening in new tab / window with modifier keys (except plain shift).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      let hash: string;
      if (e.shiftKey && selectionAnchor != null && selectionAnchor !== lineNumber) {
        const lo = Math.min(selectionAnchor, lineNumber);
        const hi = Math.max(selectionAnchor, lineNumber);
        hash = `#L${lo}-L${hi}`;
      } else {
        selectionAnchor = lineNumber;
        hash = `#L${lineNumber}`;
      }
      // Use history.replaceState + manual hashchange dispatch so we don't
      // push a new entry per click; replicate the browser's native behaviour
      // of updating the URL bar without a full navigation.
      const url = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
    [lineNumber],
  );

  return (
    <a
      href={`#L${lineNumber}`}
      onClick={onClick}
      className="block text-right text-text-secondary hover:text-text-link no-underline"
      aria-label={`Line ${lineNumber}`}
    >
      {lineNumber}
    </a>
  );
}

/**
 * "Copy permalink" button for the file header. Builds a URL using the commit
 * SHA (so the link is stable across history) and the current hash (so the
 * line selection is preserved).
 */
export function CopyPermalinkButton({
  owner,
  repo,
  commitSha,
  path,
}: {
  owner: string;
  repo: string;
  commitSha: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const url = `${window.location.origin}/${owner}/${repo}/blob/${commitSha}/${path}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select an off-screen input. Best-effort only.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [owner, repo, commitSha, path]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-text-link hover:underline cursor-pointer bg-transparent border-0 p-0"
      title="Copy a permalink to this file at the current commit"
    >
      {copied ? "Copied!" : "Copy permalink"}
    </button>
  );
}
