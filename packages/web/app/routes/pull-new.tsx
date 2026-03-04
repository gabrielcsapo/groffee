import NewPullRequestClient from "./pull-new.client";
import { RequireAuth } from "../components/require-auth";

export default function NewPullRequest({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };
  return (
    <RequireAuth returnPath={`/${owner}/${repo}/pulls/new`}>
      <NewPullRequestClient />
    </RequireAuth>
  );
}
