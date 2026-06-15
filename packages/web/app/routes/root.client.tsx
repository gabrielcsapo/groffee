"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigation, useRouter } from "react-flight-router/client";
import { type Theme, getStoredTheme, applyTheme } from "../lib/theme";
import { getSessionUser } from "../lib/server/auth";

export function GlobalNavigationLoadingBar() {
  const navigation = useNavigation();

  if (navigation.state === "idle") return null;

  return (
    <div className="h-0.5 w-full bg-primary/20 overflow-hidden fixed top-0 left-0 z-50">
      <div className="animate-progress origin-[0%_50%] w-full h-full bg-primary" />
    </div>
  );
}

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<"repo" | "global">("repo");
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigate } = useRouter();
  const location = useLocation();

  // Detect if on a repo page: /:owner/:repo/...
  const repoMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)/);
  const isRepoPage =
    repoMatch &&
    !["login", "register", "explore", "new", "search", "docs", "settings"].includes(repoMatch[1]);
  const repoOwner = isRepoPage ? repoMatch![1] : null;
  const repoName = isRepoPage ? repoMatch![2] : null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)
      ) {
        // Context-aware shortcut: on the docs page the rail has its own
        // search input wired to the endpoint index. Focus that instead of
        // opening the global Spotlight — sending the user to a
        // repos/code/users palette while they're reading API docs is the
        // wrong scope. The rail input opts in by tagging itself with
        // `data-docs-search`; if it isn't present (other routes) or isn't
        // visible (the rail is `hidden lg:block` so it's display:none on
        // narrow widths) we fall back to the global modal.
        e.preventDefault();
        const docsInput = document.querySelector<HTMLInputElement>("[data-docs-search]");
        if (docsInput && docsInput.offsetParent !== null) {
          docsInput.focus();
          docsInput.select();
          return;
        }
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearchScope("repo");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    if (!q) return;

    if (isRepoPage && searchScope === "repo") {
      navigate(`/${repoOwner}/${repoName}/search?q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
    setOpen(false);
  }

  return (
    <>
      {/* Trigger button — pill that lives in the warm header. Hover surfaces
       * the amber border so the brand color shows up in everyday interaction
       * rather than just on the landing page. */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 flex-1 max-w-sm px-3 py-1.5 font-mono text-xs text-text-secondary bg-surface-secondary border border-border rounded-md hover:border-accent/40 hover:text-text-primary transition-colors cursor-text"
      >
        <svg
          className="w-3.5 h-3.5 flex-shrink-0"
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
        <span className="flex-1 text-left truncate">type / to search</span>
        <kbd className="text-[10px] text-text-secondary bg-canvas border border-border rounded px-1 py-0.5 leading-none">
          /
        </kbd>
      </button>

      {/* Spotlight modal — rendered through a portal at `document.body`
       * because the sticky header above us uses `backdrop-blur-sm`, and
       * any element with `backdrop-filter` becomes a *containing block* for
       * its `position: fixed` descendants. Without the portal, `fixed
       * inset-0` resolves to "fill the header" (~56px tall) instead of
       * "fill the viewport", and the modal pins itself to the top of the
       * page mostly off-screen. `transform` ancestors have the same
       * pitfall — the portal handles both. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
            onClick={() => setOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Modal */}
            <div
              className="relative w-full max-w-lg mx-4 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSubmit}>
                <div className="bg-surface border border-border rounded-md shadow-2xl overflow-hidden ring-1 ring-black/5">
                  {/* Search input */}
                  <div className="p-5">
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
                        placeholder={
                          isRepoPage
                            ? `Search in ${repoOwner}/${repoName}...`
                            : "Search repositories, code, users..."
                        }
                        className="modal-input flex-1 bg-transparent border-none text-text-primary placeholder:text-text-secondary/50 text-base"
                      />
                      <kbd className="text-[10px] text-text-secondary/50 border border-border rounded px-1.5 py-0.5 leading-none">
                        ESC
                      </kbd>
                    </div>
                  </div>

                  {/* Scope selector */}
                  <div className="px-5 pb-4 text-sm">
                    {isRepoPage ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setSearchScope("repo")}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                            searchScope === "repo"
                              ? "bg-primary/10 text-primary"
                              : "text-text-secondary hover:bg-surface-secondary"
                          }`}
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
                              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                          </svg>
                          <span>
                            {repoOwner}/{repoName}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSearchScope("global")}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                            searchScope === "global"
                              ? "bg-primary/10 text-primary"
                              : "text-text-secondary hover:bg-surface-secondary"
                          }`}
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
                              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Search everywhere</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-text-secondary text-xs px-1">
                        Press Enter to search across all repositories
                      </p>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  function cycle() {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setThemeState(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={cycle}
      className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-surface-secondary transition-colors"
      title={`Theme: ${theme}`}
    >
      {theme === "dark" ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ) : theme === "light" ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

export function UserNav() {
  const [user, setUser] = useState<{
    username: string;
    email: string | null;
    isAdmin: boolean;
    avatarUploadId: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getSessionUser()
      .then((u) => {
        if (u)
          setUser({
            username: u.username,
            email: u.email ?? null,
            isAdmin: !!u.isAdmin,
            avatarUploadId: u.avatarUploadId ?? null,
          });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse-subtle" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link
          to="/login"
          className="text-text-secondary font-mono text-xs hover:text-text-primary hover:no-underline transition-colors"
        >
          sign in
        </Link>
        <Link to="/register" className="btn-primary btn-sm hover:no-underline">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <ThemeToggle />
      <Link
        to="/new"
        className="text-text-secondary hover:text-text-primary hover:no-underline p-1.5 rounded-md hover:bg-surface-secondary transition-colors"
        title="New repository"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-full hover:opacity-90 transition-opacity ring-2 ring-transparent hover:ring-accent/30"
          aria-label="User menu"
        >
          {user.avatarUploadId ? (
            <img
              src={`/api/uploads/${user.avatarUploadId}?w=64`}
              alt={`${user.username} avatar`}
              className="w-7 h-7 rounded-full object-cover bg-surface-secondary"
            />
          ) : (
            <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-medium font-mono">
              {user.username[0].toUpperCase()}
            </span>
          )}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-52 bg-surface border border-border rounded-lg shadow-xl z-50 py-1 animate-fade-in">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-sm font-semibold text-text-primary">{user.username}</p>
                {user.email && <p className="text-xs text-text-secondary truncate">{user.email}</p>}
              </div>
              <div className="py-1">
                <Link
                  to={`/${user.username}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                  onClick={() => setMenuOpen(false)}
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
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Your profile
                </Link>
                <Link
                  to="/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                  onClick={() => setMenuOpen(false)}
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
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  New repository
                </Link>
                <Link
                  to="/settings/keys"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                  onClick={() => setMenuOpen(false)}
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
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Settings
                </Link>
              </div>
              {user.isAdmin && (
                <div className="border-t border-border py-1">
                  <Link
                    to="/admin"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                    onClick={() => setMenuOpen(false)}
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
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    Admin
                  </Link>
                </div>
              )}
              <div className="border-t border-border py-1">
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/";
                  }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary"
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
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
