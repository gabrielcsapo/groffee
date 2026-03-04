import NewIssueClient from "./issue-new.client";
import { RequireAuth } from "../components/require-auth";

export default function NewIssue({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };
  return (
    <RequireAuth returnPath={`/${owner}/${repo}/issues/new`}>
      <NewIssueClient />
    </RequireAuth>
  );
}
