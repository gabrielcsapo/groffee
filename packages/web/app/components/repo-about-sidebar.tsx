import { Link } from "react-flight-router/client";
import { ClonePopover } from "./clone-popover.client";

export interface RepoAboutLanguage {
  name: string;
  color: string;
  percentage: number;
}

export interface RepoAboutSidebarProps {
  owner: string;
  repo: string;
  description: string | null;
  /** Path of the README file (relative to the ref), if any. */
  readmePath?: string | null;
  /** Path of the LICENSE file (relative to the ref), if any. */
  licensePath?: string | null;
  /** When set, the README link scrolls to `#readme` on the repo home; otherwise it
   * resolves the absolute blob path so the sidebar works on tree/blob routes. */
  readmeAnchor?: boolean;
  /** Active ref (branch or tag). Used to build absolute blob URLs for
   * README/license. NOT named `ref` — that name is reserved by React
   * (it's intercepted as a forwarded ref and rejected in server-component
   * trees with "Refs cannot be used in Server Components"). */
  gitRef?: string;
  languages?: RepoAboutLanguage[];
  hasLfs?: boolean;
}

/**
 * Repo About sidebar. Lifted from `routes/repo.tsx` so the same content renders
 * on tree and blob views (and any future view that wants the same right-rail
 * context). The Languages block is omitted on subtree views — it would either
 * be wrong (tree-relative) or stale (HEAD-relative on a non-default branch).
 */
export function RepoAboutSidebar({
  owner,
  repo,
  description,
  readmePath,
  licensePath,
  readmeAnchor = false,
  gitRef,
  languages = [],
  hasLfs,
}: RepoAboutSidebarProps) {
  const readmeHref =
    readmeAnchor && readmePath
      ? "#readme"
      : readmePath && gitRef
        ? `/${owner}/${repo}/blob/${gitRef}/${readmePath}`
        : null;

  return (
    // Below xl the parent flex falls into a column, so the sidebar reflows
    // beneath the file tree / file content with a divider on top instead of a
    // border on the right edge.
    <div className="xl:w-64 flex-shrink-0 mt-6 pt-6 border-t border-border xl:mt-0 xl:pt-0 xl:border-t-0">
      {/* About */}
      <div className="border-b border-border pb-4 mb-4">
        <h3 className="text-base font-semibold text-text-primary mb-2">About</h3>
        {description ? (
          <p className="text-sm text-text-secondary mb-3">{description}</p>
        ) : (
          <p className="text-sm text-text-tertiary italic mb-3">No description provided</p>
        )}
        <div className="space-y-2.5 text-sm">
          {readmeHref &&
            (readmeAnchor ? (
              <a
                href={readmeHref}
                className="flex items-center gap-2 text-text-secondary hover:text-text-link"
              >
                <ReadmeIcon />
                Readme
              </a>
            ) : (
              <Link
                to={readmeHref}
                className="flex items-center gap-2 text-text-secondary hover:text-text-link"
              >
                <ReadmeIcon />
                Readme
              </Link>
            ))}
          {licensePath && gitRef && (
            <Link
              to={`/${owner}/${repo}/blob/${gitRef}/${licensePath}`}
              className="flex items-center gap-2 text-text-secondary hover:text-text-link"
            >
              <LicenseIcon />
              License
            </Link>
          )}
          <Link
            to={`/${owner}/${repo}/activity`}
            className="flex items-center gap-2 text-text-secondary hover:text-text-link"
          >
            <ActivityIcon />
            Activity
          </Link>
        </div>
      </div>

      {/* Clone */}
      <div className="border-b border-border pb-4 mb-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Clone</h3>
        <ClonePopover owner={owner} repo={repo} hasLfs={hasLfs} />
      </div>

      {/* Languages — only on the home view (where we know percentages are
       * computed against the HEAD tree). */}
      {languages.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-text-primary mb-3">Languages</h3>
          <div className="flex w-full rounded-full overflow-hidden mb-3" style={{ height: "10px" }}>
            {languages.map((lang) => (
              <div
                key={lang.name}
                style={{
                  width: `${lang.percentage}%`,
                  minWidth: "3px",
                  height: "100%",
                  backgroundColor: lang.color,
                }}
                title={`${lang.name} ${lang.percentage}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {languages.map((lang) => (
              <div key={lang.name} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                  style={{ backgroundColor: lang.color }}
                />
                <span className="text-text-primary font-medium">{lang.name}</span>
                <span className="text-text-secondary">{lang.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadmeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function LicenseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  );
}
