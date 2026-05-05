import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import MiniSearch from "minisearch";
import searchData from "virtual:search-index";

interface SearchResult {
  id: string;
  title: string;
  path: string;
  section: string;
  content: string;
  match: Record<string, string[]>;
  terms: string[];
}

function useSearchIndex() {
  return useMemo(() => {
    const index = new MiniSearch({
      fields: ["title", "content"],
      storeFields: ["title", "path", "section", "content"],
      searchOptions: {
        boost: { title: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
    index.addAll(searchData);
    return index;
  }, []);
}

/** Slice ~120 chars around the first occurrence of any matched term. */
function snippetFor(
  content: string,
  terms: string[],
): { before: string; hit: string; after: string } | null {
  if (!content || terms.length === 0) return null;
  const lower = content.toLowerCase();
  let earliestIdx = -1;
  let hitTerm = "";
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
      earliestIdx = idx;
      hitTerm = content.slice(idx, idx + term.length);
    }
  }
  if (earliestIdx === -1) return null;
  const radius = 60;
  const start = Math.max(0, earliestIdx - radius);
  const end = Math.min(content.length, earliestIdx + hitTerm.length + radius);
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, earliestIdx),
    hit: hitTerm,
    after: content.slice(earliestIdx + hitTerm.length, end) + (end < content.length ? "…" : ""),
  };
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full max-w-xs gap-2 px-3 py-1.5 text-sm text-text-secondary bg-surface border border-border rounded-md hover:border-border-muted hover:bg-surface-secondary"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <span className="flex-1 text-left">Search docs...</span>
      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium text-text-secondary">
        <kbd className="px-1.5 py-0.5 bg-surface-secondary border border-border rounded">/</kbd>
      </span>
    </button>
  );
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const index = useSearchIndex();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return (index.search(query) as unknown as SearchResult[]).slice(0, 10);
  }, [query, index]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const goTo = useCallback(
    (result: SearchResult) => {
      navigate(result.path);
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        goTo(results[activeIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, activeIndex, goTo, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <svg
            className="w-5 h-5 text-text-secondary shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation..."
            className="flex-1 py-3 text-sm bg-transparent outline-none text-text-primary placeholder:text-text-secondary"
          />
          <kbd
            onClick={onClose}
            className="cursor-pointer px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-secondary bg-surface-secondary border border-border rounded"
          >
            ESC
          </kbd>
        </div>

        {query.trim() && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No results found for "{query}"
              </div>
            ) : (
              results.map((result, i) => {
                const snippet = snippetFor(result.content, result.terms ?? []);
                return (
                  <button
                    key={result.id}
                    onClick={() => goTo(result)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 ${
                      i === activeIndex ? "bg-primary/10" : "hover:bg-surface-secondary"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 text-text-secondary shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {result.title}
                      </div>
                      {snippet ? (
                        <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {snippet.before}
                          <mark className="bg-primary/20 text-text-primary rounded-sm px-0.5">
                            {snippet.hit}
                          </mark>
                          {snippet.after}
                        </div>
                      ) : (
                        <div className="text-xs text-text-secondary capitalize">
                          {result.section}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {!query.trim() && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            Start typing to search...
          </div>
        )}
      </div>
    </div>
  );
}

export function Search() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // `/` opens search, but only when the user isn't already typing into an input.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable = target?.isContentEditable;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <SearchButton onClick={() => setOpen(true)} />
      <SearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
