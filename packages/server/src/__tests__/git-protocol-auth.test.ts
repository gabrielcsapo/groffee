import { describe, it, expect } from "vitest";
import { app } from "../app.js";
import { registerUser, createRepo, populateTestRepo } from "./helpers.js";
import { db, repoCollaborators } from "@groffee/db";

function basicAuth(username: string, password: string) {
  return "Basic " + btoa(`${username}:${password}`);
}

type TestResponse = Omit<Response, "json"> & { json(): Promise<any> };

function gitGet(path: string, auth?: string): Promise<TestResponse> {
  const headers: Record<string, string> = {};
  if (auth) headers["Authorization"] = auth;
  return app.request(path, { headers }) as Promise<TestResponse>;
}

function gitPost(path: string, auth?: string): Promise<TestResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/x-git-receive-pack-request" };
  if (auth) headers["Authorization"] = auth;
  return app.request(path, { method: "POST", headers, body: "" }) as Promise<TestResponse>;
}

describe("Git Protocol Auth", () => {
  describe("info/refs for git-upload-pack (clone/fetch)", () => {
    it("allows unauthenticated access to public repos", async () => {
      const { data } = await createRepo("public-repo", { isPublic: true });
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/public-repo.git/info/refs?service=git-upload-pack`,
      );
      expect(res.status).toBe(200);
    });

    it("returns 401 for private repos without auth", async () => {
      const { data } = await createRepo("private-repo", { isPublic: false });
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/private-repo.git/info/refs?service=git-upload-pack`,
      );
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Groffee"');
    });

    it("allows owner to access private repos", async () => {
      const { data } = await createRepo("private-repo", { isPublic: false });
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/private-repo.git/info/refs?service=git-upload-pack`,
        basicAuth("testuser", "password123"),
      );
      expect(res.status).toBe(200);
    });

    it("allows collaborator to access private repos", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      const { data } = await createRepo("private-repo", { cookie: owner.cookie, isPublic: false });
      populateTestRepo(data.repository.diskPath);

      const collab = await registerUser("collab", "collab@test.com", "collabpass");

      await db.insert(repoCollaborators).values({
        id: crypto.randomUUID(),
        repoId: data.repository.id,
        userId: collab.data.user.id,
        permission: "read",
        createdAt: new Date(),
      });

      const res = await gitGet(
        `/owner/private-repo.git/info/refs?service=git-upload-pack`,
        basicAuth("collab", "collabpass"),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-collaborator accessing private repo", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      const { data } = await createRepo("private-repo", { cookie: owner.cookie, isPublic: false });
      populateTestRepo(data.repository.diskPath);

      await registerUser("stranger", "stranger@test.com", "strangerpass");

      const res = await gitGet(
        `/owner/private-repo.git/info/refs?service=git-upload-pack`,
        basicAuth("stranger", "strangerpass"),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("info/refs for git-receive-pack (push)", () => {
    it("returns 401 without auth", async () => {
      const { data } = await createRepo("myrepo");
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=git-receive-pack`,
      );
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Groffee"');
    });

    it("returns 401 with bad credentials", async () => {
      const { data } = await createRepo("myrepo");
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=git-receive-pack`,
        basicAuth("testuser", "wrongpassword"),
      );
      expect(res.status).toBe(401);
    });

    it("allows owner to push", async () => {
      const { data } = await createRepo("myrepo");
      populateTestRepo(data.repository.diskPath);

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=git-receive-pack`,
        basicAuth("testuser", "password123"),
      );
      expect(res.status).toBe(200);
    });

    it("returns 403 for user with no push permission", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      const { data } = await createRepo("myrepo", { cookie: owner.cookie });
      populateTestRepo(data.repository.diskPath);

      await registerUser("reader", "reader@test.com", "readerpass");

      const res = await gitGet(
        `/owner/myrepo.git/info/refs?service=git-receive-pack`,
        basicAuth("reader", "readerpass"),
      );
      expect(res.status).toBe(403);
    });

    it("allows collaborator with write permission to push", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      const { data } = await createRepo("myrepo", { cookie: owner.cookie });
      populateTestRepo(data.repository.diskPath);

      const collab = await registerUser("writer", "writer@test.com", "writerpass");

      await db.insert(repoCollaborators).values({
        id: crypto.randomUUID(),
        repoId: data.repository.id,
        userId: collab.data.user.id,
        permission: "write",
        createdAt: new Date(),
      });

      const res = await gitGet(
        `/owner/myrepo.git/info/refs?service=git-receive-pack`,
        basicAuth("writer", "writerpass"),
      );
      expect(res.status).toBe(200);
    });

    it("denies collaborator with read-only permission from pushing", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      const { data } = await createRepo("myrepo", { cookie: owner.cookie });
      populateTestRepo(data.repository.diskPath);

      const collab = await registerUser("reader", "reader@test.com", "readerpass");

      await db.insert(repoCollaborators).values({
        id: crypto.randomUUID(),
        repoId: data.repository.id,
        userId: collab.data.user.id,
        permission: "read",
        createdAt: new Date(),
      });

      const res = await gitGet(
        `/owner/myrepo.git/info/refs?service=git-receive-pack`,
        basicAuth("reader", "readerpass"),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST git-receive-pack (push data)", () => {
    it("returns 401 without auth", async () => {
      const { data } = await createRepo("myrepo");

      const res = await gitPost(
        `/${data.repository.owner}/myrepo.git/git-receive-pack`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-owner", async () => {
      const owner = await registerUser("owner", "owner@test.com", "ownerpass");
      await createRepo("myrepo", { cookie: owner.cookie });

      await registerUser("stranger", "stranger@test.com", "strangerpass");

      const res = await gitPost(
        `/owner/myrepo.git/git-receive-pack`,
        basicAuth("stranger", "strangerpass"),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST git-upload-pack (clone/fetch data)", () => {
    it("allows unauthenticated access to public repos", async () => {
      const { data } = await createRepo("public-repo", { isPublic: true });
      populateTestRepo(data.repository.diskPath);

      // May fail with git protocol error (empty body), but should NOT be 401/403
      const res = await gitPost(
        `/${data.repository.owner}/public-repo.git/git-upload-pack`,
      );
      expect([200, 500]).toContain(res.status); // 500 = git process error from empty body, not auth
    });

    it("returns 401 for private repos without auth", async () => {
      const { data } = await createRepo("private-repo", { isPublic: false });

      const res = await gitPost(
        `/${data.repository.owner}/private-repo.git/git-upload-pack`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("edge cases", () => {
    it("returns 400 for invalid service parameter", async () => {
      const { data } = await createRepo("myrepo");

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=invalid`,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing service parameter", async () => {
      const { data } = await createRepo("myrepo");

      const res = await gitGet(`/${data.repository.owner}/myrepo.git/info/refs`);
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent repo", async () => {
      const res = await gitGet(
        `/nobody/nonexistent.git/info/refs?service=git-upload-pack`,
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for nonexistent owner", async () => {
      const res = await gitGet(
        `/ghostuser/repo.git/info/refs?service=git-receive-pack`,
        basicAuth("ghostuser", "password"),
      );
      expect(res.status).toBe(404);
    });

    it("handles malformed Basic Auth gracefully", async () => {
      const { data } = await createRepo("myrepo");

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=git-receive-pack`,
        "Basic !!!invalid-base64!!!",
      );
      expect(res.status).toBe(401);
    });

    it("handles Bearer token (wrong scheme) as missing auth", async () => {
      const { data } = await createRepo("myrepo");

      const res = await gitGet(
        `/${data.repository.owner}/myrepo.git/info/refs?service=git-receive-pack`,
        "Bearer some-token",
      );
      expect(res.status).toBe(401);
    });
  });
});
