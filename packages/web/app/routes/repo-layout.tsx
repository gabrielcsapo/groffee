import { Outlet } from "react-router";
import { apiFetch } from "../lib/api";
import { RepoNav } from "../components/repo-nav";

export default async function RepoLayout({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params;

  const [issueData, prData] = await Promise.all([
    apiFetch(`/api/repos/${owner}/${repo}/issues?status=open`),
    apiFetch(`/api/repos/${owner}/${repo}/pulls?status=open`),
  ]);

  const openIssueCount = issueData.issues?.length ?? 0;
  const openPrCount = prData.pullRequests?.length ?? 0;

  return (
    <>
      <div className="max-w-5xl mx-auto mt-8 mb-0">
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
