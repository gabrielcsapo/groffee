import { getPipelineRunDetail, getRunHistoryForRef } from "../lib/server/pipelines";
import { PipelineRunView } from "./pipeline-run.client";

export default async function PipelineRun({ params }: { params?: Record<string, string> }) {
  const { owner, repo, runNumber } = params as {
    owner: string;
    repo: string;
    runNumber: string;
  };

  const data = await getPipelineRunDetail(owner, repo, parseInt(runNumber, 10));

  if (data.error || !data.run) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Pipeline Run Not Found</h2>
        <p>{data.error || "Run not found"}</p>
      </div>
    );
  }

  // Same-ref history sidebar: fetch in parallel with the rest of the page.
  // We swallow errors here since a missing sidebar is graceful degradation,
  // not a reason to break the whole page render.
  const history = await getRunHistoryForRef(owner, repo, data.run.ref, data.run.id, {
    limit: 15,
  });

  return (
    <PipelineRunView
      owner={owner}
      repo={repo}
      run={data.run}
      jobs={data.jobs || []}
      artifacts={data.artifacts || []}
      isOwner={data.isOwner || false}
      historyInitial={"runs" in history ? history.runs : []}
      historyNextCursor={"nextCursor" in history ? history.nextCursor || null : null}
      historyHasMore={"hasMore" in history ? history.hasMore : false}
    />
  );
}
