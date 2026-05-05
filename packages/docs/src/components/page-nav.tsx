import { Link, useLocation } from "react-router";
import { flatNav } from "../nav-data";

export function PageNav() {
  const location = useLocation();
  const idx = flatNav.findIndex((i) => i.to === location.pathname);
  if (idx === -1) return null;

  const prev = idx > 0 ? flatNav[idx - 1] : null;
  const next = idx < flatNav.length - 1 ? flatNav[idx + 1] : null;
  if (!prev && !next) return null;

  return (
    <nav className="not-prose mt-12 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {prev ? (
        <Link
          to={prev.to}
          className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group"
        >
          <div className="text-xs text-text-secondary mb-1">← Previous</div>
          <div className="text-sm font-medium text-text-primary group-hover:text-primary">
            {prev.label}
          </div>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={next.to}
          className="card p-4 hover:no-underline hover:border-primary/50 transition-colors group sm:text-right"
        >
          <div className="text-xs text-text-secondary mb-1">Next →</div>
          <div className="text-sm font-medium text-text-primary group-hover:text-primary">
            {next.label}
          </div>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
