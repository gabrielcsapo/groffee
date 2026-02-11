"use client";

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";

export function BranchSwitcher({
  branches,
  currentRef,
  basePath,
}: {
  branches: { name: string }[];
  currentRef: string;
  basePath: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchBranch(branch: string) {
    setOpen(false);
    if (branch === currentRef) return;
    navigate(`${basePath}/tree/${encodeURIComponent(branch)}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
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
        <span className="font-medium">{currentRef}</span>
        {branches.length > 1 && (
          <svg
            className="w-3 h-3 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>
      {open && branches.length > 1 && (
        <div className="absolute z-10 mt-1 w-48 bg-surface border border-border rounded-md shadow-lg overflow-hidden">
          <div className="py-1">
            {branches.map((b) => (
              <button
                key={b.name}
                onClick={() => switchBranch(b.name)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary ${
                  b.name === currentRef
                    ? "font-semibold text-text-primary"
                    : "text-text-secondary"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
