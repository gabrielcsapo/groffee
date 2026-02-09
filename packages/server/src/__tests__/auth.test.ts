import { describe, it, expect } from "vitest";
import { post, get, extractCookie, registerUser } from "./helpers.js";

describe("POST /api/auth/register", () => {
  it("creates a new user", async () => {
    const res = await post("/api/auth/register", {
      username: "alice",
      email: "alice@test.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe("alice");
    expect(data.user.email).toBe("alice@test.com");
    expect(data.user.id).toBeDefined();
  });

  it("sets a session cookie", async () => {
    const res = await post("/api/auth/register", {
      username: "alice",
      email: "alice@test.com",
      password: "password123",
    });
    const cookie = extractCookie(res);
    expect(cookie).toMatch(/^session=.+/);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await post("/api/auth/register", { username: "alice" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing required fields");
  });

  it("returns 400 when password is too short", async () => {
    const res = await post("/api/auth/register", {
      username: "alice",
      email: "alice@test.com",
      password: "short",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/8 characters/);
  });

  it("returns 409 for duplicate username", async () => {
    await registerUser("alice", "alice@test.com");
    const res = await post("/api/auth/register", {
      username: "alice",
      email: "other@test.com",
      password: "password123",
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/Username/);
  });

  it("returns 409 for duplicate email", async () => {
    await registerUser("alice", "alice@test.com");
    const res = await post("/api/auth/register", {
      username: "bob",
      email: "alice@test.com",
      password: "password123",
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/Email/);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    await registerUser("alice", "alice@test.com");
    const res = await post("/api/auth/login", {
      username: "alice",
      password: "password123",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe("alice");
    expect(extractCookie(res)).toMatch(/^session=.+/);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await post("/api/auth/login", { username: "alice" });
    expect(res.status).toBe(400);
  });

  it("returns 401 for unknown username", async () => {
    const res = await post("/api/auth/login", {
      username: "nobody",
      password: "password123",
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  it("returns 401 for wrong password", async () => {
    await registerUser("alice", "alice@test.com");
    const res = await post("/api/auth/login", {
      username: "alice",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session", async () => {
    const { cookie } = await registerUser();
    const res = await post("/api/auth/logout", {}, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Session should no longer be valid
    const meRes = await get("/api/auth/me", cookie);
    const meData = await meRes.json();
    expect(meData.user).toBeNull();
  });

  it("succeeds even without a session", async () => {
    const res = await post("/api/auth/logout", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/auth/me", () => {
  it("returns the authenticated user", async () => {
    const { cookie } = await registerUser("alice", "alice@test.com");
    const res = await get("/api/auth/me", cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe("alice");
    expect(data.user.email).toBe("alice@test.com");
  });

  it("returns null without auth", async () => {
    const res = await get("/api/auth/me");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
  });
});
