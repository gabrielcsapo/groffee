import { getPublicRepos } from "../lib/server/repos";
import { HomeView } from "./home.client";

export default async function Home() {
  const data = await getPublicRepos({ limit: 10 });

  return <HomeView initialRepos={data.repositories || []} />;
}
