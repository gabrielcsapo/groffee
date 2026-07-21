import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("cancelling one run does not cancel another run's queued steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "groffee-queue-"));
  process.env.DATABASE_URL = join(root, "test.sqlite");
  process.env.DATA_DIR = root;

  const { db, users, repositories, pipelineRuns, pipelineJobs, pipelineSteps } =
    await import("@groffee/db");
  const { cancelRun } = await import("./pipeline-queue.js");
  const { eq } = await import("drizzle-orm");
  const now = new Date();
  db.insert(users)
    .values({
      id: "user",
      username: "alice",
      email: "alice@example.test",
      passwordHash: "test",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(repositories)
    .values({
      id: "repo",
      ownerId: "user",
      name: "project",
      diskPath: "alice/project.git",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  for (const runId of ["run-a", "run-b"]) {
    db.insert(pipelineRuns)
      .values({
        id: runId,
        repoId: "repo",
        pipelineName: "ci",
        number: runId === "run-a" ? 1 : 2,
        status: "queued",
        trigger: "manual",
        ref: "main",
        commitOid: "a".repeat(40),
        triggeredById: "user",
        configSnapshot: JSON.stringify({ on: { manual: true }, jobs: {} }),
        createdAt: now,
      })
      .run();
    db.insert(pipelineJobs)
      .values({ id: `job-${runId}`, runId, name: "test", sortOrder: 0, createdAt: now })
      .run();
    db.insert(pipelineSteps)
      .values({
        id: `step-${runId}`,
        jobId: `job-${runId}`,
        name: "test",
        command: "true",
        sortOrder: 0,
        createdAt: now,
      })
      .run();
  }

  await cancelRun("run-a");
  const [cancelled] = db
    .select({ status: pipelineSteps.status })
    .from(pipelineSteps)
    .where(eq(pipelineSteps.id, "step-run-a"))
    .all();
  const [untouched] = db
    .select({ status: pipelineSteps.status })
    .from(pipelineSteps)
    .where(eq(pipelineSteps.id, "step-run-b"))
    .all();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(untouched.status, "queued");

  await rm(root, { recursive: true, force: true });
});
