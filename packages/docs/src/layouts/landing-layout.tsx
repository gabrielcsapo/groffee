import { Link, Outlet } from "react-router";
import { GroffeeLogo } from "@groffee/ui";
import { ThemeToggle } from "../components/theme-toggle";

export function LandingLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-header-bg border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white hover:no-underline">
            <GroffeeLogo size={24} className="text-white" />
            <span className="font-semibold text-sm">Groffee</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/docs/getting-started"
              className="text-white/70 text-xs font-medium hover:text-white hover:no-underline px-2 py-1.5 rounded-md hover:bg-white/10"
            >
              Docs
            </Link>
            <Link
              to="/docs/api"
              className="text-white/70 text-xs font-medium hover:text-white hover:no-underline px-2 py-1.5 rounded-md hover:bg-white/10"
            >
              API
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
