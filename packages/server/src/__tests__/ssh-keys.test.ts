import { describe, it, expect } from "vitest";
import { post, get, del, registerUser } from "./helpers.js";

// A valid ed25519 public key for testing
const VALID_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test@groffee";

// A different valid ed25519 key
const VALID_KEY_2 =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ0BA9DaqajkBiCf5GPmBMbfPJkopHnBRGaGJkrbzDlj other@groffee";

describe("SSH Key Management", () => {
  describe("POST /api/user/ssh-keys", () => {
    it("adds a new SSH key", async () => {
      const { cookie } = await registerUser();
      const res = await post("/api/user/ssh-keys", { title: "My Key", publicKey: VALID_KEY }, cookie);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.key.title).toBe("My Key");
      expect(data.key.fingerprint).toMatch(/^SHA256:/);
      expect(data.key.id).toBeTruthy();
    });

    it("returns 401 without auth", async () => {
      const res = await post("/api/user/ssh-keys", { title: "My Key", publicKey: VALID_KEY });
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing fields", async () => {
      const { cookie } = await registerUser();
      const res = await post("/api/user/ssh-keys", { title: "" }, cookie);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid key format", async () => {
      const { cookie } = await registerUser();
      const res = await post(
        "/api/user/ssh-keys",
        { title: "Bad Key", publicKey: "not-a-valid-key" },
        cookie,
      );
      expect(res.status).toBe(400);
    });

    it("returns 409 for duplicate key", async () => {
      const { cookie } = await registerUser();
      await post("/api/user/ssh-keys", { title: "Key 1", publicKey: VALID_KEY }, cookie);
      const res = await post(
        "/api/user/ssh-keys",
        { title: "Key 2", publicKey: VALID_KEY },
        cookie,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/user/ssh-keys", () => {
    it("lists user keys", async () => {
      const { cookie } = await registerUser();
      await post("/api/user/ssh-keys", { title: "Key A", publicKey: VALID_KEY }, cookie);
      await post("/api/user/ssh-keys", { title: "Key B", publicKey: VALID_KEY_2 }, cookie);

      const res = await get("/api/user/ssh-keys", cookie);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.keys).toHaveLength(2);
      expect(data.keys.map((k: { title: string }) => k.title).sort()).toEqual(["Key A", "Key B"]);
    });

    it("returns empty array when no keys", async () => {
      const { cookie } = await registerUser();
      const res = await get("/api/user/ssh-keys", cookie);
      const data = await res.json();
      expect(data.keys).toHaveLength(0);
    });

    it("does not show other users keys", async () => {
      const user1 = await registerUser("user1", "user1@test.com");
      const user2 = await registerUser("user2", "user2@test.com");

      await post("/api/user/ssh-keys", { title: "User1 Key", publicKey: VALID_KEY }, user1.cookie);

      const res = await get("/api/user/ssh-keys", user2.cookie);
      const data = await res.json();
      expect(data.keys).toHaveLength(0);
    });
  });

  describe("DELETE /api/user/ssh-keys/:id", () => {
    it("deletes a key", async () => {
      const { cookie } = await registerUser();
      const addRes = await post(
        "/api/user/ssh-keys",
        { title: "My Key", publicKey: VALID_KEY },
        cookie,
      );
      const { key } = await addRes.json();

      const res = await del(`/api/user/ssh-keys/${key.id}`, cookie);
      expect(res.status).toBe(200);

      const listRes = await get("/api/user/ssh-keys", cookie);
      const listData = await listRes.json();
      expect(listData.keys).toHaveLength(0);
    });

    it("returns 404 for nonexistent key", async () => {
      const { cookie } = await registerUser();
      const res = await del("/api/user/ssh-keys/nonexistent-id", cookie);
      expect(res.status).toBe(404);
    });

    it("cannot delete another users key", async () => {
      const user1 = await registerUser("user1", "user1@test.com");
      const user2 = await registerUser("user2", "user2@test.com");

      const addRes = await post(
        "/api/user/ssh-keys",
        { title: "User1 Key", publicKey: VALID_KEY },
        user1.cookie,
      );
      const { key } = await addRes.json();

      const res = await del(`/api/user/ssh-keys/${key.id}`, user2.cookie);
      expect(res.status).toBe(404);
    });
  });
});
