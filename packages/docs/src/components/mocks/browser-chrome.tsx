import type { ReactNode } from "react";

/** Wraps content in a macOS-style browser chrome frame. */
export function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-lg bg-surface not-prose">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary border-b border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 bg-surface rounded-md border border-border px-3 py-1 max-w-md w-full">
            <svg
              className="w-3 h-3 text-text-secondary shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span className="text-xs text-text-secondary truncate">{url}</span>
          </div>
        </div>
        <div className="w-[54px]" />
      </div>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  );
}
