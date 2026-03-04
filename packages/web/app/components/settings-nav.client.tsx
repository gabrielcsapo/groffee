"use client";

import { Link, useLocation } from "react-flight-router/client";

export function SettingsNav() {
  const location = useLocation();
  const links = [
    { to: "/settings/profile", label: "Profile", exact: true },
    { to: "/settings/password", label: "Password", exact: true },
    { to: "/settings/keys", label: "SSH Keys", exact: true },
    { to: "/settings/tokens", label: "Access Tokens", exact: true },
  ];

  return (
    <nav className="flex gap-1 mb-6 border-b border-border pb-3">
      {links.map((link) => {
        const active = link.exact
          ? location.pathname === link.to
          : location.pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`px-3 py-1.5 rounded-md text-sm font-medium hover:no-underline transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
