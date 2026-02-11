import { apiFetch } from "../lib/api";
import { IssueDetailView } from "./issue-detail.client";

export default async function IssueDetail({
  params,
}: {
  params: { owner: string; repo: string; number: string };
}) {
  const { owner, repo, number: issueNumber } = params;
  const data = await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}`);

  return (
    <IssueDetailView
      owner={owner}
      repo={repo}
      issueNumber={issueNumber}
      initialIssue={data.issue || null}
      initialComments={data.comments || []}
    />
  );
}
