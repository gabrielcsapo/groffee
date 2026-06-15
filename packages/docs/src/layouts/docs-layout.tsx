import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Wordmark } from "@groffee/ui";
import { SidebarNav } from "../components/sidebar-nav";
import { ThemeToggle } from "../components/theme-toggle";
import { Search } from "../components/search";
import { PageToc } from "../components/page-toc";
import { GitHubLink } from "../components/github-link";

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isApi = location.pathname.endsWith("/api");

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — same as the live product: transparent over the canvas,
       * hairline bottom border, Wordmark on the left, search in the
       * middle, theme toggle + GitHub on the right. */}
      <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
            aria-label="Toggle navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <Link
            to="/"
            className="shrink-0 hover:no-underline hover:opacity-80"
            aria-label="Groffee home"
          >
            <Wordmark
              height={22}
              textColor="var(--color-text-primary)"
              cupColor="var(--color-accent)"
            />
          </Link>
          <div className="flex-1 flex justify-center">
            <Search />
          </div>
          <GitHubLink />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {sidebarOpen && (
          <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <aside
              className="absolute left-0 top-14 bottom-0 w-64 bg-surface border-r border-border overflow-y-auto p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        <aside className="hidden lg:block w-64 shrink-0 border-r border-border overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
          <div className="p-4">
            <SidebarNav />
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8 lg:px-12">
          <Outlet />
        </main>

        {!isApi && (
          <aside className="hidden xl:block w-56 shrink-0 px-4 py-8">
            <PageToc />
          </aside>
        )}
      </div>
    </div>
  );
}
