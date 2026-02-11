import { describe, it, expect } from "vitest";
import { get, post, patch, registerUser, createRepo } from "./helpers.js";

describe("GET /api/repos/:owner/:repo/issues", () => {
  it("returns empty list initially", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos/testuser/my-repo/issues");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issues).toEqual([]);
  });

  it("returns 404 for non-existent repo", async () => {
    const res = await get("/api/repos/nobody/nope/issues");
    expect(res.status).toBe(404);
  });

  it("filters by status", async () => {
    const { cookie } = await createRepo("my-repo");
    await post("/api/repos/testuser/my-repo/issues", { title: "Open bug" }, cookie);
    const createRes = await post(
      "/api/repos/testuser/my-repo/issues",
      { title: "Fixed bug" },
      cookie,
    );
    const created = await createRes.json();

    // Close the second issue
    await patch(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}`,
      { status: "closed" },
      cookie,
    );

    const openRes = await get("/api/repos/testuser/my-repo/issues?status=open");
    const openData = await openRes.json();
    expect(openData.issues).toHaveLength(1);
    expect(openData.issues[0].title).toBe("Open bug");

    const closedRes = await get("/api/repos/testuser/my-repo/issues?status=closed");
    const closedData = await closedRes.json();
    expect(closedData.issues).toHaveLength(1);
    expect(closedData.issues[0].title).toBe("Fixed bug");
  });
});

describe("POST /api/repos/:owner/:repo/issues", () => {
  it("creates an issue", async () => {
    const { cookie } = await createRepo("my-repo");
    const res = await post(
      "/api/repos/testuser/my-repo/issues",
      {
        title: "Bug report",
        body: "Something broke",
      },
      cookie,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issue.title).toBe("Bug report");
    expect(data.issue.number).toBe(1);
    expect(data.issue.author).toBe("testuser");
  });

  it("auto-increments issue numbers", async () => {
    const { cookie } = await createRepo("my-repo");
    await post("/api/repos/testuser/my-repo/issues", { title: "First" }, cookie);
    const res = await post("/api/repos/testuser/my-repo/issues", { title: "Second" }, cookie);
    const data = await res.json();
    expect(data.issue.number).toBe(2);
  });

  it("returns 401 without auth", async () => {
    await createRepo("my-repo");
    const res = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing title", async () => {
    const { cookie } = await createRepo("my-repo");
    const res = await post("/api/repos/testuser/my-repo/issues", { body: "no title" }, cookie);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Title/i);
  });

  it("returns 400 for empty title", async () => {
    const { cookie } = await createRepo("my-repo");
    const res = await post("/api/repos/testuser/my-repo/issues", { title: "  " }, cookie);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent repo", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/repos/testuser/nope/issues", { title: "Bug" }, cookie);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/repos/:owner/:repo/issues/:number", () => {
  it("returns issue detail with comments", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post(
      "/api/repos/testuser/my-repo/issues",
      {
        title: "Bug",
        body: "Details here",
      },
      cookie,
    );
    const created = await createRes.json();

    const res = await get(`/api/repos/testuser/my-repo/issues/${created.issue.number}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issue.title).toBe("Bug");
    expect(data.issue.body).toBe("Details here");
    expect(data.issue.author).toBe("testuser");
    expect(data.comments).toEqual([]);
  });

  it("returns 404 for non-existent issue", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos/testuser/my-repo/issues/999");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/repos/:owner/:repo/issues/:number", () => {
  it("updates title", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    const res = await patch(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}`,
      { title: "Updated bug" },
      cookie,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issue.title).toBe("Updated bug");
  });

  it("closes an issue and sets closedAt", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    const res = await patch(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}`,
      { status: "closed" },
      cookie,
    );
    const data = await res.json();
    expect(data.issue.status).toBe("closed");
    expect(data.issue.closedAt).not.toBeNull();
  });

  it("reopens a closed issue and clears closedAt", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    await patch(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}`,
      { status: "closed" },
      cookie,
    );
    const res = await patch(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}`,
      { status: "open" },
      cookie,
    );
    const data = await res.json();
    expect(data.issue.status).toBe("open");
    expect(data.issue.closedAt).toBeNull();
  });

  it("returns 401 without auth", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();
    const res = await patch(`/api/repos/testuser/my-repo/issues/${created.issue.number}`, {
      title: "x",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/repos/:owner/:repo/issues/:number/comments", () => {
  it("adds a comment", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    const res = await post(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}/comments`,
      { body: "I can reproduce this" },
      cookie,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.comment.body).toBe("I can reproduce this");
    expect(data.comment.author).toBe("testuser");
  });

  it("returns 400 for empty comment body", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    const res = await post(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}/comments`,
      { body: "  " },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    const res = await post(`/api/repos/testuser/my-repo/issues/${created.issue.number}/comments`, {
      body: "test",
    });
    expect(res.status).toBe(401);
  });

  it("shows comments in issue detail", async () => {
    const { cookie } = await createRepo("my-repo");
    const createRes = await post("/api/repos/testuser/my-repo/issues", { title: "Bug" }, cookie);
    const created = await createRes.json();

    await post(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}/comments`,
      { body: "Comment 1" },
      cookie,
    );
    await post(
      `/api/repos/testuser/my-repo/issues/${created.issue.number}/comments`,
      { body: "Comment 2" },
      cookie,
    );

    const res = await get(`/api/repos/testuser/my-repo/issues/${created.issue.number}`);
    const data = await res.json();
    expect(data.comments).toHaveLength(2);
    expect(data.comments[0].body).toBe("Comment 1");
    expect(data.comments[1].body).toBe("Comment 2");
  });
});
