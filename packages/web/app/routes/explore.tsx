import { getPublicRepos } from "../lib/server/repos";
import { ExploreList } from "./explore.client";

export default async function Explore() {
  const data = await getPublicRepos({ limit: 30 });

  return <ExploreList initialRepos={data.repositories || []} />;
}
