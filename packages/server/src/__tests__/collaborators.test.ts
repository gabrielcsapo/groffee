import { describe, it, expect } from "vitest";
import { post, get, del, registerUser, createRepo } from "./helpers.js";

describe("Collaborators", () => {
  describe("POST /api/repos/:owner/:repo/collaborators", () => {
    it("adds a collaborator", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });
      await registerUser("collab", "collab@test.com");

      const res = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab", permission: "write" },
        owner.cookie,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.collaborator.username).toBe("collab");
      expect(data.collaborator.permission).toBe("write");
    });

    it("returns 403 for non-owner", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });
      const other = await registerUser("other", "other@test.com");

      const res = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "other", permission: "write" },
        other.cookie,
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 when adding owner as collaborator", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });

      const res = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "owner", permission: "write" },
        owner.cookie,
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent user", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });

      const res = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "ghost", permission: "write" },
        owner.cookie,
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 for duplicate collaborator", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });
      await registerUser("collab", "collab@test.com");

      await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab" },
        owner.cookie,
      );
      const res = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab" },
        owner.cookie,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/repos/:owner/:repo/collaborators", () => {
    it("lists collaborators", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });
      await registerUser("collab1", "collab1@test.com");
      await registerUser("collab2", "collab2@test.com");

      await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab1" },
        owner.cookie,
      );
      await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab2", permission: "read" },
        owner.cookie,
      );

      const res = await get("/api/repos/owner/myrepo/collaborators", owner.cookie);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.collaborators).toHaveLength(2);
    });
  });

  describe("DELETE /api/repos/:owner/:repo/collaborators/:id", () => {
    it("removes a collaborator", async () => {
      const owner = await registerUser("owner", "owner@test.com");
      await createRepo("myrepo", { cookie: owner.cookie });
      await registerUser("collab", "collab@test.com");

      const addRes = await post(
        "/api/repos/owner/myrepo/collaborators",
        { username: "collab" },
        owner.cookie,
      );
      const { collaborator } = await addRes.json();

      const res = await del(
        `/api/repos/owner/myrepo/collaborators/${collaborator.id}`,
        owner.cookie,
      );
      expect(res.status).toBe(200);

      const listRes = await get("/api/repos/owner/myrepo/collaborators", owner.cookie);
      const listData = await listRes.json();
      expect(listData.collaborators).toHaveLength(0);
    });
  });
});
