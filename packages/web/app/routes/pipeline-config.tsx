import { getPipelineConfig } from "../lib/server/pipelines";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { PipelineConfigEditor } from "./pipeline-config.client";

export default async function PipelineConfigRoute({ params }: { params?: Record<string, string> }) {
  const { owner, repo } = params as { owner: string; repo: string };

  const [configData, editCtx] = await Promise.all([
    getPipelineConfig(owner, repo),
    getRepoEditContext(owner, repo),
  ]);

  if ("error" in editCtx) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Pipeline Config Not Found</h2>
        <p>{editCtx.error}</p>
      </div>
    );
  }

  if (!editCtx.canWrite) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Permission denied</h2>
        <p>You need write access to this repository to edit the pipeline config.</p>
      </div>
    );
  }

  return (
    <PipelineConfigEditor
      owner={owner}
      repo={repo}
      initialYaml={configData.yaml || ""}
      initialError={configData.error || null}
      hasConfig={configData.hasConfig ?? false}
      defaultBranch={editCtx.defaultBranch}
      editPolicy={editCtx.editPolicy}
    />
  );
}
