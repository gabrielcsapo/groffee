/**
 * Seed script — generates realistic scale data for UI testing.
 *
 * Run via: pnpm seed
 *
 * Creates:
 * - 5 users
 * - 8 repos with varying sizes (files, branches, commits)
 * - 65+ issues across repos
 * - 30+ pull requests across repos
 * - 200+ comments
 */
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { db, users, repositories, issues, pullRequests, comments } from "@groffee/db";
import { eq } from "drizzle-orm";
import { initBareRepo } from "@groffee/git";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const DATA_DIR = resolve(PROJECT_ROOT, "data");
const REPOS_DIR = resolve(DATA_DIR, "repositories");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** git helper — runs git in a bare repo */
function git(repoPath: string, args: string[], input?: string): string {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Seed",
    GIT_AUTHOR_EMAIL: "seed@groffee.local",
    GIT_COMMITTER_NAME: "Seed",
    GIT_COMMITTER_EMAIL: "seed@groffee.local",
  };
  return execFileSync("git", args, { cwd: repoPath, env, input }).toString().trim();
}

/** Create a blob from content */
function makeBlob(repoPath: string, content: string): string {
  return git(repoPath, ["hash-object", "-w", "--stdin"], content);
}

/** Build a flat tree from entries: [mode, type, hash, name][] */
function makeTree(repoPath: string, entries: [string, string, string, string][]): string {
  const input =
    entries.map(([mode, type, h, name]) => `${mode} ${type} ${h}\t${name}`).join("\n") + "\n";
  return git(repoPath, ["mktree"], input);
}

/** Create a commit */
function makeCommit(
  repoPath: string,
  treeHash: string,
  message: string,
  parents: string[] = [],
): string {
  const args = ["commit-tree", treeHash, "-m", message];
  for (const p of parents) {
    args.push("-p", p);
  }
  return git(repoPath, args);
}

/** Update a ref */
function updateRef(repoPath: string, ref: string, commitHash: string): void {
  git(repoPath, ["update-ref", ref, commitHash]);
}

// ---------------------------------------------------------------------------
// File content generators
// ---------------------------------------------------------------------------

function tsFileContent(name: string, lines = 20): string {
  const out = [`// ${name}`, ""];
  for (let i = 0; i < lines; i++) {
    out.push(`export const val${i} = ${i};`);
  }
  return out.join("\n") + "\n";
}

function mdFileContent(title: string, sections = 3): string {
  const out = [`# ${title}`, ""];
  for (let i = 1; i <= sections; i++) {
    out.push(
      `## Section ${i}`,
      "",
      `Content for section ${i}. This is a paragraph of text that explains the topic in reasonable detail.`,
      "",
    );
  }
  return out.join("\n");
}

const README_LONG = `# mega-app

A comprehensive full-stack application built with TypeScript.

## Features

- User authentication and authorization
- RESTful API with full CRUD operations
- Real-time notifications via WebSockets
- Comprehensive test suite with 95%+ coverage
- Docker support for easy deployment
- CI/CD pipeline with GitHub Actions

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Architecture

The application follows a layered architecture:

- **Routes** — HTTP request handlers
- **Services** — Business logic
- **Models** — Data access layer
- **Utils** — Shared utilities

## Configuration

Create a \`.env\` file:

\`\`\`
DATABASE_URL=postgres://localhost:5432/megaapp
JWT_SECRET=your-secret-here
REDIS_URL=redis://localhost:6379
\`\`\`

## API Documentation

See [docs/api-reference.md](docs/api-reference.md) for the full API specification.

## Contributing

Please read [docs/contributing.md](docs/contributing.md) before submitting a pull request.

## License

MIT
`;

const LICENSE_MIT = `MIT License

Copyright (c) 2024 Alice

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`;

const PACKAGE_JSON = `{
  "name": "mega-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "eslint": "^8.56.0"
  }
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
`;

const GITIGNORE = `node_modules/
dist/
.env
*.log
coverage/
`;

// ---------------------------------------------------------------------------
// Issue / PR / Comment content
// ---------------------------------------------------------------------------

const ISSUE_TITLES = [
  "Fix login redirect when session expires",
  "Add pagination to user list endpoint",
  "TypeError: Cannot read properties of undefined in UserService",
  "Support dark mode in the dashboard",
  "Improve error messages for validation failures",
  "Memory leak in WebSocket connection handler",
  "Add rate limiting to authentication endpoints",
  "Database connection pool exhaustion under load",
  "Implement user avatar upload functionality",
  "Search endpoint returns incorrect results for special characters",
  "Add CSV export for admin reports",
  "Refactor middleware chain for better error handling across all route handlers and service layers",
  "Performance degradation when loading repositories with more than 1000 files in the tree view — investigate lazy loading options and virtual scrolling",
  "Update TypeScript to v5.4 and fix breaking type changes in the entire codebase including test utilities and mock factories",
  "CORS preflight requests failing on the /api/repos endpoint when accessed from the staging environment subdomain with custom headers",
  "Add comprehensive logging with structured JSON format for production debugging and monitoring integration with Datadog",
  "Implement OAuth2 login with GitHub, GitLab, and Bitbucket providers",
  "Migrate database schema to support multi-tenancy",
  "Add email notifications for issue status changes",
  "Fix race condition in concurrent PR merge operations",
  "Implement branch protection rules",
  "Add code search across repositories",
  "Support for .gitattributes and LFS pointers",
  "Webhook support for repository events",
  "Add two-factor authentication",
  "Implement issue labels and milestones",
  "Fix diff rendering for binary files",
  "Add repository forking functionality",
  "Support for repository templates",
  "Implement commit signing verification",
  "Add activity feed on user profile page",
  "Repository archive and download as zip/tar.gz",
  "Fix blob viewer encoding issues with UTF-16 files",
  "Add markdown preview in issue editor",
  "Implement assignees for issues and pull requests",
  "Repository statistics page with contribution graphs",
  "Add commit status checks for pull requests",
  "Fix tree view sorting: directories should come before files",
  "Improve mobile responsive layout for repository pages",
  "Add keyboard shortcuts for common actions throughout the application interface",
  "Implement repository topics/tags for better discoverability",
  "Support for Git submodules display in tree view",
  "Add diff comment threading for code review",
  "Implement protected branches with required reviews",
  "Fix performance of commit log for repositories with 10000+ commits",
];

const ISSUE_BODIES = [
  null,
  "Steps to reproduce:\n1. Login as any user\n2. Navigate to settings\n3. Click save without changes\n4. Observe the error\n\nExpected: No error\nActual: 500 Internal Server Error",
  "Currently the user list returns all users in a single response. For instances with many users this is slow and memory-intensive.\n\nWe should add `limit` and `offset` query parameters, defaulting to 30 items per page.\n\nThis will also require updating the frontend to support pagination controls.",
  "When a user's session expires while they're on a protected page, clicking any link redirects to `/login` but doesn't preserve the original URL they were trying to visit.\n\nAfter login, they should be redirected back to where they were.",
  "## Problem\n\nThe WebSocket handler doesn't properly clean up connections when clients disconnect unexpectedly. Over time this leads to memory growth.\n\n## Investigation\n\nUsing `--inspect` and taking heap snapshots, I can see that `Connection` objects accumulate. After 24 hours of running with ~50 concurrent users, memory usage grows from 150MB to 800MB.\n\n## Proposed Fix\n\n1. Add a heartbeat/ping mechanism\n2. Set a timeout for unresponsive connections\n3. Ensure the `close` handler runs cleanup in all cases\n\n```typescript\nws.on('close', () => {\n  clearInterval(heartbeatInterval);\n  connectionPool.delete(ws);\n  // ... other cleanup\n});\n```",
  'We need structured logging for production. Currently we use `console.log` which makes it hard to:\n- Filter by severity\n- Search by request ID\n- Integrate with monitoring tools\n\nProposal: Switch to `pino` with the following format:\n```json\n{"level":"info","time":1234567890,"requestId":"abc-123","msg":"Request completed","duration":45}\n```',
];

const PR_TITLES = [
  "feat: add user authentication middleware",
  "fix: resolve race condition in merge handler",
  "refactor: extract validation into shared utilities",
  "feat: implement repository search with full-text indexing",
  "fix: correct pagination offset calculation",
  "chore: update dependencies to latest versions",
  "feat: add dark mode support",
  "fix: handle UTF-8 encoding in blob viewer",
  "feat: implement branch protection rules",
  "refactor: move database queries to repository pattern",
  "feat: add webhook delivery system",
  "fix: prevent duplicate issue numbers on concurrent creation",
  "feat: implement OAuth2 flow for GitHub login provider with comprehensive error handling and token refresh support",
  "chore: migrate CI from Jenkins to GitHub Actions with parallel test execution and caching",
  "feat: add real-time notifications via Server-Sent Events",
  "fix: resolve memory leak in long-running WebSocket connections",
  "feat: implement code search with trigram indexing across all repositories in the organization workspace",
  "refactor: consolidate error handling middleware",
  "feat: add CSV export for admin reports",
  "fix: correct diff calculation for renamed files with content changes",
];

const COMMENT_BODIES = [
  "Looks good to me!",
  "LGTM 👍",
  "Fixed in the latest push.",
  "Can you add a test for the edge case?",
  "I think we should also handle the case where the input is empty.",
  "Nice catch! I've updated the validation logic.",
  "This change looks correct but I'm worried about performance. Have you benchmarked it with larger datasets?",
  "I tested this locally and it works as expected. The error no longer appears after session expiry.",
  "Could we extract this into a shared utility? I've seen the same pattern in three other files.",
  "Great improvement! The response time dropped from 800ms to 120ms after this change.\n\nOne small suggestion: should we add a cache invalidation strategy for when the underlying data changes?",
  "I've run the full test suite and all 347 tests pass. The new tests cover the edge cases we discussed.\n\nHowever, I noticed that the `integration/api.test.ts` file is getting quite long (800+ lines). Should we split it into separate files per endpoint?",
  "After deploying this to staging, I noticed an issue with the database migration. The `ALTER TABLE` statement fails on PostgreSQL 14 because of the concurrent index creation.\n\nWe should wrap it in a transaction:\n\n```sql\nBEGIN;\nALTER TABLE users ADD COLUMN avatar_url TEXT;\nCREATE INDEX CONCURRENTLY idx_users_avatar ON users(avatar_url);\nCOMMIT;\n```\n\nActually, `CREATE INDEX CONCURRENTLY` can't run inside a transaction. We need to split this into two migrations.",
  "I've been thinking about this more and I believe the right approach is:\n\n1. First, add the column without the index\n2. Deploy and backfill existing rows\n3. Then add the index in a separate migration\n\nThis avoids locking the table for extended periods on large instances.",
  "Tested the following scenarios:\n\n- [x] Login with valid credentials\n- [x] Login with invalid password\n- [x] Login with non-existent user\n- [x] Session expiry redirect\n- [x] Concurrent login from multiple devices\n- [x] Password with special characters\n\nAll pass. Approving.",
  "This is a really clean implementation. I especially like how you separated the transport layer from the business logic.\n\nA few minor suggestions:\n\n1. The `MAX_RETRY_COUNT` constant should probably be configurable via environment variable\n2. The error message on line 45 could be more descriptive\n3. Consider adding a `finally` block to ensure the connection is always closed\n\nNone of these are blockers — feel free to address in a follow-up.",
];

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function main() {
  // Check idempotency
  const existing = await db.select().from(users).where(eq(users.username, "alice")).limit(1);

  if (existing.length > 0) {
    console.log("⚠ Seed data already exists (user 'alice' found). Skipping.");
    process.exit(0);
  }

  console.log("🌱 Starting seed...\n");

  // Ensure data dirs exist
  await mkdir(REPOS_DIR, { recursive: true });

  // -----------------------------------------------------------------------
  // 1. Create users
  // -----------------------------------------------------------------------
  console.log("👤 Creating users...");
  const passwordHash = await hash("password123");

  const userDefs = [
    {
      username: "alice",
      email: "alice@example.com",
      displayName: "Alice Anderson",
      bio: "Full-stack developer. Loves TypeScript and coffee.",
    },
    {
      username: "bob",
      email: "bob@example.com",
      displayName: "Bob Baker",
      bio: "Backend engineer. Building APIs since 2015.",
    },
    {
      username: "charlie",
      email: "charlie@example.com",
      displayName: "Charlie Chen",
      bio: "Design systems enthusiast.",
    },
    {
      username: "diana",
      email: "diana@example.com",
      displayName: "Diana Davis",
      bio: null,
    },
    {
      username: "eve",
      email: "eve@example.com",
      displayName: "Eve Evans",
      bio: "CLI tools and developer experience.",
    },
  ];

  const userMap: Record<string, string> = {};
  const userIds: string[] = [];

  for (const u of userDefs) {
    const id = randomUUID();
    userMap[u.username] = id;
    userIds.push(id);
    await db.insert(users).values({
      id,
      username: u.username,
      email: u.email,
      passwordHash,
      displayName: u.displayName,
      bio: u.bio,
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90),
    });
  }
  console.log(`  Created ${userDefs.length} users\n`);

  // -----------------------------------------------------------------------
  // 2. Create repos with git content
  // -----------------------------------------------------------------------
  console.log("📦 Creating repositories...");

  interface RepoDef {
    name: string;
    owner: string;
    description: string;
    isPublic: boolean;
    files: Record<string, string>;
    branches: string[];
    commitCount: number;
    daysOld: number;
  }

  const repoDefs: RepoDef[] = [
    {
      name: "mega-app",
      owner: "alice",
      description:
        "A comprehensive full-stack TypeScript application with auth, API, real-time features, and 95%+ test coverage.",
      isPublic: true,
      files: {
        "README.md": README_LONG,
        LICENSE: LICENSE_MIT,
        "package.json": PACKAGE_JSON,
        "tsconfig.json": TSCONFIG,
        ".gitignore": GITIGNORE,
        "src/index.ts": tsFileContent("src/index.ts", 30),
        "src/config.ts": tsFileContent("src/config.ts", 25),
        "src/utils/helpers.ts": tsFileContent("src/utils/helpers.ts", 40),
        "src/utils/format.ts": tsFileContent("src/utils/format.ts", 20),
        "src/utils/validate.ts": tsFileContent("src/utils/validate.ts", 35),
        "src/utils/constants.ts": tsFileContent("src/utils/constants.ts", 15),
        "src/models/user.ts": tsFileContent("src/models/user.ts", 50),
        "src/models/post.ts": tsFileContent("src/models/post.ts", 45),
        "src/models/comment.ts": tsFileContent("src/models/comment.ts", 30),
        "src/models/tag.ts": tsFileContent("src/models/tag.ts", 20),
        "src/routes/auth.ts": tsFileContent("src/routes/auth.ts", 60),
        "src/routes/users.ts": tsFileContent("src/routes/users.ts", 50),
        "src/routes/posts.ts": tsFileContent("src/routes/posts.ts", 55),
        "src/routes/comments.ts": tsFileContent("src/routes/comments.ts", 40),
        "src/routes/tags.ts": tsFileContent("src/routes/tags.ts", 30),
        "src/routes/middleware.ts": tsFileContent("src/routes/middleware.ts", 35),
        "src/services/auth-service.ts": tsFileContent("src/services/auth-service.ts", 70),
        "src/services/user-service.ts": tsFileContent("src/services/user-service.ts", 55),
        "src/services/post-service.ts": tsFileContent("src/services/post-service.ts", 45),
        "src/services/email-service.ts": tsFileContent("src/services/email-service.ts", 30),
        "src/types/index.ts": tsFileContent("src/types/index.ts", 20),
        "src/types/api.ts": tsFileContent("src/types/api.ts", 40),
        "src/types/models.ts": tsFileContent("src/types/models.ts", 35),
        "docs/getting-started.md": mdFileContent("Getting Started", 5),
        "docs/api-reference.md": mdFileContent("API Reference", 8),
        "docs/deployment.md": mdFileContent("Deployment Guide", 4),
        "docs/contributing.md": mdFileContent("Contributing", 3),
        "tests/setup.ts": tsFileContent("tests/setup.ts", 15),
        "tests/auth.test.ts": tsFileContent("tests/auth.test.ts", 80),
        "tests/users.test.ts": tsFileContent("tests/users.test.ts", 60),
        "tests/posts.test.ts": tsFileContent("tests/posts.test.ts", 70),
        "tests/integration/api.test.ts": tsFileContent("tests/integration/api.test.ts", 100),
        "tests/integration/db.test.ts": tsFileContent("tests/integration/db.test.ts", 50),
      },
      branches: [
        "develop",
        "feature/auth-improvements",
        "feature/implement-very-long-descriptive-branch-name-for-testing",
        "fix/user-validation",
        "release/v1.0",
        "hotfix/security-patch",
        "chore/deps-update",
        "feature/big-refactor",
      ],
      commitCount: 30,
      daysOld: 85,
    },
    {
      name: "tiny-lib",
      owner: "alice",
      description: "A tiny utility library.",
      isPublic: true,
      files: {
        "README.md": "# tiny-lib\n\nA tiny utility library.\n",
        "index.ts": "export function add(a: number, b: number) { return a + b; }\n",
        "index.test.ts": 'import { add } from "./index";\nconsole.assert(add(1, 2) === 3);\n',
      },
      branches: ["feature/multiply"],
      commitCount: 3,
      daysOld: 60,
    },
    {
      name: "api-server",
      owner: "bob",
      description:
        "REST API server built with Hono and Drizzle ORM. Includes auth, CRUD, and real-time subscriptions.",
      isPublic: true,
      files: {
        "README.md": mdFileContent("API Server", 4),
        "package.json": '{ "name": "api-server", "version": "0.1.0" }\n',
        "src/index.ts": tsFileContent("src/index.ts", 25),
        "src/routes/auth.ts": tsFileContent("src/routes/auth.ts", 40),
        "src/routes/users.ts": tsFileContent("src/routes/users.ts", 35),
        "src/routes/posts.ts": tsFileContent("src/routes/posts.ts", 40),
        "src/middleware/auth.ts": tsFileContent("src/middleware/auth.ts", 20),
        "src/middleware/logger.ts": tsFileContent("src/middleware/logger.ts", 15),
        "src/db/schema.ts": tsFileContent("src/db/schema.ts", 50),
        "src/db/client.ts": tsFileContent("src/db/client.ts", 10),
        "tests/auth.test.ts": tsFileContent("tests/auth.test.ts", 45),
        "tests/users.test.ts": tsFileContent("tests/users.test.ts", 40),
        "tests/posts.test.ts": tsFileContent("tests/posts.test.ts", 35),
        ".env.example": "DATABASE_URL=sqlite:./data.db\nPORT=3001\n",
      },
      branches: ["develop", "feature/rate-limiting", "fix/cors", "release/v0.2"],
      commitCount: 15,
      daysOld: 70,
    },
    {
      name: "design-system",
      owner: "charlie",
      description:
        "Shared UI component library with Tailwind CSS. Buttons, forms, cards, modals, and more.",
      isPublic: true,
      files: {
        "README.md": mdFileContent("Design System", 3),
        "package.json": '{ "name": "design-system", "version": "2.0.0" }\n',
        "src/Button.tsx": tsFileContent("src/Button.tsx", 30),
        "src/Card.tsx": tsFileContent("src/Card.tsx", 25),
        "src/Modal.tsx": tsFileContent("src/Modal.tsx", 40),
        "src/Input.tsx": tsFileContent("src/Input.tsx", 20),
        "src/Select.tsx": tsFileContent("src/Select.tsx", 25),
        "src/Badge.tsx": tsFileContent("src/Badge.tsx", 15),
        "src/index.ts":
          'export * from "./Button";\nexport * from "./Card";\nexport * from "./Modal";\n',
        "styles/tokens.css":
          ":root {\n  --color-primary: #2563eb;\n  --color-surface: #ffffff;\n}\n",
        "styles/base.css": "body { font-family: sans-serif; }\n",
      },
      branches: ["feature/tooltip", "fix/button-focus"],
      commitCount: 10,
      daysOld: 45,
    },
    {
      name: "empty-repo",
      owner: "alice",
      description: "This repo is intentionally left empty for testing.",
      isPublic: true,
      files: {},
      branches: [],
      commitCount: 0,
      daysOld: 30,
    },
    {
      name: "private-notes",
      owner: "diana",
      description: "Personal notes — private.",
      isPublic: false,
      files: {
        "README.md": "# Private Notes\n\nPersonal notes. Not for public consumption.\n",
        "todo.md": "- [ ] Buy groceries\n- [x] Finish seed script\n- [ ] Review PR #42\n",
        "ideas.md":
          "## Project Ideas\n\n1. A better git UI\n2. An offline-first note-taking app\n3. A CLI for managing dotfiles\n",
        "bookmarks.md":
          "## Bookmarks\n\n- [Hono docs](https://hono.dev)\n- [Drizzle docs](https://orm.drizzle.team)\n",
        "journal/2024-01.md": "## January 2024\n\nStarted working on the new project...\n",
      },
      branches: [],
      commitCount: 5,
      daysOld: 20,
    },
    {
      name: "docs-site",
      owner: "bob",
      description: "Documentation website built with Astro. Markdown-based with full-text search.",
      isPublic: true,
      files: {
        "README.md": mdFileContent("Docs Site", 3),
        "astro.config.mjs":
          'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n',
        "src/pages/index.md": mdFileContent("Welcome", 2),
        "src/pages/getting-started.md": mdFileContent("Getting Started", 4),
        "src/pages/api/auth.md": mdFileContent("Authentication API", 5),
        "src/pages/api/repos.md": mdFileContent("Repositories API", 6),
        "src/pages/api/issues.md": mdFileContent("Issues API", 4),
        "src/pages/guides/deployment.md": mdFileContent("Deployment Guide", 3),
        "src/pages/guides/configuration.md": mdFileContent("Configuration", 4),
        "src/layouts/Base.astro": "<html><body><slot /></body></html>\n",
        "src/components/Nav.astro": "<nav>Navigation</nav>\n",
        "public/favicon.svg":
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>\n',
      },
      branches: ["feature/search"],
      commitCount: 8,
      daysOld: 40,
    },
    {
      name: "cli-tool",
      owner: "eve",
      description:
        "A command-line tool for managing git repositories. Written in TypeScript with Commander.js.",
      isPublic: true,
      files: {
        "README.md": mdFileContent("CLI Tool", 3),
        "package.json":
          '{ "name": "cli-tool", "version": "0.3.0", "bin": { "gt": "./dist/index.js" } }\n',
        "src/index.ts": tsFileContent("src/index.ts", 20),
        "src/commands/clone.ts": tsFileContent("src/commands/clone.ts", 30),
        "src/commands/status.ts": tsFileContent("src/commands/status.ts", 25),
        "src/commands/push.ts": tsFileContent("src/commands/push.ts", 25),
        "src/utils/git.ts": tsFileContent("src/utils/git.ts", 40),
        "src/utils/config.ts": tsFileContent("src/utils/config.ts", 15),
        "tests/commands.test.ts": tsFileContent("tests/commands.test.ts", 50),
      },
      branches: ["feature/pull-command", "fix/config-path"],
      commitCount: 6,
      daysOld: 25,
    },
  ];

  const repoMap: Record<string, { id: string; diskPath: string; branches: string[] }> = {};

  for (const r of repoDefs) {
    const id = randomUUID();
    const ownerUsername = r.owner;
    const ownerId = userMap[ownerUsername];
    const diskPath = resolve(REPOS_DIR, ownerUsername, `${r.name}.git`);
    const created = daysAgo(r.daysOld);

    // Init bare repo
    await initBareRepo(diskPath);

    // Build file tree and commits
    if (Object.keys(r.files).length > 0) {
      // Build nested tree structure
      const rootTree = buildTree(diskPath, r.files);

      // Create chain of commits on main
      let parentHash: string | undefined;
      const commitMessages = generateCommitMessages(r.commitCount);

      for (let i = 0; i < r.commitCount; i++) {
        // For the first commit, use the full tree. For subsequent ones, modify slightly.
        let treeHash = rootTree;
        if (i > 0) {
          // Add a small change to create distinct commits
          const changeBlob = makeBlob(diskPath, `// Change ${i}\nexport default ${i};\n`);
          // Merge with root tree using read-tree workaround: just use root tree
          // For simplicity, all commits point to the same tree but are linked in a chain
          treeHash = rootTree;
          // Actually modify: add the change file to a fresh combined tree
          // Re-read root tree entries, add new file
          const existingEntries = git(diskPath, ["ls-tree", rootTree])
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [meta, name] = line.split("\t");
              const [mode, type, hash] = meta.split(" ");
              return [mode, type, hash, name] as [string, string, string, string];
            });
          existingEntries.push(["100644", "blob", changeBlob, `.change-${i}`]);
          treeHash = makeTree(diskPath, existingEntries);
        }

        const commit = makeCommit(
          diskPath,
          treeHash,
          commitMessages[i],
          parentHash ? [parentHash] : [],
        );
        parentHash = commit;
      }

      if (parentHash) {
        updateRef(diskPath, "refs/heads/main", parentHash);
      }

      // Create feature branches (diverge from main at various points)
      for (const branch of r.branches) {
        let branchTree: string;
        let commitMsg: string;

        if (branch === "feature/big-refactor") {
          // Special: create a massive branch with 500+ new files for scale testing
          console.log("    🔥 Creating big-refactor branch with 500+ files...");
          const bigRefactorFiles: Record<string, string> = { ...r.files };
          const dirs = [
            "src/components",
            "src/pages",
            "src/hooks",
            "src/contexts",
            "src/api",
            "src/lib",
            "src/styles",
            "src/icons",
            "src/features/auth",
            "src/features/dashboard",
            "src/features/settings",
            "src/features/profile",
            "src/features/notifications",
            "tests/unit",
            "tests/e2e",
            "tests/fixtures",
            "docs/guides",
            "docs/api",
          ];
          for (let i = 0; i < 520; i++) {
            const dir = dirs[i % dirs.length];
            const name = `file-${String(i).padStart(3, "0")}`;
            bigRefactorFiles[`${dir}/${name}.ts`] = tsFileContent(
              `${dir}/${name}.ts`,
              15 + (i % 30),
            );
          }
          // Also modify a few existing files so the diff includes changes, not just additions
          bigRefactorFiles["src/index.ts"] =
            "// Refactored entry point\n" + tsFileContent("src/index.ts", 50);
          bigRefactorFiles["src/config.ts"] =
            "// Updated config\n" + tsFileContent("src/config.ts", 40);
          bigRefactorFiles["README.md"] =
            README_LONG +
            "\n## Big Refactor\n\nThis branch restructures the entire codebase into a feature-based architecture.\n";

          branchTree = buildTree(diskPath, bigRefactorFiles);
          commitMsg =
            "feat: massive refactor — restructure into feature-based architecture\n\nReorganizes the codebase into a feature-based architecture with\ncomponents, pages, hooks, contexts, and comprehensive test coverage.\n\n520 new files added across 18 directories.";
        } else {
          const branchBlob = makeBlob(
            diskPath,
            `// Branch: ${branch}\nexport const branch = "${branch}";\n`,
          );
          const branchEntries = git(diskPath, ["ls-tree", parentHash!])
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [meta, name] = line.split("\t");
              const [mode, type, h] = meta.split(" ");
              return [mode, type, h, name] as [string, string, string, string];
            });
          branchEntries.push(["100644", "blob", branchBlob, `${branch.replace(/\//g, "-")}.ts`]);
          branchTree = makeTree(diskPath, branchEntries);
          commitMsg = `feat: ${branch} changes`;
        }

        const branchCommit = makeCommit(diskPath, branchTree, commitMsg, [parentHash!]);
        updateRef(diskPath, `refs/heads/${branch}`, branchCommit);
      }
    }

    // Insert into DB
    await db.insert(repositories).values({
      id,
      ownerId,
      name: r.name,
      description: r.description,
      defaultBranch: "main",
      isPublic: r.isPublic,
      diskPath,
      createdAt: created,
      updatedAt: daysAgo(Math.floor(r.daysOld * 0.3)),
    });

    repoMap[`${ownerUsername}/${r.name}`] = {
      id,
      diskPath,
      branches: r.branches,
    };
    console.log(
      `  📁 ${ownerUsername}/${r.name} — ${Object.keys(r.files).length} files, ${r.branches.length + 1} branches, ${r.commitCount} commits`,
    );
  }
  console.log("");

  // -----------------------------------------------------------------------
  // 3. Create issues
  // -----------------------------------------------------------------------
  console.log("🐛 Creating issues...");

  interface IssuePlan {
    repoKey: string;
    count: number;
    closedCount: number;
    heavyCommentIndices: number[]; // which issues get many comments
  }

  const issuePlans: IssuePlan[] = [
    {
      repoKey: "alice/mega-app",
      count: 45,
      closedCount: 15,
      heavyCommentIndices: [0, 5, 12],
    },
    {
      repoKey: "bob/api-server",
      count: 12,
      closedCount: 4,
      heavyCommentIndices: [1],
    },
    {
      repoKey: "charlie/design-system",
      count: 5,
      closedCount: 1,
      heavyCommentIndices: [],
    },
    {
      repoKey: "bob/docs-site",
      count: 2,
      closedCount: 0,
      heavyCommentIndices: [],
    },
    {
      repoKey: "eve/cli-tool",
      count: 3,
      closedCount: 1,
      heavyCommentIndices: [],
    },
  ];

  let totalIssues = 0;
  let totalComments = 0;

  // Track per-repo number counters (shared between issues and PRs)
  const numberCounters: Record<string, number> = {};

  for (const plan of issuePlans) {
    const repoInfo = repoMap[plan.repoKey];
    if (!repoInfo) continue;

    numberCounters[plan.repoKey] = numberCounters[plan.repoKey] || 0;

    for (let i = 0; i < plan.count; i++) {
      numberCounters[plan.repoKey]++;
      const num = numberCounters[plan.repoKey];
      const isClosed = i >= plan.count - plan.closedCount;
      const created = daysAgo(Math.floor(Math.random() * 80) + 1);
      const issueId = randomUUID();
      const authorId = pick(userIds);
      const title = ISSUE_TITLES[i % ISSUE_TITLES.length];
      const body = ISSUE_BODIES[i % ISSUE_BODIES.length];

      await db.insert(issues).values({
        id: issueId,
        number: num,
        repoId: repoInfo.id,
        title,
        body,
        authorId,
        status: isClosed ? "closed" : "open",
        createdAt: created,
        updatedAt: isClosed ? hoursAgo(Math.floor(Math.random() * 200)) : created,
        closedAt: isClosed ? hoursAgo(Math.floor(Math.random() * 200)) : null,
      });
      totalIssues++;

      // Add comments
      const commentCount = plan.heavyCommentIndices.includes(i)
        ? 20 + Math.floor(Math.random() * 10)
        : Math.floor(Math.random() * 4);
      for (let c = 0; c < commentCount; c++) {
        await db.insert(comments).values({
          id: randomUUID(),
          authorId: pick(userIds),
          body: COMMENT_BODIES[c % COMMENT_BODIES.length],
          issueId: issueId,
          createdAt: new Date(created.getTime() + (c + 1) * 3_600_000),
          updatedAt: new Date(created.getTime() + (c + 1) * 3_600_000),
        });
        totalComments++;
      }
    }
  }
  console.log(`  Created ${totalIssues} issues with ${totalComments} comments\n`);

  // -----------------------------------------------------------------------
  // 4. Create pull requests
  // -----------------------------------------------------------------------
  console.log("🔀 Creating pull requests...");

  interface PRPlan {
    repoKey: string;
    openCount: number;
    closedCount: number;
    mergedCount: number;
    heavyCommentIndices: number[];
  }

  const prPlans: PRPlan[] = [
    {
      repoKey: "alice/mega-app",
      openCount: 8,
      closedCount: 5,
      mergedCount: 7,
      heavyCommentIndices: [0, 3],
    },
    {
      repoKey: "bob/api-server",
      openCount: 3,
      closedCount: 2,
      mergedCount: 3,
      heavyCommentIndices: [1],
    },
    {
      repoKey: "charlie/design-system",
      openCount: 2,
      closedCount: 0,
      mergedCount: 1,
      heavyCommentIndices: [],
    },
    {
      repoKey: "eve/cli-tool",
      openCount: 1,
      closedCount: 0,
      mergedCount: 1,
      heavyCommentIndices: [],
    },
  ];

  let totalPRs = 0;
  let totalPRComments = 0;

  for (const plan of prPlans) {
    const repoInfo = repoMap[plan.repoKey];
    if (!repoInfo) continue;

    numberCounters[plan.repoKey] = numberCounters[plan.repoKey] || 0;

    const total = plan.openCount + plan.closedCount + plan.mergedCount;
    const allBranches = ["main", ...repoInfo.branches];

    for (let i = 0; i < total; i++) {
      numberCounters[plan.repoKey]++;
      const num = numberCounters[plan.repoKey];

      let status: "open" | "closed" | "merged";
      if (i < plan.openCount) status = "open";
      else if (i < plan.openCount + plan.closedCount) status = "closed";
      else status = "merged";

      const created = daysAgo(Math.floor(Math.random() * 70) + 1);
      const prId = randomUUID();
      const authorId = pick(userIds);
      const title = PR_TITLES[i % PR_TITLES.length];
      const body = i % 3 === 0 ? ISSUE_BODIES[i % ISSUE_BODIES.length] : null;

      // Pick source/target branches
      const sourceBranch =
        allBranches.length > 1
          ? allBranches[(i % (allBranches.length - 1)) + 1]
          : "feature/branch-" + i;
      const targetBranch = "main";

      await db.insert(pullRequests).values({
        id: prId,
        number: num,
        repoId: repoInfo.id,
        title,
        body,
        authorId,
        sourceBranch,
        targetBranch,
        status,
        createdAt: created,
        updatedAt: status !== "open" ? hoursAgo(Math.floor(Math.random() * 100)) : created,
        mergedAt: status === "merged" ? hoursAgo(Math.floor(Math.random() * 200)) : null,
        mergedById: status === "merged" ? pick(userIds) : null,
      });
      totalPRs++;

      // Add comments
      const commentCount = plan.heavyCommentIndices.includes(i)
        ? 15 + Math.floor(Math.random() * 10)
        : Math.floor(Math.random() * 5);
      for (let c = 0; c < commentCount; c++) {
        await db.insert(comments).values({
          id: randomUUID(),
          authorId: pick(userIds),
          body: COMMENT_BODIES[c % COMMENT_BODIES.length],
          pullRequestId: prId,
          createdAt: new Date(created.getTime() + (c + 1) * 3_600_000),
          updatedAt: new Date(created.getTime() + (c + 1) * 3_600_000),
        });
        totalPRComments++;
      }
    }
  }
  console.log(`  Created ${totalPRs} pull requests with ${totalPRComments} comments\n`);

  console.log("✅ Seed complete!");
  console.log(
    `   ${userDefs.length} users, ${repoDefs.length} repos, ${totalIssues} issues, ${totalPRs} PRs, ${totalComments + totalPRComments} comments`,
  );
  console.log("\n   Login as any user with password: password123");
}

// ---------------------------------------------------------------------------
// Build nested git tree from flat file map
// ---------------------------------------------------------------------------

function buildTree(repoPath: string, files: Record<string, string>): string {
  // Group files by top-level directory
  const dirs: Record<string, Record<string, string>> = {};
  const rootFiles: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    const slash = path.indexOf("/");
    if (slash === -1) {
      rootFiles[path] = content;
    } else {
      const dir = path.substring(0, slash);
      const rest = path.substring(slash + 1);
      if (!dirs[dir]) dirs[dir] = {};
      dirs[dir][rest] = content;
    }
  }

  const entries: [string, string, string, string][] = [];

  // Add files
  for (const [name, content] of Object.entries(rootFiles)) {
    const blobHash = makeBlob(repoPath, content);
    entries.push(["100644", "blob", blobHash, name]);
  }

  // Add subdirectories (recursive)
  for (const [dir, subFiles] of Object.entries(dirs)) {
    const subTreeHash = buildTree(repoPath, subFiles);
    entries.push(["040000", "tree", subTreeHash, dir]);
  }

  return makeTree(repoPath, entries);
}

function generateCommitMessages(count: number): string[] {
  const templates = [
    "Initial commit",
    "feat: add project structure and configuration",
    "feat: implement user model and authentication",
    "feat: add API routes for CRUD operations",
    "fix: resolve database connection timeout",
    "refactor: extract validation logic into utilities",
    "feat: add test suite with initial coverage",
    "fix: correct pagination offset calculation",
    "chore: update dependencies",
    "feat: implement error handling middleware",
    "docs: add API reference documentation",
    "feat: add rate limiting to auth endpoints",
    "fix: handle edge case in search query parsing",
    "refactor: move business logic to service layer",
    "feat: implement WebSocket support for real-time updates",
    "fix: memory leak in connection pool",
    "chore: configure CI pipeline",
    "feat: add email notification service",
    "fix: correct timezone handling in timestamps",
    "feat: implement repository search with indexing",
    "refactor: simplify route handler chain",
    "fix: resolve race condition in concurrent writes",
    "docs: update getting started guide",
    "feat: add CSV export functionality",
    "fix: handle special characters in user input",
    "chore: update TypeScript to v5.4",
    "feat: implement branch protection rules",
    "fix: correct diff calculation for renamed files",
    "refactor: consolidate error types",
    "feat: add admin dashboard endpoints",
    "fix: resolve CORS issue with preflight requests",
    "docs: add deployment guide",
    "feat: implement webhook delivery system",
  ];
  return templates.slice(0, count);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
