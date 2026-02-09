import { describe, it, expect } from "vitest";
import { get, post, patch, registerUser, createRepo, populateTestRepo } from "./helpers.js";

/** Create a repo with branches populated for PR tests */
async function createRepoWithBranches() {
  const { cookie, data } = await createRepo("my-repo");
  populateTestRepo(data.repository.diskPath);
  return { cookie, repoData: data };
}

describe("GET /api/repos/:owner/:repo/pulls", () => {
  it("returns empty list initially", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos/testuser/my-repo/pulls");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pullRequests).toEqual([]);
  });

  it("returns 404 for non-existent repo", async () => {
    const res = await get("/api/repos/nobody/nope/pulls");
    expect(res.status).toBe(404);
  });

  it("filters by status", async () => {
    const { cookie } = await createRepoWithBranches();

    await post("/api/repos/testuser/my-repo/pulls", {
      title: "Open PR",
      sourceBranch: "feature",
      targetBranch: "main",
    }, cookie);

    const openRes = await get("/api/repos/testuser/my-repo/pulls?status=open");
    const openData = await openRes.json();
    expect(openData.pullRequests).toHaveLength(1);

    const closedRes = await get("/api/repos/testuser/my-repo/pulls?status=closed");
    const closedData = await closedRes.json();
    expect(closedData.pullRequests).toHaveLength(0);
  });
});

describe("POST /api/repos/:owner/:repo/pulls", () => {
  it("creates a pull request", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Add feature",
      body: "This adds a new feature",
      sourceBranch: "feature",
      targetBranch: "main",
    }, cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pullRequest.title).toBe("Add feature");
    expect(data.pullRequest.number).toBe(1);
    expect(data.pullRequest.author).toBe("testuser");
  });

  it("defaults targetBranch to repo default", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Add feature",
      sourceBranch: "feature",
    }, cookie);
    expect(res.status).toBe(200);
  });

  it("shares numbering with issues", async () => {
    const { cookie } = await createRepoWithBranches();
    // Create an issue first
    await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    // PR should get number 2
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Fix",
      sourceBranch: "feature",
    }, cookie);
    const data = await res.json();
    expect(data.pullRequest.number).toBe(2);
  });

  it("returns 401 without auth", async () => {
    await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing title", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      sourceBranch: "feature",
    }, cookie);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing source branch", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
    }, cookie);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-existent source branch", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "nonexistent",
    }, cookie);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not found/);
  });

  it("returns 400 when source equals target", async () => {
    const { cookie } = await createRepoWithBranches();
    const res = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "main",
      targetBranch: "main",
    }, cookie);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/different/);
  });
});

describe("GET /api/repos/:owner/:repo/pulls/:number", () => {
  it("returns PR detail with diff and comments", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Add feature",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await get(`/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pullRequest.title).toBe("Add feature");
    expect(data.pullRequest.author).toBe("testuser");
    expect(data.pullRequest.sourceBranch).toBe("feature");
    expect(data.pullRequest.targetBranch).toBe("main");
    expect(data.comments).toEqual([]);
    // Diff should exist between main and feature
    expect(data.diff).not.toBeNull();
  });

  it("returns 404 for non-existent PR", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos/testuser/my-repo/pulls/999");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/repos/:owner/:repo/pulls/:number", () => {
  it("updates PR title", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Old title",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await patch(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`,
      { title: "New title" },
      cookie,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pullRequest.title).toBe("New title");
  });

  it("closes a PR", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await patch(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`,
      { status: "closed" },
      cookie,
    );
    const data = await res.json();
    expect(data.pullRequest.status).toBe("closed");
  });

  it("returns 401 without auth", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();
    const res = await patch(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`,
      { title: "x" },
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/repos/:owner/:repo/pulls/:number/merge", () => {
  it("merges a PR (fast-forward)", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "Add feature",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/merge`,
      {},
      cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ merged: true });

    // Verify PR status is now merged
    const prRes = await get(`/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`);
    const prData = await prRes.json();
    expect(prData.pullRequest.status).toBe("merged");
    expect(prData.pullRequest.mergedAt).not.toBeNull();
    expect(prData.pullRequest.mergedBy).toBe("testuser");
  });

  it("returns 403 for non-owner", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const { cookie: bobCookie } = await registerUser("bob", "bob@test.com");
    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/merge`,
      {},
      bobCookie,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for already merged PR", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/merge`,
      {},
      cookie,
    );

    // Try to merge again
    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/merge`,
      {},
      cookie,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not open/);
  });

  it("returns 401 without auth", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();
    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/merge`,
      {},
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/repos/:owner/:repo/pulls/:number/comments", () => {
  it("adds a comment to a PR", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/comments`,
      { body: "LGTM" },
      cookie,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.comment.body).toBe("LGTM");
    expect(data.comment.author).toBe("testuser");
  });

  it("returns 400 for empty body", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/comments`,
      { body: "" },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();
    const res = await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/comments`,
      { body: "test" },
    );
    expect(res.status).toBe(401);
  });

  it("shows comments in PR detail", async () => {
    const { cookie } = await createRepoWithBranches();
    const createRes = await post("/api/repos/testuser/my-repo/pulls", {
      title: "PR",
      sourceBranch: "feature",
    }, cookie);
    const created = await createRes.json();

    await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/comments`,
      { body: "First" },
      cookie,
    );
    await post(
      `/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}/comments`,
      { body: "Second" },
      cookie,
    );

    const res = await get(`/api/repos/testuser/my-repo/pulls/${created.pullRequest.number}`);
    const data = await res.json();
    expect(data.comments).toHaveLength(2);
    expect(data.comments[0].body).toBe("First");
    expect(data.comments[1].body).toBe("Second");
  });
});
