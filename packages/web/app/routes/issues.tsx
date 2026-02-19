import { getIssues } from "../lib/server/issues";
import { IssuesList } from "./issues.client";

export default async function Issues({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params;
  const data = await getIssues(owner, repo, "open");

  return <IssuesList owner={owner} repo={repo} initialIssues={data.issues || []} />;
}
