import { describe, it, expect } from "vitest";
import { canPush, canRead } from "../lib/permissions.js";
import { db, users, repositories, repoCollaborators } from "@groffee/db";

async function createUser(username: string) {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    username,
    email: `${username}@test.com`,
    passwordHash: "unused",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function createRepo(ownerId: string, name: string, isPublic = true) {
  const id = crypto.randomUUID();
  await db.insert(repositories).values({
    id,
    ownerId,
    name,
    isPublic,
    diskPath: `/tmp/test/${name}.git`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function addCollaborator(repoId: string, userId: string, permission: string) {
  const id = crypto.randomUUID();
  await db.insert(repoCollaborators).values({
    id,
    repoId,
    userId,
    permission,
    createdAt: new Date(),
  });
}

describe("canPush", () => {
  it("returns true for the repo owner", async () => {
    const ownerId = await createUser("owner");
    const repoId = await createRepo(ownerId, "myrepo");
    expect(await canPush(ownerId, repoId)).toBe(true);
  });

  it("returns true for a collaborator with write permission", async () => {
    const ownerId = await createUser("owner");
    const collabId = await createUser("collab");
    const repoId = await createRepo(ownerId, "myrepo");
    await addCollaborator(repoId, collabId, "write");
    expect(await canPush(collabId, repoId)).toBe(true);
  });

  it("returns true for a collaborator with admin permission", async () => {
    const ownerId = await createUser("owner");
    const adminId = await createUser("admin");
    const repoId = await createRepo(ownerId, "myrepo");
    await addCollaborator(repoId, adminId, "admin");
    expect(await canPush(adminId, repoId)).toBe(true);
  });

  it("returns false for a collaborator with read-only permission", async () => {
    const ownerId = await createUser("owner");
    const readerId = await createUser("reader");
    const repoId = await createRepo(ownerId, "myrepo");
    await addCollaborator(repoId, readerId, "read");
    expect(await canPush(readerId, repoId)).toBe(false);
  });

  it("returns false for a non-collaborator", async () => {
    const ownerId = await createUser("owner");
    const strangerId = await createUser("stranger");
    const repoId = await createRepo(ownerId, "myrepo");
    expect(await canPush(strangerId, repoId)).toBe(false);
  });

  it("returns false for a nonexistent repo", async () => {
    const userId = await createUser("user");
    expect(await canPush(userId, "nonexistent-repo-id")).toBe(false);
  });
});

describe("canRead", () => {
  it("returns true for a public repo with null userId", async () => {
    const ownerId = await createUser("owner");
    const repoId = await createRepo(ownerId, "public-repo", true);
    expect(await canRead(null, repoId)).toBe(true);
  });

  it("returns true for a public repo with any userId", async () => {
    const ownerId = await createUser("owner");
    const anyoneId = await createUser("anyone");
    const repoId = await createRepo(ownerId, "public-repo", true);
    expect(await canRead(anyoneId, repoId)).toBe(true);
  });

  it("returns true for a private repo owner", async () => {
    const ownerId = await createUser("owner");
    const repoId = await createRepo(ownerId, "private-repo", false);
    expect(await canRead(ownerId, repoId)).toBe(true);
  });

  it("returns true for a private repo collaborator (any permission)", async () => {
    const ownerId = await createUser("owner");
    const readerId = await createUser("reader");
    const repoId = await createRepo(ownerId, "private-repo", false);
    await addCollaborator(repoId, readerId, "read");
    expect(await canRead(readerId, repoId)).toBe(true);
  });

  it("returns false for a private repo with null userId", async () => {
    const ownerId = await createUser("owner");
    const repoId = await createRepo(ownerId, "private-repo", false);
    expect(await canRead(null, repoId)).toBe(false);
  });

  it("returns false for a private repo non-collaborator", async () => {
    const ownerId = await createUser("owner");
    const strangerId = await createUser("stranger");
    const repoId = await createRepo(ownerId, "private-repo", false);
    expect(await canRead(strangerId, repoId)).toBe(false);
  });

  it("returns false for a nonexistent repo", async () => {
    expect(await canRead(null, "nonexistent-repo-id")).toBe(false);
  });
});
