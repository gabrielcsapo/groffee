import {
  getPipelineRuns,
  getPipelineConfig,
  getPipelineFilterFacets,
} from "../lib/server/pipelines";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { PipelinesView } from "./pipelines.client";

const TRIGGER_VALUES = new Set(["push", "pull_request", "manual"]);

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const ref = url.searchParams.get("ref") || "";
  const triggerRaw = url.searchParams.get("trigger") || "";
  const trigger = TRIGGER_VALUES.has(triggerRaw) ? triggerRaw : "";
  const actor = url.searchParams.get("actor") || "";
  return { status, ref, trigger, actor };
}

export default async function Pipelines({
  params,
  loaderData,
}: {
  params?: Record<string, string>;
  loaderData?: { status: string; ref: string; trigger: string; actor: string };
}) {
  const { owner, repo } = params as { owner: string; repo: string };
  const status = loaderData?.status || "";
  const ref = loaderData?.ref || "";
  const trigger = loaderData?.trigger || "";
  const actor = loaderData?.actor || "";

  const [runsData, configData, editCtx, facets] = await Promise.all([
    getPipelineRuns(owner, repo, status || undefined, {
      ref: ref || undefined,
      trigger: (trigger || undefined) as "push" | "pull_request" | "manual" | undefined,
      actor: actor || undefined,
    }),
    getPipelineConfig(owner, repo),
    getRepoEditContext(owner, repo),
    getPipelineFilterFacets(owner, repo),
  ]);

  const canWrite = "canWrite" in editCtx ? editCtx.canWrite : false;

  return (
    <PipelinesView
      owner={owner}
      repo={repo}
      initialStatus={status}
      initialRef={ref}
      initialTrigger={trigger}
      initialActor={actor}
      initialRuns={runsData.runs || []}
      initialNextCursor={runsData.nextCursor || null}
      initialHasMore={runsData.hasMore ?? false}
      hasConfig={configData.hasConfig ?? false}
      configYaml={configData.yaml || null}
      configError={configData.error || null}
      canEditConfig={canWrite}
      refOptions={facets.refs}
      actorOptions={facets.actors}
    />
  );
}
