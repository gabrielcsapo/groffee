import { RepoSearchView } from "./repo-search.client";

export default function RepoSearch({ params }: { params?: Record<string, string> }) {
  return <RepoSearchView owner={params!.owner} repo={params!.repo} />;
}
