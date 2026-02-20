import "./styles.css";
import { Link, Outlet } from "react-router";
import {
  DumpError,
  GlobalNavigationLoadingBar,
  HeaderSearch,
  UserNav,
} from "./routes/root.client";
import { GroffeeLogo } from "./components/groffee-logo";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')})()`,
          }}
        />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <title>Groffee</title>
      </head>
      <body className="flex flex-col min-h-screen">
        <header className="bg-header-bg sticky top-0 z-30 pb-px shadow-sm">
          <nav className="max-w-[1280px] mx-auto px-4 h-16 flex items-center gap-4">
            <Link
              to="/"
              className="text-white hover:no-underline flex items-center shrink-0 hover:opacity-80 transition-opacity"
            >
              <GroffeeLogo size={32} className="text-white" />
            </Link>
            <HeaderSearch />
            <div className="flex items-center gap-1">
              <Link
                to="/explore"
                className="text-white/70 text-xs font-medium hover:text-white hover:no-underline px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                Explore
              </Link>
              <Link
                to="/docs"
                className="text-white/70 text-xs font-medium hover:text-white hover:no-underline px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                API
              </Link>
            </div>
            <UserNav />
          </nav>
        </header>
        <GlobalNavigationLoadingBar />
        <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-6">
          {children}
        </main>
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
