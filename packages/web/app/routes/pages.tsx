import { getPagesStatus, getPagesDeployments } from "../lib/server/pages";
import { PagesView } from "./pages.client";

export default async function Pages({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };

  const [status, deployments] = await Promise.all([
    getPagesStatus(owner, repo),
    getPagesDeployments(owner, repo),
  ]);

  return (
    <PagesView
      owner={owner}
      repo={repo}
      deployed={status.deployed ?? false}
      url={status.url || null}
      activeDeployment={status.deployment || null}
      deployments={deployments.deployments || []}
    />
  );
}
