"use client";

import { Link, useLocation } from "react-router";

interface RepoNavProps {
  owner: string;
  repo: string;
  openIssueCount?: number;
  openPrCount?: number;
}

export function RepoNav({ owner, repo, openIssueCount, openPrCount }: RepoNavProps) {
  const location = useLocation();
  const path = location.pathname;

  const tabs = [
    {
      label: "Code",
      href: `/${owner}/${repo}`,
      active:
        path === `/${owner}/${repo}` ||
        path.startsWith(`/${owner}/${repo}/tree/`) ||
        path.startsWith(`/${owner}/${repo}/blob/`) ||
        path.startsWith(`/${owner}/${repo}/commit`),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      ),
    },
    {
      label: "Issues",
      count: openIssueCount,
      href: `/${owner}/${repo}/issues`,
      active:
        path.startsWith(`/${owner}/${repo}/issues`) || path.startsWith(`/${owner}/${repo}/issue/`),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <circle cx="12" cy="12" r="1" fill="currentColor" strokeWidth={0} />
        </svg>
      ),
    },
    {
      label: "Pull requests",
      count: openPrCount,
      href: `/${owner}/${repo}/pulls`,
      active:
        path.startsWith(`/${owner}/${repo}/pulls`) || path.startsWith(`/${owner}/${repo}/pull/`),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="3" strokeWidth={2} />
          <circle cx="6" cy="18" r="3" strokeWidth={2} />
          <line x1="6" y1="9" x2="6" y2="15" strokeWidth={2} />
          <circle cx="18" cy="6" r="3" strokeWidth={2} />
          <path d="M18 9v3c0 3-3 6-6 6" strokeWidth={2} />
        </svg>
      ),
    },
    {
      label: "Settings",
      href: `/${owner}/${repo}/settings`,
      active: path.startsWith(`/${owner}/${repo}/settings`),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          to={tab.href}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px hover:no-underline ${
            tab.active
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary hover:border-border"
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-surface-secondary text-text-secondary font-normal">
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
