import { Link } from "react-flight-router/client";
import { getUserPage } from "../lib/server/users";
import { Avatar } from "../components/avatar";
import { timeAgo } from "../lib/time";
import { RepositoryRow } from "@groffee/ui";

export default async function UserProfile({ params }: { params?: Record<string, string> }) {
  const owner = params!.owner;
  const data = await getUserPage(owner);

  if (data.error || !data.user) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">User not found</h1>
        </div>
      </div>
    );
  }

  const user = data.user;
  const repos = data.repositories || [];

  // Normalize the website href: accept "example.com" by prepending https://
  // when the user didn't include a scheme. Stored value stays as the user typed
  // it; we only synthesize an href for the click-through.
  const websiteHref = user.website
    ? user.website.startsWith("http")
      ? user.website
      : `https://${user.website}`
    : null;

  return (
    <div className="max-w-6xl mx-auto mt-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Profile sidebar */}
        <aside className="lg:w-64 shrink-0">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-3">
            <Avatar user={user} size="xl" className="border-2" />
            <div className="min-w-0 flex-1 lg:w-full">
              <h1 className="font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight truncate">
                {user.displayName || user.username}
              </h1>
              {user.displayName && (
                <p className="font-mono text-sm text-text-secondary mt-0.5">@{user.username}</p>
              )}
            </div>
          </div>
          {user.bio && (
            <p className="text-sm text-text-primary mt-4 whitespace-pre-wrap">{user.bio}</p>
          )}
          <div className="flex flex-col gap-1.5 mt-4 text-sm text-text-secondary">
            {user.location && (
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>{user.location}</span>
              </span>
            )}
            {websiteHref && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-text-link hover:underline truncate"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span className="truncate">{user.website}</span>
              </a>
            )}
            <span className="text-xs">
              {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
            </span>
          </div>
        </aside>

        {/* Repository list */}
        <div className="flex-1 min-w-0">
          <h2 className="font-mono text-xs text-text-secondary uppercase tracking-wider mb-3">
            repositories
          </h2>
          <div className="flex flex-col gap-4">
            {repos.map((repo) => (
              <RepositoryRow
                key={repo.id}
                owner={owner}
                name={repo.name}
                description={repo.description}
                isPublic={repo.isPublic}
                updatedAt={repo.updatedAt}
                showOwner={false}
                variant="card"
                linkAs={({ to, className, children }) => (
                  <Link to={to} className={className}>
                    {children}
                  </Link>
                )}
                timeAgo={timeAgo}
              />
            ))}
            {repos.length === 0 && (
              <div className="bg-surface border border-border rounded-lg p-12 text-center">
                <svg
                  className="w-12 h-12 mx-auto text-text-secondary mb-3"
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
                <h3 className="text-sm font-medium text-text-primary mb-1">No repositories yet</h3>
                <p className="text-xs text-text-secondary">
                  {owner} hasn&apos;t created any public repositories.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
