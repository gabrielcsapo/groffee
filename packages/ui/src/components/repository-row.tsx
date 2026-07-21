import type { ReactNode } from "react";

interface RepositoryRowProps {
  owner: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  updatedAt?: string | null;
  showOwner?: boolean;
  dense?: boolean;
  variant?: "row" | "card";
  /** Override the link target. Defaults to `/${owner}/${name}`. */
  href?: string;
  /** Renderer for the link element so consumers can plug in their router's `<Link>`. */
  linkAs?: (props: { to: string; className: string; children: ReactNode }) => ReactNode;
  /** Slot rendered after the name+badge row (e.g. language, stars). */
  trailing?: ReactNode;
  timeAgo: (iso: string) => string;
}

function RepoIcon() {
  return (
    <svg
      className="w-4 h-4 text-text-secondary shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

export function RepositoryRow(props: RepositoryRowProps) {
  const {
    owner,
    name,
    description,
    isPublic,
    updatedAt,
    showOwner = true,
    dense = false,
    variant = "row",
    href,
    linkAs,
    trailing,
    timeAgo,
  } = props;

  const path = href ?? `/${owner}/${name}`;
  /* Title uses the monospace UI font — repo paths are a code identifier,
   * not prose. This is one of the key density+brand moves: GitHub renders
   * `org/repo` in a UI font; Groffee renders it in JetBrains Mono so it
   * reads like a path. */
  const titleClass = dense
    ? "text-[13px] font-mono font-semibold text-text-primary hover:text-accent hover:underline decoration-accent/40"
    : "text-[14px] font-mono font-semibold text-text-primary hover:text-accent hover:underline decoration-accent/40";
  const wrapperClass =
    variant === "card"
      ? "bg-surface border border-border rounded-lg p-3.5 hover:border-accent/40 transition-colors"
      : dense
        ? "px-4 py-2.5"
        : "px-4 py-3";

  const titleNode = (
    <>
      {showOwner ? (
        <>
          <span className="text-text-secondary font-normal">{owner}</span>
          <span className="text-text-secondary font-normal">/</span>
          {name}
        </>
      ) : (
        name
      )}
    </>
  );

  const titleLink = linkAs ? (
    linkAs({ to: path, className: titleClass, children: titleNode })
  ) : (
    <a href={path} className={titleClass}>
      {titleNode}
    </a>
  );

  return (
    <div className={wrapperClass}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start sm:items-center gap-2 mb-1 min-w-0">
            <RepoIcon />
            {titleLink}
            <span className={`badge shrink-0 ${isPublic ? "badge-public" : "badge-private"}`}>
              {isPublic ? "Public" : "Private"}
            </span>
            {trailing}
          </div>
          {description && (
            <p className={`text-text-secondary ml-6 ${dense ? "text-xs mt-0.5" : "text-sm mt-1"}`}>
              {description}
            </p>
          )}
        </div>
        {updatedAt && (
          <span className="text-xs text-text-secondary whitespace-nowrap ml-6 sm:ml-0 sm:mt-1">
            Updated {timeAgo(updatedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
