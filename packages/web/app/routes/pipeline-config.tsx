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
      <div className="max-w-4xl mx-auto mt-8 space-y-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-text-primary">View-only pipeline config</h2>
          <p className="text-sm text-text-secondary mt-2">
            You need write access to this repository to edit{" "}
            <span className="font-mono">.groffee/pipelines.yml</span>.
          </p>
        </div>
        {configData.hasConfig ? (
          <pre className="bg-surface-secondary border border-border rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {configData.yaml}
          </pre>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-6 text-sm text-text-secondary">
            This repository has no <span className="font-mono">.groffee/pipelines.yml</span>.
          </div>
        )}
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
