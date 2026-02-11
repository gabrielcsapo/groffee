import { app } from "../app.js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const DATA_DIR = process.env.DATA_DIR!;

// Response with json() typed as any for test convenience
type TestResponse = Omit<Response, "json"> & { json(): Promise<any> };

/** Make a JSON POST request */
export async function post(path: string, body: unknown, cookie?: string): Promise<TestResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  return app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as Promise<TestResponse>;
}

/** Make a GET request */
export async function get(path: string, cookie?: string): Promise<TestResponse> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  return app.request(path, { headers }) as Promise<TestResponse>;
}

/** Make a PATCH request */
export async function patch(path: string, body: unknown, cookie?: string): Promise<TestResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  return app.request(path, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  }) as Promise<TestResponse>;
}

/** Make a DELETE request */
export async function del(path: string, cookie?: string): Promise<TestResponse> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  return app.request(path, { method: "DELETE", headers }) as Promise<TestResponse>;
}

/** Extract session cookie from a Set-Cookie header */
export function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") || "";
  // "session=abc123; Path=/; HttpOnly; ..." -> "session=abc123"
  return setCookie.split(";")[0];
}

/** Register a user and return the session cookie */
export async function registerUser(
  username = "testuser",
  email = "test@test.com",
  password = "password123",
) {
  const res = await post("/api/auth/register", { username, email, password });
  const data = await res.json();
  const cookie = extractCookie(res);
  return { res, data, cookie };
}

/** Create a repo via the API (registers user first if no cookie provided) */
export async function createRepo(
  name: string,
  opts: { cookie?: string; description?: string; isPublic?: boolean } = {},
) {
  let cookie = opts.cookie;
  if (!cookie) {
    const reg = await registerUser();
    cookie = reg.cookie;
  }
  const res = await post(
    "/api/repos",
    { name, description: opts.description, isPublic: opts.isPublic },
    cookie,
  );
  const data = await res.json();
  // POST /api/repos doesn't return diskPath, so reconstruct it
  if (data.repository) {
    data.repository.diskPath = resolve(DATA_DIR, data.repository.owner, `${name}.git`);
  }
  return { res, data, cookie };
}

/** Populate a bare repo with commits on main and a feature branch */
export function populateTestRepo(bareRepoPath: string) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.com",
  };
  const opts = { cwd: bareRepoPath, env };

  // Create a blob for README.md
  const blobHash = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    ...opts,
    input: "# Test Repo\n",
  })
    .toString()
    .trim();

  // Create a tree containing README.md
  const treeHash = execFileSync("git", ["mktree"], {
    ...opts,
    input: `100644 blob ${blobHash}\tREADME.md\n`,
  })
    .toString()
    .trim();

  // Create initial commit on main
  const commitHash = execFileSync("git", ["commit-tree", treeHash, "-m", "Initial commit"], opts)
    .toString()
    .trim();

  execFileSync("git", ["update-ref", "refs/heads/main", commitHash], opts);

  // Create feature branch with an extra file
  const featureBlob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    ...opts,
    input: "feature content\n",
  })
    .toString()
    .trim();

  const featureTree = execFileSync("git", ["mktree"], {
    ...opts,
    input: `100644 blob ${blobHash}\tREADME.md\n100644 blob ${featureBlob}\tfeature.txt\n`,
  })
    .toString()
    .trim();

  const featureCommit = execFileSync(
    "git",
    ["commit-tree", featureTree, "-p", commitHash, "-m", "Add feature"],
    opts,
  )
    .toString()
    .trim();

  execFileSync("git", ["update-ref", "refs/heads/feature", featureCommit], opts);

  return { mainCommit: commitHash, featureCommit };
}
