import { describe, it, expect } from "vitest";
import { get, post, patch, del, registerUser, createRepo, populateTestRepo } from "./helpers.js";

describe("GET /api/repos", () => {
  it("returns empty list initially", async () => {
    const res = await get("/api/repos");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.repositories).toEqual([]);
  });

  it("returns public repos", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos");
    const data = await res.json();
    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0].name).toBe("my-repo");
  });

  it("filters by search query", async () => {
    const { cookie } = await registerUser();
    await post("/api/repos", { name: "alpha" }, cookie);
    await post("/api/repos", { name: "beta" }, cookie);
    const res = await get("/api/repos?q=alph");
    const data = await res.json();
    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0].name).toBe("alpha");
  });

  it("respects limit and offset", async () => {
    const { cookie } = await registerUser();
    await post("/api/repos", { name: "repo-a" }, cookie);
    await post("/api/repos", { name: "repo-b" }, cookie);
    await post("/api/repos", { name: "repo-c" }, cookie);
    const res = await get("/api/repos?limit=2&offset=1");
    const data = await res.json();
    expect(data.repositories).toHaveLength(2);
  });

  it("excludes private repos", async () => {
    const { cookie } = await registerUser();
    await post("/api/repos", { name: "public-repo", isPublic: true }, cookie);
    await post("/api/repos", { name: "private-repo", isPublic: false }, cookie);
    const res = await get("/api/repos");
    const data = await res.json();
    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0].name).toBe("public-repo");
  });
});

describe("POST /api/repos", () => {
  it("creates a repo", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    const res = await post("/api/repos", { name: "my-repo" }, cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.repository.name).toBe("my-repo");
    expect(data.repository.owner).toBe("alice");
    expect(data.repository.isPublic).toBe(true);
  });

  it("creates a private repo", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/repos", { name: "secret", isPublic: false }, cookie);
    const data = await res.json();
    expect(data.repository.isPublic).toBe(false);
  });

  it("returns 401 without auth", async () => {
    const res = await post("/api/repos", { name: "my-repo" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid name", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/repos", { name: "invalid name!" }, cookie);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid repository name/);
  });

  it("returns 400 for empty name", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/repos", { name: "" }, cookie);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate name", async () => {
    const { cookie } = await registerUser();
    await post("/api/repos", { name: "my-repo" }, cookie);
    const res = await post("/api/repos", { name: "my-repo" }, cookie);
    expect(res.status).toBe(409);
  });

  it("allows dots, hyphens, and underscores in names", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/repos", { name: "my_repo.v2-test" }, cookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/repos/:owner", () => {
  it("lists repos for a user", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "repo-a" }, cookie);
    await post("/api/repos", { name: "repo-b" }, cookie);
    const res = await get("/api/repos/alice");
    const data = await res.json();
    expect(data.repositories).toHaveLength(2);
  });

  it("returns only public repos for other users", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "public-repo" }, cookie);
    await post("/api/repos", { name: "private-repo", isPublic: false }, cookie);

    // Unauthenticated request
    const res = await get("/api/repos/alice");
    const data = await res.json();
    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0].name).toBe("public-repo");
  });

  it("returns all repos (including private) for the owner", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "public-repo" }, cookie);
    await post("/api/repos", { name: "private-repo", isPublic: false }, cookie);
    const res = await get("/api/repos/alice", cookie);
    const data = await res.json();
    expect(data.repositories).toHaveLength(2);
  });

  it("returns 404 for unknown user", async () => {
    const res = await get("/api/repos/nobody");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/repos/:owner/:name", () => {
  it("returns repo detail", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo", description: "test" }, cookie);
    const res = await get("/api/repos/alice/my-repo");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.repository.name).toBe("my-repo");
    expect(data.repository.description).toBe("test");
    expect(data.repository.owner).toBe("alice");
  });

  it("returns 404 for non-existent repo", async () => {
    await registerUser("alice", "alice@test.com");
    const res = await get("/api/repos/alice/nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 for private repo when not owner", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "secret", isPublic: false }, cookie);
    const res = await get("/api/repos/alice/secret");
    expect(res.status).toBe(404);
  });

  it("returns private repo for the owner", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "secret", isPublic: false }, cookie);
    const res = await get("/api/repos/alice/secret", cookie);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/repos/:owner/:name", () => {
  it("updates repo description", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo" }, cookie);
    const res = await patch("/api/repos/alice/my-repo", { description: "updated" }, cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.repository.description).toBe("updated");
  });

  it("updates repo visibility", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo" }, cookie);
    const res = await patch("/api/repos/alice/my-repo", { isPublic: false }, cookie);
    const data = await res.json();
    expect(data.repository.isPublic).toBe(false);
  });

  it("returns 401 without auth", async () => {
    await createRepo("my-repo");
    const res = await patch("/api/repos/testuser/my-repo", { description: "x" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner", async () => {
    const { cookie: aliceCookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo" }, aliceCookie);

    const { cookie: bobCookie } = await registerUser("bob", "bob@test.com");
    const res = await patch("/api/repos/alice/my-repo", { description: "hacked" }, bobCookie);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/repos/:owner/:name", () => {
  it("deletes a repo", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo" }, cookie);
    const res = await del("/api/repos/alice/my-repo", cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    // Verify it's gone
    const getRes = await get("/api/repos/alice/my-repo");
    expect(getRes.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    await createRepo("my-repo");
    const res = await del("/api/repos/testuser/my-repo");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner", async () => {
    const { cookie: aliceCookie } = await registerUser("alice", "alice@test.com");
    await post("/api/repos", { name: "my-repo" }, aliceCookie);
    const { cookie: bobCookie } = await registerUser("bob", "bob@test.com");
    const res = await del("/api/repos/alice/my-repo", bobCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/repos/:owner/:name/refs", () => {
  it("returns empty refs for new repo", async () => {
    await createRepo("my-repo");
    const res = await get("/api/repos/testuser/my-repo/refs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.refs).toEqual([]);
    expect(data.defaultBranch).toBe("main");
  });

  it("returns branches after populating", async () => {
    const { data, cookie } = await createRepo("my-repo");
    populateTestRepo(data.repository.diskPath);
    const res = await get("/api/repos/testuser/my-repo/refs", cookie);
    const refData = await res.json();
    const names = refData.refs.map((r: { name: string }) => r.name);
    expect(names).toContain("main");
    expect(names).toContain("feature");
  });
});

describe("GET /api/repos/:owner/:name/tree/:ref", () => {
  it("returns tree listing", async () => {
    const { data } = await createRepo("my-repo");
    populateTestRepo(data.repository.diskPath);
    const res = await get("/api/repos/testuser/my-repo/tree/main");
    expect(res.status).toBe(200);
    const treeData = await res.json();
    expect(treeData.entries).toHaveLength(1);
    expect(treeData.entries[0].name).toBe("README.md");
  });

  it("returns 404 for non-existent repo", async () => {
    const res = await get("/api/repos/testuser/nope/tree/main");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/repos/:owner/:name/blob/:ref/:path", () => {
  it("returns file content", async () => {
    const { data } = await createRepo("my-repo");
    populateTestRepo(data.repository.diskPath);
    const res = await get("/api/repos/testuser/my-repo/blob/main/README.md");
    expect(res.status).toBe(200);
    const blobData = await res.json();
    expect(blobData.content).toBe("# Test Repo\n");
    expect(blobData.path).toBe("README.md");
  });
});

describe("GET /api/repos/:owner/:name/commits/:ref", () => {
  it("returns commit log", async () => {
    const { data } = await createRepo("my-repo");
    populateTestRepo(data.repository.diskPath);
    const res = await get("/api/repos/testuser/my-repo/commits/main");
    expect(res.status).toBe(200);
    const logData = await res.json();
    expect(logData.commits).toHaveLength(1);
    expect(logData.commits[0].message).toMatch(/Initial commit/);
  });
});

describe("GET /api/repos/:owner/:name/commit/:sha", () => {
  it("returns commit detail with diff", async () => {
    const { data } = await createRepo("my-repo");
    const { featureCommit } = populateTestRepo(data.repository.diskPath);
    const res = await get(`/api/repos/testuser/my-repo/commit/${featureCommit}`);
    expect(res.status).toBe(200);
    const commitData = await res.json();
    expect(commitData.commit.oid).toBe(featureCommit);
    expect(commitData.commit.parents).toHaveLength(1);
    expect(commitData.diff).not.toBeNull();
  });
});
