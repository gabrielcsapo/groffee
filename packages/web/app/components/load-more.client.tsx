"use client";

import { useState } from "react";

/**
 * Reusable "Load more" button for cursor-paginated lists.
 *
 * Caller owns the page state — this component only fires `onLoad` and shows
 * a pending state. We don't optimistically render in here so callers can
 * decide where appended items insert.
 */
export function LoadMore({
  hasMore,
  onLoad,
  label = "Load more",
}: {
  hasMore: boolean;
  onLoad: () => Promise<void>;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  if (!hasMore) return null;
  return (
    <div className="flex justify-center mt-3">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          if (loading) return;
          setLoading(true);
          try {
            await onLoad();
          } finally {
            setLoading(false);
          }
        }}
        className="px-3 py-1.5 text-sm border border-border rounded-md bg-surface text-text-secondary hover:bg-surface-secondary disabled:opacity-60 disabled:cursor-progress transition-colors"
      >
        {loading ? "Loading…" : label}
      </button>
    </div>
  );
}
