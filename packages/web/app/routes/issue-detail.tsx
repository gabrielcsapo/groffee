import { getIssue } from "../lib/server/issues";
import { IssueDetailView } from "./issue-detail.client";

export default async function IssueDetail({ params }: { params?: Record<string, string> }) {
  const {
    owner,
    repo,
    number: issueNumber,
  } = params as { owner: string; repo: string; number: string };
  const data = await getIssue(owner, repo, Number(issueNumber));

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
