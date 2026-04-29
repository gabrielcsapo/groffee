import { getPipelineRuns, getPipelineConfig } from "../lib/server/pipelines";
import { PipelinesView } from "./pipelines.client";

export default async function Pipelines({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };

  const [runsData, configData] = await Promise.all([
    getPipelineRuns(owner, repo),
    getPipelineConfig(owner, repo),
  ]);

  return (
    <PipelinesView
      owner={owner}
      repo={repo}
      initialRuns={runsData.runs || []}
      hasConfig={configData.hasConfig ?? false}
      configYaml={configData.yaml || null}
      configError={configData.error || null}
    />
  );
}
