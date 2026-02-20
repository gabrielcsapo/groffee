"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { useNavigate } from "react-router";
import { getRepoFilePaths } from "../lib/server/repos";

/**
 * Fuzzy match: all chars in pattern must appear in order in target.
 * Returns score (lower = better) and match indices, or null.
 */
function fuzzyMatch(
  pattern: string,
  target: string,
): { score: number; indices: number[] } | null {
  const pLower = pattern.toLowerCase();
  const tLower = target.toLowerCase();
  const indices: number[] = [];
  let pIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let tIdx = 0; tIdx < tLower.length && pIdx < pLower.length; tIdx++) {
    if (tLower[tIdx] === pLower[pIdx]) {
      indices.push(tIdx);
      if (lastMatchIdx !== tIdx - 1) {
        score += tIdx - (lastMatchIdx + 1);
      }
      if (tIdx === 0 || target[tIdx - 1] === "/" || target[tIdx - 1] === ".") {
        score -= 5;
      }
      lastMatchIdx = tIdx;
      pIdx++;
    }
  }

  if (pIdx !== pLower.length) return null;
  score += target.length * 0.1;
  return { score, indices };
}

function HighlightedPath({
  path,
  indices,
}: {
  path: string;
  indices: number[];
}) {
  const indexSet = new Set(indices);
  const parts: { text: string; highlight: boolean }[] = [];
  let current = "";
  let isHighlight = false;

  for (let i = 0; i < path.length; i++) {
    const shouldHighlight = indexSet.has(i);
    if (shouldHighlight !== isHighlight) {
      if (current) parts.push({ text: current, highlight: isHighlight });
      current = "";
      isHighlight = shouldHighlight;
    }
    current += path[i];
  }
  if (current) parts.push({ text: current, highlight: isHighlight });

  return (
    <span className="font-mono text-sm">
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={i}
            className="bg-yellow-200 dark:bg-yellow-800 text-text-primary rounded-sm px-px"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

const MAX_RESULTS = 50;

// Context to share open state between trigger buttons and modal
const FileSearchContext = createContext<{
  open: () => void;
} | null>(null);

/**
 * Provider component that renders the modal and provides open() to children.
 * Place this once in the repo page, then use <FileSearchButton /> anywhere inside.
 */
export function FileSearchProvider({
  owner,
  repo,
  currentRef,
  children,
}: {
  owner: string;
  repo: string;
  currentRef: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allPaths, setAllPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load file paths when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setQuery("");
    setSelectedIdx(0);
    getRepoFilePaths(owner, repo, currentRef)
      .then((data) => setAllPaths(data.paths || []))
      .catch(() => setAllPaths([]))
      .finally(() => setLoading(false));
  }, [isOpen, owner, repo, currentRef]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keyboard shortcut: "t" to open (like GitHub)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === "t" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Compute filtered results
  const results = (() => {
    if (!query.trim()) {
      return allPaths.slice(0, MAX_RESULTS).map((p) => ({
        path: p,
        indices: [] as number[],
        score: 0,
      }));
    }
    const matches: { path: string; indices: number[]; score: number }[] = [];
    for (const p of allPaths) {
      const m = fuzzyMatch(query, p);
      if (m) {
        matches.push({ path: p, indices: m.indices, score: m.score });
      }
    }
    matches.sort((a, b) => a.score - b.score);
    return matches.slice(0, MAX_RESULTS);
  })();

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx] as
        | HTMLElement
        | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  const goToFile = useCallback(
    (filePath: string) => {
      navigate(`/${owner}/${repo}/blob/${currentRef}/${filePath}`);
      setIsOpen(false);
    },
    [navigate, owner, repo, currentRef],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      goToFile(results[selectedIdx].path);
    }
  }

  return (
    <FileSearchContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div
            className="relative w-full max-w-lg mx-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-surface border border-border rounded-md shadow-2xl overflow-hidden ring-1 ring-black/5">
              {/* Search input */}
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-3 bg-surface-secondary border border-border rounded-lg px-3 py-2.5">
                  <svg
                    className="w-5 h-5 text-text-secondary/50 flex-shrink-0"
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
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Go to file..."
                    className="modal-input flex-1 bg-transparent border-none text-text-primary placeholder:text-text-secondary/50 text-base"
                  />
                  <kbd className="text-[10px] text-text-secondary/50 border border-border rounded px-1.5 py-0.5 leading-none">
                    ESC
                  </kbd>
                </div>
              </div>

              {/* Results list */}
              <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-8 text-center text-sm text-text-secondary">
                    Loading files...
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-secondary">
                    {query ? "No files match" : "No files found"}
                  </div>
                ) : (
                  results.map((result, i) => (
                    <button
                      key={result.path}
                      type="button"
                      onClick={() => goToFile(result.path)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
                        i === selectedIdx
                          ? "bg-primary/10 text-text-primary"
                          : "text-text-secondary hover:bg-surface-secondary"
                      }`}
                    >
                      <svg
                        className="w-4 h-4 text-text-secondary flex-shrink-0"
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
                      {query ? (
                        <HighlightedPath
                          path={result.path}
                          indices={result.indices}
                        />
                      ) : (
                        <span className="font-mono text-sm">{result.path}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              {!loading && results.length > 0 && (
                <div className="px-4 py-2 border-t border-border text-xs text-text-secondary flex items-center gap-3">
                  <span>
                    <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">
                      &uarr;
                    </kbd>{" "}
                    <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">
                      &darr;
                    </kbd>{" "}
                    navigate
                  </span>
                  <span>
                    <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">
                      Enter
                    </kbd>{" "}
                    open
                  </span>
                  {allPaths.length > MAX_RESULTS && !query && (
                    <span className="ml-auto">
                      {allPaths.length.toLocaleString()} files
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </FileSearchContext.Provider>
  );
}

/**
 * Search-input-styled trigger button. Place anywhere inside a FileSearchProvider.
 */
export function FileSearchButton() {
  const ctx = useContext(FileSearchContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.open()}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-text-secondary/60 bg-surface border border-border rounded-md hover:border-border-hover hover:text-text-secondary transition-colors cursor-text"
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
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
      <span className="flex-1 text-left">Go to file</span>
      <kbd className="text-[10px] text-text-secondary/40 border border-border rounded px-1.5 py-0.5 leading-none font-mono">
        t
      </kbd>
    </button>
  );
}
