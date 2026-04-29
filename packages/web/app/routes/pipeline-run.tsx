import { getPipelineRunDetail } from "../lib/server/pipelines";
import { PipelineRunView } from "./pipeline-run.client";

export default async function PipelineRun({ params }: { params?: Record<string, string> }) {
  const { owner, repo, runNumber } = params as {
    owner: string;
    repo: string;
    runNumber: string;
  };

  const data = await getPipelineRunDetail(owner, repo, parseInt(runNumber, 10));

  if (data.error) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Pipeline Run Not Found</h2>
        <p>{data.error}</p>
      </div>
    );
  }

  return (
    <PipelineRunView
      owner={owner}
      repo={repo}
      run={data.run!}
      jobs={data.jobs || []}
      artifacts={data.artifacts || []}
      isOwner={data.isOwner || false}
    />
  );
}
