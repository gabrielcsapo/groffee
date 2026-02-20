import { RepoSearchView } from "./repo-search.client";

export default function RepoSearch({
  params,
}: {
  params: { owner: string; repo: string };
}) {
  return <RepoSearchView owner={params.owner} repo={params.repo} />;
}
