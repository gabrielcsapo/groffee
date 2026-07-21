import "./styles.css";
import { Link, Outlet, ScrollRestoration } from "react-flight-router/client";
import { GlobalNavigationLoadingBar, HeaderSearch, UserNav } from "./routes/root.client";
import { Wordmark } from "@groffee/ui";
import { getSessionUser } from "./lib/server/auth";

export default async function Root() {
  const sessionUserRecord = await getSessionUser();
  const sessionUser = sessionUserRecord
    ? {
        username: sessionUserRecord.username,
        email: sessionUserRecord.email ?? null,
        isAdmin: !!sessionUserRecord.isAdmin,
        avatarUploadId: sessionUserRecord.avatarUploadId ?? null,
      }
    : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')})()`,
          }}
        />
        {/* Webfonts — Inter Tight, JetBrains Mono, Fraunces. Self-hosted
         * out of `public/fonts/` so a deployed Groffee never reaches out to
         * fonts.googleapis.com. Each family is a single variable woff2;
         * the manifest in `public/fonts/groffee-fonts.css` declares the
         * full variable-axis range and `font-display: swap`. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/fraunces.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/inter-tight.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/jetbrains-mono.woff2"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href="/fonts/groffee-fonts.css" />
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <title>Groffee</title>
      </head>
      <body className="flex flex-col min-h-screen bg-canvas text-text-primary">
        <ScrollRestoration />
        {/* Header — transparent over the warm canvas with a hairline border,
         * not a dark bar floating over a light body (the GitHub pattern).
         * The wordmark uses Fraunces lowercase so the brand reads as
         * "editorial / coffee-house" rather than "another Tailwind app." */}
        <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-sm border-b border-border">
          <nav className="max-w-[1180px] mx-auto px-4 sm:px-5 h-14 flex items-center gap-2 sm:gap-5 min-w-0">
            <Link
              to="/"
              className="text-text-primary hover:no-underline shrink-0 hover:opacity-80 transition-opacity"
              aria-label="Groffee home"
            >
              <Wordmark
                height={22}
                textColor="var(--color-text-primary)"
                cupColor="var(--color-accent)"
                className="block"
              />
            </Link>
            <HeaderSearch />
            <div className="ml-auto hidden md:flex items-center gap-1">
              <Link
                to="/explore"
                className="text-text-secondary font-mono text-xs hover:text-text-primary hover:no-underline px-2 py-1.5 rounded-md hover:bg-surface-secondary transition-colors"
              >
                explore
              </Link>
              <Link
                to="/docs"
                className="text-text-secondary font-mono text-xs hover:text-text-primary hover:no-underline px-2 py-1.5 rounded-md hover:bg-surface-secondary transition-colors"
              >
                docs
              </Link>
            </div>
            <div className="hidden md:block h-6 w-px bg-border" aria-hidden="true" />
            <UserNav initialUser={sessionUser} />
          </nav>
        </header>
        <GlobalNavigationLoadingBar />
        <main className="flex-1 max-w-[1180px] min-w-0 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <Outlet />
        </main>
        <footer className="border-t border-border mt-auto">
          <div className="max-w-[1180px] mx-auto px-4 sm:px-5 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-text-secondary font-mono">
            <p>
              <span className="font-editorial italic">groffee</span> · locally roasted git
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/explore"
                className="text-text-secondary hover:text-text-primary hover:no-underline"
              >
                explore
              </Link>
              <Link
                to="/docs"
                className="text-text-secondary hover:text-text-primary hover:no-underline"
              >
                docs
              </Link>
              <span>self-hosted</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
