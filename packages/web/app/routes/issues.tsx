import { apiFetch } from "../lib/api";
import { IssuesList } from "./issues.client";

export default async function Issues({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params;
  const data = await apiFetch(`/api/repos/${owner}/${repo}/issues?status=open`);

  return <IssuesList owner={owner} repo={repo} initialIssues={data.issues || []} />;
}
