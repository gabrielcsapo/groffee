import { getIssue } from "../lib/server/issues";
import { renderMarkdown } from "../lib/markdown";
import { IssueDetailView } from "./issue-detail.client";

export default async function IssueDetail({ params }: { params?: Record<string, string> }) {
  const {
    owner,
    repo,
    number: issueNumber,
  } = params as { owner: string; repo: string; number: string };
  const data = await getIssue(owner, repo, Number(issueNumber));

  const issue = data.issue || null;
  const issueBodyHtml = issue?.body ? renderMarkdown(issue.body) : "";
  const comments = (data.comments || []).map((c) => ({
    ...c,
    bodyHtml: c.body ? renderMarkdown(c.body) : "",
  }));

  return (
    <IssueDetailView
      owner={owner}
      repo={repo}
      issueNumber={issueNumber}
      initialIssue={issue}
      initialIssueBodyHtml={issueBodyHtml}
      initialComments={comments}
    />
  );
}
