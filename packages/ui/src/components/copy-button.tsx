"use client";

import { useState, useCallback } from "react";

/**
 * Small "copy to clipboard" button. Pinned to the top-right of its parent
 * (parent must be `position: relative`). Two-second confirmation flash so
 * the user knows the copy went through.
 */
export function CopyButton({
  text,
  label = "copy",
  ariaLabel = "Copy to clipboard",
  className = "",
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / iframe sandboxes — swallow silently. The text is
      // still selectable, which is the fallback we trust.
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border border-border bg-surface text-text-secondary hover:text-accent hover:border-accent/40 transition-colors ${className}`}
    >
      {copied ? "copied" : label}
    </button>
  );
}
