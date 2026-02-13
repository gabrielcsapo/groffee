import { Link, Outlet } from "react-router";
import { apiFetch } from "../lib/api";
import { RepoNav } from "../components/repo-nav";

export default async function RepoLayout({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params;

  const [repoData, issueData, prData] = await Promise.all([
    apiFetch(`/api/repos/${owner}/${repo}`),
    apiFetch(`/api/repos/${owner}/${repo}/issues?status=open`),
    apiFetch(`/api/repos/${owner}/${repo}/pulls?status=open`),
  ]);

  const repository = repoData.repository;
  const openIssueCount = issueData.issues?.length ?? 0;
  const openPrCount = prData.pullRequests?.length ?? 0;

  return (
    <>
      <div className="max-w-5xl mx-auto mt-8 mb-0">
        {/* Repo header */}
        {repository && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-lg mb-1">
              <svg
                className="w-5 h-5 text-text-secondary"
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
              <Link to={`/${owner}`} className="text-text-link hover:underline">
                {owner}
              </Link>
              <span className="text-text-secondary">/</span>
              <Link
                to={`/${owner}/${repo}`}
                className="text-text-link font-semibold hover:underline"
              >
                {repo}
              </Link>
              <span className={`ml-2 badge ${repository.isPublic ? "badge-public" : "badge-private"}`}>
                {repository.isPublic ? "Public" : "Private"}
              </span>
            </div>
            {repository.description && (
              <p className="text-sm text-text-secondary mt-1">{repository.description}</p>
            )}
          </div>
        )}
        <RepoNav
          owner={owner}
          repo={repo}
          openIssueCount={openIssueCount}
          openPrCount={openPrCount}
        />
      </div>
      <Outlet />
    </>
  );
}
