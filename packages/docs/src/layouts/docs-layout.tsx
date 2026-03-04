import { useState } from "react";
import { Link, Outlet } from "react-router";
import { GroffeeLogo } from "@groffee/ui";
import { SidebarNav } from "../components/sidebar-nav";
import { ThemeToggle } from "../components/theme-toggle";
import { Search } from "../components/search";

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-header-bg border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10"
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
          <Link to="/" className="flex items-center gap-2 text-white hover:no-underline shrink-0">
            <GroffeeLogo size={24} className="text-white" />
            <span className="font-semibold text-sm">Groffee</span>
          </Link>
          <div className="flex-1 flex justify-center">
            <Search />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Mobile sidebar overlay */}
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

        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
          <div className="p-4">
            <SidebarNav />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 py-8 lg:px-12">
          <div className="max-w-3xl mx-auto">
            <article className="markdown-body">
              <Outlet />
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
