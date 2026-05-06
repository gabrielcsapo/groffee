"use client";

import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from "react";

export interface RefPickerItem {
  name: string;
}

export interface RefPickerProps {
  branches: RefPickerItem[];
  tags?: RefPickerItem[];
  currentRef: string;
  /** Called with the chosen ref name. */
  onSelect: (ref: string) => void;
  /** Optional override for the trigger label (defaults to currentRef). */
  label?: string;
}

type Tab = "branches" | "tags";

export function RefPicker({ branches, tags = [], currentRef, onSelect, label }: RefPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Default to whichever tab the current ref lives on (so a user on a tag sees tags first).
  const initialTab: Tab = useMemo(() => {
    if (tags.some((t) => t.name === currentRef)) return "tags";
    return "branches";
  }, [tags, currentRef]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset tab when currentRef changes after mount.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Outside click & escape close.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Focus search when opened.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const items = tab === "branches" ? branches : tags;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  // Keep activeIndex in range when filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [tab, query]);

  // Scroll active option into view.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function commit(name: string) {
    setOpen(false);
    if (name === currentRef) return;
    onSelect(name);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = filtered[activeIndex];
      if (target) {
        e.preventDefault();
        commit(target.name);
      }
    } else if (e.key === "Tab") {
      // Toggle tab when there are tags available.
      if (tags.length > 0) {
        e.preventDefault();
        setTab((t) => (t === "branches" ? "tags" : "branches"));
      }
    }
  }

  const hasTags = tags.length > 0;
  const triggerLabel = label ?? currentRef;
  const interactive = branches.length + tags.length > 1;

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => interactive && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm bg-surface border border-border rounded-md px-3 py-1.5 hover:bg-surface-secondary"
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
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <span className="font-medium">{triggerLabel}</span>
        {interactive && (
          <svg
            className="w-3 h-3 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && interactive && (
        <div className="absolute z-30 mt-1 w-72 bg-surface border border-border rounded-md shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Find a ${tab === "branches" ? "branch" : "tag"}…`}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface-secondary text-text-primary placeholder:text-text-secondary/60"
            />
          </div>

          {/* Tabs */}
          {hasTags && (
            <div
              role="tablist"
              className="flex text-sm border-b border-border bg-surface-secondary/40"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "branches"}
                onClick={() => setTab("branches")}
                className={`flex-1 px-3 py-1.5 ${
                  tab === "branches"
                    ? "text-text-primary font-medium border-b-2 border-primary -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Branches <span className="text-text-secondary text-xs">({branches.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "tags"}
                onClick={() => setTab("tags")}
                className={`flex-1 px-3 py-1.5 ${
                  tab === "tags"
                    ? "text-text-primary font-medium border-b-2 border-primary -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Tags <span className="text-text-secondary text-xs">({tags.length})</span>
              </button>
            </div>
          )}

          {/* List */}
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-secondary">
                No {tab === "branches" ? "branches" : "tags"} match.
              </p>
            ) : (
              filtered.map((item, i) => {
                const isCurrent = item.name === currentRef;
                const isActive = i === activeIndex;
                return (
                  <button
                    key={item.name}
                    data-index={i}
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(item.name)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${
                      isActive ? "bg-surface-secondary" : ""
                    } ${isCurrent ? "font-semibold text-text-primary" : "text-text-primary"}`}
                  >
                    <span className="truncate">{item.name}</span>
                    {isCurrent && (
                      <svg
                        className="w-4 h-4 text-primary flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Backwards-compatible export. Existing callers passing `branches` + `onBranchChange`
// still work; new callers should use `RefPicker` directly.
export interface BranchSwitcherProps {
  branches: RefPickerItem[];
  tags?: RefPickerItem[];
  currentRef: string;
  onBranchChange: (branch: string) => void;
}

export function BranchSwitcher({
  branches,
  tags,
  currentRef,
  onBranchChange,
}: BranchSwitcherProps) {
  return (
    <RefPicker branches={branches} tags={tags} currentRef={currentRef} onSelect={onBranchChange} />
  );
}
