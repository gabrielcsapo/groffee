import { getPublicRepos } from "../lib/server/repos";
import { HomeView } from "./home.client";
import { getSessionUser } from "../lib/server/auth";

export default async function Home() {
  const [data, sessionUser] = await Promise.all([getPublicRepos({ limit: 10 }), getSessionUser()]);

  return (
    <HomeView
      initialRepos={data.repositories || []}
      initialUsername={sessionUser?.username ?? null}
    />
  );
}
