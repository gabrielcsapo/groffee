import "./styles.css";
import { Link, Outlet } from "react-router";
import { DumpError, GlobalNavigationLoadingBar, UserNav } from "./routes/root.client";
import { GroffeeLogo } from "./components/groffee-logo";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>Groffee</title>
      </head>
      <body className="flex flex-col min-h-screen">
        <header className="bg-text-primary shadow-md sticky top-0 z-30">
          <nav className="max-w-[1280px] mx-auto px-6 h-16 flex items-center gap-6">
            <Link
              to="/"
              className="text-white font-semibold text-lg hover:no-underline flex items-center gap-2 shrink-0"
            >
              <GroffeeLogo size={32} className="text-white" />
              Groffee
            </Link>
            <Link
              to="/explore"
              className="text-white/70 text-sm hover:text-white hover:no-underline"
            >
              Explore
            </Link>
            <Link to="/docs" className="text-white/70 text-sm hover:text-white hover:no-underline">
              API Docs
            </Link>
            <div className="flex-1" />
            <UserNav />
          </nav>
        </header>
        <GlobalNavigationLoadingBar />
        <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-6">{children}</main>
        <footer className="border-t border-border mt-auto">
          <div className="max-w-[1280px] mx-auto px-6 py-6 flex items-center justify-between text-xs text-text-secondary">
            <p>Powered by Groffee</p>
            <div className="flex items-center gap-4">
              <Link
                to="/explore"
                className="text-text-secondary hover:text-text-primary hover:no-underline"
              >
                Explore
              </Link>
              <Link
                to="/docs"
                className="text-text-secondary hover:text-text-primary hover:no-underline"
              >
                API Docs
              </Link>
              <span>Self-hosted git platform</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

export default function Component() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return <DumpError />;
}
