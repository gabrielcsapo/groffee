import { CopyButton } from "./copy-button.tsx";
import { DocsSidebar, type SidebarGroup, type SidebarMethod } from "./docs-sidebar.tsx";

/** Helper — the same slug `Endpoint` (below) generates from method+path,
 * extracted so the rail and the section can stay in sync without a
 * separate id table. */
function slug(method: string, path: string): string {
  return `${method.toLowerCase()}-${path}`
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function ep(method: SidebarMethod, path: string) {
  return { method, path, slug: slug(method, path) };
}

const DOCS_NAV: SidebarGroup[] = [
  {
    kind: "links",
    title: "overview",
    links: [
      { href: "#overview", label: "introduction" },
      { href: "#authentication", label: "authentication" },
    ],
  },
  {
    kind: "endpoints",
    title: "health",
    sectionHref: "#health",
    endpoints: [ep("GET", "/api/health")],
  },
  {
    kind: "endpoints",
    title: "auth",
    sectionHref: "#auth",
    endpoints: [
      ep("POST", "/api/auth/register"),
      ep("POST", "/api/auth/login"),
      ep("POST", "/api/auth/logout"),
      ep("GET", "/api/auth/me"),
    ],
  },
  {
    kind: "endpoints",
    title: "ssh keys",
    sectionHref: "#ssh-keys",
    endpoints: [
      ep("GET", "/api/user/ssh-keys"),
      ep("POST", "/api/user/ssh-keys"),
      ep("DELETE", "/api/user/ssh-keys/:id"),
    ],
  },
  {
    kind: "endpoints",
    title: "tokens",
    sectionHref: "#tokens",
    endpoints: [
      ep("GET", "/api/user/tokens"),
      ep("POST", "/api/user/tokens"),
      ep("DELETE", "/api/user/tokens/:id"),
    ],
  },
  {
    kind: "endpoints",
    title: "repositories",
    sectionHref: "#repositories",
    endpoints: [
      ep("GET", "/api/repos"),
      ep("POST", "/api/repos"),
      ep("GET", "/api/repos/:owner"),
      ep("GET", "/api/repos/:owner/:repo"),
      ep("PATCH", "/api/repos/:owner/:repo"),
      ep("DELETE", "/api/repos/:owner/:repo"),
      ep("GET", "/api/repos/:owner/:repo/refs"),
      ep("GET", "/api/repos/:owner/:repo/tree/:ref+"),
      ep("GET", "/api/repos/:owner/:repo/blob/:ref+"),
      ep("GET", "/api/repos/:owner/:repo/commits/:ref"),
      ep("GET", "/api/repos/:owner/:repo/commit/:sha"),
    ],
  },
  {
    kind: "endpoints",
    title: "collaborators",
    sectionHref: "#collaborators",
    endpoints: [
      ep("GET", "/api/repos/:owner/:repo/collaborators"),
      ep("POST", "/api/repos/:owner/:repo/collaborators"),
      ep("DELETE", "/api/repos/:owner/:repo/collaborators/:collabId"),
    ],
  },
  {
    kind: "endpoints",
    title: "issues",
    sectionHref: "#issues",
    endpoints: [
      ep("GET", "/api/repos/:owner/:repo/issues"),
      ep("GET", "/api/repos/:owner/:repo/issues/:number"),
      ep("POST", "/api/repos/:owner/:repo/issues"),
      ep("PATCH", "/api/repos/:owner/:repo/issues/:number"),
      ep("POST", "/api/repos/:owner/:repo/issues/:number/comments"),
    ],
  },
  {
    kind: "endpoints",
    title: "pull requests",
    sectionHref: "#pull-requests",
    endpoints: [
      ep("GET", "/api/repos/:owner/:repo/pulls"),
      ep("GET", "/api/repos/:owner/:repo/pulls/:number"),
      ep("POST", "/api/repos/:owner/:repo/pulls"),
      ep("PATCH", "/api/repos/:owner/:repo/pulls/:number"),
      ep("POST", "/api/repos/:owner/:repo/pulls/:number/merge"),
      ep("POST", "/api/repos/:owner/:repo/pulls/:number/comments"),
    ],
  },
  {
    kind: "endpoints",
    title: "search",
    sectionHref: "#search",
    endpoints: [
      ep("GET", "/api/repos/:owner/:repo/search/code"),
      ep("GET", "/api/search/code"),
      ep("GET", "/api/search/code/languages"),
      ep("GET", "/api/repos/:owner/:repo/search/issues"),
      ep("GET", "/api/repos/:owner/:repo/search/pulls"),
    ],
  },
  {
    kind: "endpoints",
    title: "git protocol",
    sectionHref: "#git-protocol",
    endpoints: [
      ep("GET", "/:owner/:repo.git/info/refs"),
      ep("POST", "/:owner/:repo.git/git-upload-pack"),
      ep("POST", "/:owner/:repo.git/git-receive-pack"),
    ],
  },
  {
    kind: "endpoints",
    title: "git lfs",
    sectionHref: "#git-lfs",
    endpoints: [
      ep("POST", "/:owner/:repo/info/lfs/objects/batch"),
      ep("PUT", "/:owner/:repo/info/lfs/objects/:oid"),
      ep("GET", "/:owner/:repo/info/lfs/objects/:oid"),
      ep("POST", "/:owner/:repo/info/lfs/verify"),
    ],
  },
  {
    kind: "links",
    title: "reference",
    links: [
      { href: "#errors", label: "error codes" },
      { href: "#pagination", label: "pagination" },
      { href: "#versioning", label: "versioning" },
    ],
  },
];

export function ApiDocs() {
  return (
    <div className="flex gap-10 mt-4 text-base leading-relaxed">
      {/* Main content — sits on the left so the eye reads content first,
       * with the endpoint index as a secondary on-this-page rail on the
       * right (Stripe / Linear / Tailwind-docs pattern). The content
       * column gets `max-w-[760px]` to keep prose lines comfortable. */}
      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-[760px]">
        {/* Intro */}
        <section id="overview" className="mb-10">
          <h1 className="font-editorial font-black text-5xl text-text-primary lowercase tracking-tight mb-3">
            api docs
          </h1>
          <p className="text-text-secondary text-base mb-4">
            Groffee exposes a JSON REST API for managing repositories, issues, pull requests, and
            more. All endpoints are prefixed with <Code>/api</Code> and return JSON unless otherwise
            noted.
          </p>
          <div className="card p-4 text-sm space-y-2">
            <p>
              <span className="font-medium">Base URL:</span> <Code>/api</Code>
            </p>
            <p>
              <span className="font-medium">Content-Type:</span> <Code>application/json</Code>
            </p>
            <p>
              <span className="font-medium">Error format:</span>{" "}
              <Code>{'{ "error": "message" }'}</Code> with appropriate HTTP status code
            </p>
          </div>
        </section>

        <section id="authentication" className="mb-10">
          <h2 className="font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight mb-3">
            authentication
          </h2>
          <p className="text-text-secondary mb-3">
            Authentication is cookie-based for browser sessions or token-based for API access. Call{" "}
            <Code>POST /api/auth/login</Code> to obtain a session cookie, or use a personal access
            token via HTTP Basic auth (<Code>Authorization: Basic base64(username:token)</Code>).
            Tokens are also used for Git HTTP operations.
          </p>
          <div className="card p-4 text-sm">
            <p className="font-medium mb-1">Auth levels used in this documentation:</p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <AuthBadge level="required" /> — Request fails with <Code>401</Code> without a valid
                session
              </li>
              <li>
                <AuthBadge level="optional" /> — Works without auth but may return fewer results
              </li>
              <li>
                <AuthBadge level="none" /> — No authentication needed
              </li>
            </ul>
          </div>
        </section>

        {/* Health */}
        <SectionHeader id="health" title="Health" />

        <Endpoint
          method="GET"
          path="/api/health"
          auth="none"
          description="Check if the server is running. Returns 503 when degraded."
          response={{
            status: "ok | degraded",
            uptime: "number (ms)",
            database: "connected | error",
            dataDirectory: "exists | missing",
            memory: {
              rss: "number (MB)",
              heapUsed: "number (MB)",
              heapTotal: "number (MB)",
            },
          }}
          notes='Returns HTTP 200 when status is "ok" and HTTP 503 when "degraded" (database error or missing data directory).'
        />

        {/* Auth */}
        <SectionHeader id="auth" title="Auth" />

        <Endpoint
          method="POST"
          path="/api/auth/register"
          auth="none"
          description="Create a new user account and start a session."
          body={{
            username: "string",
            email: "string",
            password: "string (min 8 chars)",
          }}
          response={{
            user: { id: "string", username: "string", email: "string" },
          }}
          notes="Sets a httpOnly session cookie. Returns 409 if username or email already exists."
        />

        <Endpoint
          method="POST"
          path="/api/auth/login"
          auth="none"
          description="Authenticate with username and password."
          body={{
            username: "string",
            password: "string",
          }}
          response={{
            user: { id: "string", username: "string", email: "string" },
          }}
          notes="Sets a httpOnly session cookie. Returns 401 on invalid credentials."
        />

        <Endpoint
          method="POST"
          path="/api/auth/logout"
          auth="none"
          description="End the current session."
          response={{ ok: true }}
          notes="Clears the session cookie."
        />

        <Endpoint
          method="GET"
          path="/api/auth/me"
          auth="optional"
          description="Get the currently authenticated user."
          response={{
            user: {
              id: "string",
              username: "string",
              email: "string",
              displayName: "string | null",
              bio: "string | null",
            },
          }}
          notes="Returns { user: null } if not authenticated."
        />

        {/* SSH Keys */}
        <SectionHeader id="ssh-keys" title="SSH Keys" />

        <Endpoint
          method="GET"
          path="/api/user/ssh-keys"
          auth="required"
          description="List the authenticated user's SSH keys."
          response={{
            keys: [
              {
                id: "string",
                title: "string",
                fingerprint: "string",
                createdAt: "datetime",
              },
            ],
          }}
        />

        <Endpoint
          method="POST"
          path="/api/user/ssh-keys"
          auth="required"
          description="Add a new SSH public key."
          body={{
            title: "string (required)",
            publicKey: "string (required, OpenSSH format)",
          }}
          response={{
            key: {
              id: "string",
              title: "string",
              fingerprint: "string",
              createdAt: "datetime",
            },
          }}
          notes="Returns 400 if the key format is invalid. Returns 409 if the key fingerprint is already registered."
        />

        <Endpoint
          method="DELETE"
          path="/api/user/ssh-keys/:id"
          auth="required"
          description="Delete an SSH key."
          pathParams={[{ name: "id", description: "SSH key ID" }]}
          response={{ deleted: true }}
          notes="Returns 404 if the key does not exist or does not belong to the authenticated user."
        />

        {/* Personal Access Tokens */}
        <SectionHeader id="tokens" title="Personal Access Tokens" />

        <Endpoint
          method="GET"
          path="/api/user/tokens"
          auth="required"
          description="List the authenticated user's personal access tokens."
          response={{
            tokens: [
              {
                id: "string",
                name: "string",
                tokenPrefix: "groffee_XXXXXXXX",
                scopes: ["repo", "user"],
                expiresAt: "datetime | null",
                lastUsedAt: "datetime | null",
                createdAt: "datetime",
              },
            ],
          }}
          notes="Token values are never returned after creation. Only the prefix is stored for identification."
        />

        <Endpoint
          method="POST"
          path="/api/user/tokens"
          auth="required"
          description="Create a new personal access token."
          body={{
            name: "string (required)",
            scopes: '["repo", "read:repo", "user", "audit"]',
            expiresAt: "datetime (optional)",
          }}
          response={{
            token: {
              id: "string",
              name: "string",
              tokenPrefix: "groffee_XXXXXXXX",
              scopes: ["repo"],
              expiresAt: "datetime | null",
              createdAt: "datetime",
            },
            plainToken: "groffee_... (only returned once!)",
          }}
          notes='The plainToken is only returned in this response — store it securely. Valid scopes: "repo" (read/write repos), "read:repo" (read-only), "user" (profile access), "audit" (read audit logs).'
        />

        <Endpoint
          method="DELETE"
          path="/api/user/tokens/:id"
          auth="required"
          description="Revoke a personal access token."
          pathParams={[{ name: "id", description: "Token ID" }]}
          response={{ deleted: true }}
          notes="Returns 404 if the token does not exist or does not belong to the authenticated user."
        />

        {/* Repositories */}
        <SectionHeader id="repositories" title="Repositories" />

        <Endpoint
          method="GET"
          path="/api/repos"
          auth="optional"
          description="List repositories. Returns public repos, plus your own private repos if authenticated."
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query for repository names",
            },
            {
              name: "limit",
              type: "number",
              description: "Results per page (default: 30, max: 100)",
            },
            {
              name: "offset",
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          ]}
          response={{
            repositories: [
              {
                id: "string",
                name: "string",
                description: "string | null",
                isPublic: true,
                ownerId: "string",
                owner: "string",
                updatedAt: "datetime",
                createdAt: "datetime",
              },
            ],
          }}
        />

        <Endpoint
          method="POST"
          path="/api/repos"
          auth="required"
          description="Create a new repository."
          body={{
            name: "string (matches /^[a-zA-Z0-9._-]+$/)",
            description: "string (optional)",
            isPublic: "boolean (default: true)",
          }}
          response={{
            repository: {
              id: "string",
              name: "string",
              description: "string | null",
              isPublic: true,
              owner: "string",
            },
          }}
          notes="Creates a bare git repository on disk. Returns 409 if name already taken for this owner."
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner"
          auth="optional"
          description="List repositories for a user."
          pathParams={[{ name: "owner", description: "Username" }]}
          response={{
            repositories: ["Array<Repository>"],
          }}
          notes="If authenticated as the owner, returns all repos including private. Otherwise only public."
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo"
          auth="optional"
          description="Get repository details."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          response={{
            repository: {
              id: "string",
              name: "string",
              description: "string | null",
              isPublic: true,
              ownerId: "string",
              owner: "string",
              defaultBranch: "string",
              updatedAt: "datetime",
              createdAt: "datetime",
            },
          }}
          notes="Returns 404 if the repo is private and you are not the owner."
        />

        <Endpoint
          method="PATCH"
          path="/api/repos/:owner/:repo"
          auth="required"
          description="Update repository settings. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          body={{
            description: "string (optional)",
            isPublic: "boolean (optional)",
            defaultBranch: "string (optional)",
          }}
          response={{
            repository: { "...": "updated fields" },
          }}
          notes="Returns 403 if you are not the owner."
        />

        <Endpoint
          method="DELETE"
          path="/api/repos/:owner/:repo"
          auth="required"
          description="Delete a repository. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          response={{ deleted: true }}
          notes="Permanently deletes the database record and the bare git repository from disk. Returns 403 if not owner."
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/refs"
          auth="optional"
          description="List all branches and tags."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          response={{
            refs: [{ name: "string", oid: "string", type: "branch | tag" }],
            defaultBranch: "string",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/tree/:ref+"
          auth="optional"
          description="List directory contents at a given ref and path."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            {
              name: "ref",
              description: 'Branch/tag, optionally followed by path (e.g. "main/src/lib")',
            },
          ]}
          response={{
            entries: [
              {
                type: "blob | tree",
                name: "string",
                oid: "string",
                mode: "string",
              },
            ],
            ref: "string",
            path: "string",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/blob/:ref+"
          auth="optional"
          description="Get file contents at a given ref and path."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            {
              name: "ref",
              description: 'Branch/tag followed by file path (e.g. "main/README.md")',
            },
          ]}
          response={{
            content: "string (UTF-8 text)",
            oid: "string",
            ref: "string",
            path: "string",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/commits/:ref"
          auth="optional"
          description="List commits for a branch or tag."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "ref", description: "Branch or tag name" },
          ]}
          queryParams={[
            {
              name: "limit",
              type: "number",
              description: "Max commits to return (default: 30)",
            },
          ]}
          response={{
            commits: [
              {
                oid: "string",
                author: "string",
                email: "string",
                date: "datetime",
                message: "string",
              },
            ],
            ref: "string",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/commit/:sha"
          auth="optional"
          description="Get a single commit with its diff."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "sha", description: "Full commit SHA" },
          ]}
          response={{
            commit: {
              oid: "string",
              author: "string",
              email: "string",
              date: "datetime",
              message: "string",
              parents: ["string"],
            },
            diff: "object | null",
          }}
          notes="Diff is null for the root (initial) commit."
        />

        {/* Collaborators */}
        <SectionHeader id="collaborators" title="Collaborators" />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/collaborators"
          auth="required"
          description="List collaborators for a repository. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          response={{
            collaborators: [
              {
                id: "string",
                userId: "string",
                username: "string",
                permission: "read | write | admin",
                createdAt: "datetime",
              },
            ],
          }}
          notes="Returns 403 if you are not the repo owner."
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/collaborators"
          auth="required"
          description="Add a collaborator to a repository. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          body={{
            username: "string (required)",
            permission: '"read", "write" (default), or "admin"',
          }}
          response={{
            collaborator: {
              id: "string",
              username: "string",
              permission: "string",
              createdAt: "datetime",
            },
          }}
          notes="Returns 400 if you try to add the owner as a collaborator. Returns 409 if the user is already a collaborator."
        />

        <Endpoint
          method="DELETE"
          path="/api/repos/:owner/:repo/collaborators/:collabId"
          auth="required"
          description="Remove a collaborator from a repository. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "collabId", description: "Collaborator record ID" },
          ]}
          response={{ deleted: true }}
          notes="Returns 403 if not the repo owner. Returns 404 if the collaborator record does not exist."
        />

        {/* Issues */}
        <SectionHeader id="issues" title="Issues" />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/issues"
          auth="optional"
          description="List issues for a repository."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          queryParams={[
            {
              name: "status",
              type: "string",
              description: '"open" (default) or "closed"',
            },
          ]}
          response={{
            issues: [
              {
                id: "string",
                number: 1,
                title: "string",
                body: "string | null",
                status: "open | closed",
                author: "string",
                createdAt: "datetime",
                updatedAt: "datetime",
              },
            ],
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/issues/:number"
          auth="optional"
          description="Get a single issue with its comments."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "Issue number" },
          ]}
          response={{
            issue: {
              id: "string",
              number: 1,
              title: "string",
              body: "string | null",
              status: "open | closed",
              author: "string",
              createdAt: "datetime",
              updatedAt: "datetime",
              closedAt: "datetime | null",
            },
            comments: [
              {
                id: "string",
                body: "string",
                author: "string",
                createdAt: "datetime",
              },
            ],
          }}
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/issues"
          auth="required"
          description="Create a new issue."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          body={{
            title: "string (required)",
            body: "string (optional)",
          }}
          response={{
            issue: {
              id: "string",
              number: 1,
              title: "string",
              author: "string",
            },
          }}
          notes="Issue number auto-increments (shared counter with pull requests)."
        />

        <Endpoint
          method="PATCH"
          path="/api/repos/:owner/:repo/issues/:number"
          auth="required"
          description="Update an issue."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "Issue number" },
          ]}
          body={{
            title: "string (optional)",
            body: "string (optional)",
            status: '"open" or "closed" (optional)',
          }}
          response={{
            issue: { "...": "updated fields" },
          }}
          notes='Setting status to "closed" records the closedAt timestamp.'
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/issues/:number/comments"
          auth="required"
          description="Add a comment to an issue."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "Issue number" },
          ]}
          body={{
            body: "string (required, non-empty)",
          }}
          response={{
            comment: {
              id: "string",
              body: "string",
              author: "string",
              createdAt: "datetime",
            },
          }}
        />

        {/* Pull Requests */}
        <SectionHeader id="pull-requests" title="Pull Requests" />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/pulls"
          auth="optional"
          description="List pull requests for a repository."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          queryParams={[
            {
              name: "status",
              type: "string",
              description: '"open" (default), "closed", or "merged"',
            },
          ]}
          response={{
            pullRequests: [
              {
                id: "string",
                number: 1,
                title: "string",
                body: "string | null",
                status: "open | closed | merged",
                sourceBranch: "string",
                targetBranch: "string",
                author: "string",
                createdAt: "datetime",
                updatedAt: "datetime",
              },
            ],
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/pulls/:number"
          auth="optional"
          description="Get a single pull request with diff and comments."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "PR number" },
          ]}
          response={{
            pullRequest: {
              id: "string",
              number: 1,
              title: "string",
              body: "string | null",
              status: "open | closed | merged",
              sourceBranch: "string",
              targetBranch: "string",
              author: "string",
              mergedBy: "string | null",
              mergedAt: "datetime | null",
              createdAt: "datetime",
            },
            diff: "object | null",
            comments: [
              {
                id: "string",
                body: "string",
                author: "string",
                createdAt: "datetime",
              },
            ],
          }}
          notes="Diff is computed from the merge-base of source and target branches."
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/pulls"
          auth="required"
          description="Create a new pull request."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          body={{
            title: "string (required)",
            body: "string (optional)",
            sourceBranch: "string (required)",
            targetBranch: "string (optional, defaults to repo default branch)",
          }}
          response={{
            pullRequest: {
              id: "string",
              number: 1,
              title: "string",
              author: "string",
            },
          }}
          notes="Both branches must exist and must be different. Number auto-increments (shared with issues)."
        />

        <Endpoint
          method="PATCH"
          path="/api/repos/:owner/:repo/pulls/:number"
          auth="required"
          description="Update a pull request."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "PR number" },
          ]}
          body={{
            title: "string (optional)",
            body: "string (optional)",
            status: '"open" or "closed" (optional)',
          }}
          response={{
            pullRequest: { "...": "updated fields" },
          }}
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/pulls/:number/merge"
          auth="required"
          description="Merge a pull request. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "PR number" },
          ]}
          response={{ merged: true }}
          notes="Performs fast-forward or 3-way merge. Creates a merge commit. Updates PR status to 'merged'. Returns 403 if not repo owner."
        />

        <Endpoint
          method="POST"
          path="/api/repos/:owner/:repo/pulls/:number/comments"
          auth="required"
          description="Add a comment to a pull request."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "number", description: "PR number" },
          ]}
          body={{
            body: "string (required, non-empty)",
          }}
          response={{
            comment: {
              id: "string",
              body: "string",
              author: "string",
              createdAt: "datetime",
            },
          }}
        />

        {/* Search */}
        <SectionHeader id="search" title="Search" />

        <div className="card p-4 text-sm text-text-secondary mb-6 space-y-3">
          <p>
            Search endpoints use SQLite FTS5 full-text search. Queries support the following syntax:
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-secondary border-b border-border-muted">
                <th className="pb-1 pr-4 font-medium">Syntax</th>
                <th className="pb-1 pr-4 font-medium">Description</th>
                <th className="pb-1 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="text-text-primary">
              <SyntaxRow
                syntax={'"exact phrase"'}
                desc="Match exact sequence of words"
                example={'"hello world"'}
              />
              <SyntaxRow
                syntax="word1 word2"
                desc="Implicit AND — both must appear"
                example="react router"
              />
              <SyntaxRow
                syntax="word1 OR word2"
                desc="Match either word"
                example="useState OR useReducer"
              />
              <SyntaxRow
                syntax="NOT word"
                desc="Exclude documents containing word"
                example="router NOT express"
              />
              <SyntaxRow syntax="prefix*" desc="Prefix matching" example="func*" />
              <SyntaxRow
                syntax="(a OR b) AND c"
                desc="Group with parentheses"
                example={'(error OR warning) AND "log"'}
              />
            </tbody>
          </table>
          <p>
            FTS5 uses Porter stemming, so <Code>running</Code> also matches <Code>run</Code>. Code
            search results can be filtered by language/extension using the <Code>ext</Code> query
            parameter.
          </p>
        </div>

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/search/code"
          auth="optional"
          description="Search code within a repository."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query (required)",
            },
            {
              name: "ext",
              type: "string",
              description: 'File extension filter (e.g., "ts", "py")',
            },
            {
              name: "limit",
              type: "number",
              description: "Max results (default: 20, max: 100)",
            },
            {
              name: "offset",
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          ]}
          response={{
            results: [
              {
                file_path: "string",
                blob_oid: "string",
                snippet: "string (HTML with <mark> highlights)",
              },
            ],
            total: "number",
            limit: "number",
            offset: "number",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/search/code"
          auth="optional"
          description="Search code across all public repositories."
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query (required)",
            },
            {
              name: "ext",
              type: "string",
              description: 'File extension filter (e.g., "ts", "py")',
            },
            {
              name: "limit",
              type: "number",
              description: "Max results (default: 20, max: 100)",
            },
            {
              name: "offset",
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          ]}
          response={{
            results: [
              {
                repo_id: "string",
                file_path: "string",
                blob_oid: "string",
                snippet: "string (HTML with <mark> highlights)",
                repo_name: "string",
                repo_owner: "string",
              },
            ],
            total: "number",
            limit: "number",
            offset: "number",
          }}
          notes="Only searches public repositories."
        />

        <Endpoint
          method="GET"
          path="/api/search/code/languages"
          auth="optional"
          description="Get language breakdown for code search results."
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query (required)",
            },
          ]}
          response={{
            languages: [
              {
                ext: "string",
                count: "number",
              },
            ],
          }}
          notes="Returns up to 20 languages sorted by count. Only includes public repositories."
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/search/issues"
          auth="optional"
          description="Search issues within a repository."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query (required)",
            },
            {
              name: "limit",
              type: "number",
              description: "Max results (default: 20, max: 100)",
            },
            {
              name: "offset",
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          ]}
          response={{
            results: [
              {
                issue_id: "string",
                title_snippet: "string (HTML)",
                body_snippet: "string (HTML)",
              },
            ],
            total: "number",
            limit: "number",
            offset: "number",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:repo/search/pulls"
          auth="optional"
          description="Search pull requests within a repository."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
          ]}
          queryParams={[
            {
              name: "q",
              type: "string",
              description: "Search query (required)",
            },
            {
              name: "limit",
              type: "number",
              description: "Max results (default: 20, max: 100)",
            },
            {
              name: "offset",
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          ]}
          response={{
            results: [
              {
                pr_id: "string",
                title_snippet: "string (HTML)",
                body_snippet: "string (HTML)",
              },
            ],
            total: "number",
            limit: "number",
            offset: "number",
          }}
        />

        {/* Git Protocol */}
        <SectionHeader id="git-protocol" title="Git Protocol (Smart HTTP)" />

        <div className="card p-4 text-sm text-text-secondary mb-6 space-y-3">
          <p>
            These endpoints implement Git's Smart HTTP protocol for <Code>git clone</Code>,{" "}
            <Code>git fetch</Code>, and <Code>git push</Code>. They use binary git protocol streams,
            not JSON. You typically interact with these via the <Code>git</Code> CLI rather than
            calling them directly.
          </p>
          <p>
            Groffee also supports <strong>SSH git access</strong> (port 2223). Push operations
            require SSH key authentication — add your public key via{" "}
            <Code>POST /api/user/ssh-keys</Code> or the Settings page.
          </p>
          <div className="border-t border-border-muted pt-3">
            <p className="font-medium text-text-primary mb-1">Git LFS over SSH</p>
            <p>
              LFS over SSH is supported automatically. When pushing via an SSH remote, Groffee
              handles <Code>git-lfs-authenticate</Code> to issue short-lived credentials. Set the{" "}
              <Code>EXTERNAL_URL</Code> environment variable to the public-facing HTTP URL so the
              SSH server can direct the LFS client to the correct endpoint:
            </p>
            <pre className="bg-surface-secondary border border-border-muted rounded p-2 text-xs font-mono mt-2">
              EXTERNAL_URL=https://groffee.example.com
            </pre>
            <p className="mt-2">
              Defaults to <Code>http://localhost:$PORT</Code> if not set.
            </p>
          </div>
        </div>

        <Endpoint
          method="GET"
          path="/:owner/:repo.git/info/refs"
          auth="optional"
          description="Git ref advertisement (discovery)."
          queryParams={[
            {
              name: "service",
              type: "string",
              description: '"git-upload-pack" or "git-receive-pack"',
            },
          ]}
          notes="Returns binary git protocol data. Used automatically by git clone/fetch/push. Public repos allow unauthenticated access; private repos require HTTP Basic auth."
        />

        <Endpoint
          method="POST"
          path="/:owner/:repo.git/git-upload-pack"
          auth="optional"
          description="Git fetch/clone data exchange."
          notes="Binary git protocol. Used by git clone and git fetch. Public repos allow unauthenticated access; private repos require HTTP Basic auth."
        />

        <Endpoint
          method="POST"
          path="/:owner/:repo.git/git-receive-pack"
          auth="required"
          description="Git push data exchange."
          notes="Binary git protocol. Used by git push. Requires HTTP Basic auth — the repo owner or a collaborator with write access. Authenticate with your username and a personal access token."
        />

        {/* Git LFS */}
        <SectionHeader id="git-lfs" title="Git LFS (Large File Storage)" />

        <div className="card p-4 text-sm text-text-secondary mb-6 space-y-3">
          <p>
            These endpoints implement the <strong>Git LFS Batch API</strong> for uploading and
            downloading large files. They use <Code>application/vnd.git-lfs+json</Code> content
            type. You typically interact with these via the <Code>git lfs</Code> CLI rather than
            calling them directly.
          </p>
          <p>
            LFS objects are stored on disk at <Code>{"<DATA_DIR>/lfs-objects/"}</Code> with a
            sharded directory structure based on the SHA-256 OID.
          </p>
        </div>

        <Endpoint
          method="POST"
          path="/:owner/:repo/info/lfs/objects/batch"
          auth="required"
          description="LFS batch API — request upload or download URLs for objects."
          body={{
            operation: '"upload" or "download"',
            transfers: '["basic"]',
            objects: [{ oid: "string (SHA-256, 64 hex chars)", size: "number (bytes)" }],
          }}
          response={{
            transfer: "basic",
            objects: [
              {
                oid: "string",
                size: "number",
                actions: {
                  upload: { href: "string", header: {}, expires_in: 3600 },
                  verify: { href: "string", header: {}, expires_in: 3600 },
                },
              },
            ],
          }}
          notes="Content-Type must be application/vnd.git-lfs+json. Actions returned depend on the operation (upload includes upload+verify, download includes download)."
        />

        <Endpoint
          method="PUT"
          path="/:owner/:repo/info/lfs/objects/:oid"
          auth="required"
          description="Upload an LFS object."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "oid", description: "SHA-256 object ID (64 hex chars)" },
          ]}
          notes="Request body is the raw binary content. The server validates the SHA-256 hash matches the OID."
        />

        <Endpoint
          method="GET"
          path="/:owner/:repo/info/lfs/objects/:oid"
          auth="optional"
          description="Download an LFS object."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "repo", description: "Repository name" },
            { name: "oid", description: "SHA-256 object ID (64 hex chars)" },
          ]}
          notes="Returns binary content with Content-Type: application/octet-stream. Public repos allow unauthenticated download; private repos require auth."
        />

        <Endpoint
          method="POST"
          path="/:owner/:repo/info/lfs/verify"
          auth="required"
          description="Verify an LFS object exists after upload."
          body={{
            oid: "string (SHA-256, 64 hex chars)",
            size: "number (bytes)",
          }}
          notes="Checks both the database record and file on disk. Returns 404 if the object is not found."
        />

        {/* ─── Reference appendix ─── */}

        <SectionHeader id="errors" title="Error codes" />
        <p className="text-text-secondary mb-4 text-sm">
          Errors return a JSON body with an <Code>error</Code> field and the matching HTTP status
          code. The table below covers the codes used across all endpoints; individual endpoints
          document their own additional 409/422 cases.
        </p>
        <div className="card overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr className="text-left text-text-secondary">
                <th className="px-4 py-2 font-medium font-mono text-xs">code</th>
                <th className="px-4 py-2 font-medium font-mono text-xs">meaning</th>
                <th className="px-4 py-2 font-medium font-mono text-xs">when</th>
              </tr>
            </thead>
            <tbody className="text-text-primary">
              {[
                ["400", "bad request", "the body or query params failed validation"],
                ["401", "unauthorized", "no valid session cookie or token was sent"],
                ["403", "forbidden", "you are authenticated but lack permission for this resource"],
                ["404", "not found", "the resource doesn't exist or you can't see it"],
                [
                  "409",
                  "conflict",
                  "the request collides with existing state (e.g. duplicate name)",
                ],
                ["422", "unprocessable", "semantically invalid — see the endpoint for specifics"],
                ["503", "unavailable", "the underlying git or LFS layer is temporarily down"],
              ].map(([code, meaning, when]) => (
                <tr key={code} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{code}</td>
                  <td className="px-4 py-2 font-mono text-text-secondary">{meaning}</td>
                  <td className="px-4 py-2">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SectionHeader id="pagination" title="Pagination" />
        <p className="text-text-secondary mb-4 text-sm">
          List endpoints use opaque cursor pagination. Pass <Code>?cursor=…</Code> from the response
          to fetch the next page; the server stays in control of the ordering so a record inserted
          mid-walk can't be skipped or duplicated.
        </p>
        <div className="card p-4 text-sm mb-2">
          <p className="mb-2">
            <span className="font-medium">Request:</span>{" "}
            <Code>GET /api/repos/:owner/:repo/issues?limit=50&cursor=eyJ0Ijox…</Code>
          </p>
          <p className="text-text-secondary text-xs">
            Default limit: 25. Maximum: 100. Cursors are signed and only valid for a short window —
            don't store them long-term.
          </p>
        </div>
        <p className="text-text-secondary text-sm mb-6">
          Responses always include a top-level <Code>nextCursor</Code> (null when you've reached the
          end) and a <Code>hasMore</Code> boolean for clients that prefer the explicit signal.
        </p>

        <SectionHeader id="versioning" title="Versioning" />
        <p className="text-text-secondary mb-4 text-sm">
          The API is unversioned today. Groffee is self-hosted and you upgrade in lock-step with the
          UI, so an out-of-band v1 → v2 transition would only hurt. Breaking changes are flagged in
          the changelog and held until a major release; additive changes ship anytime.
        </p>
        <p className="text-text-secondary text-sm mb-6">
          Found something wrong here?{" "}
          <a
            href="https://github.com/gabrielcsapo/groffee/blob/main/packages/ui/src/components/api-docs.tsx"
            className="text-text-link hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            edit this page →
          </a>
        </p>
      </div>

      {/* On-this-page rail — sticky on the right. 288px wide, 11px mono
       * rows, scroll-spy, auto-scrolls to keep the active endpoint
       * visible. This is the rail that turns the docs from a flat scroll
       * into a real API browser. */}
      <aside className="hidden lg:block w-72 shrink-0 self-start sticky top-20 max-h-[calc(100vh-5rem)] overflow-y-auto pl-4 border-l border-border-muted">
        <DocsSidebar groups={DOCS_NAV} />
      </aside>
    </div>
  );
}

/* ─── Helper components ─── */

function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="group font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight mt-12 mb-5 pt-5 border-t border-border first:mt-0 first:border-t-0 scroll-mt-20"
    >
      {title}
      {/* Permalink — hover reveals an amber `#` so users can copy section
       * links. Aria-hidden because the surrounding heading already has the
       * id, and the link target is the heading itself. */}
      <a
        href={`#${id}`}
        aria-hidden="true"
        tabIndex={-1}
        className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-accent text-2xl font-mono no-underline hover:underline"
      >
        #
      </a>
    </h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-sm font-mono">{children}</code>
  );
}

function MethodBadge({ method }: { method: string }) {
  const classes: Record<string, string> = {
    GET: "badge-method-get",
    POST: "badge-method-post",
    PATCH: "badge-method-patch",
    DELETE: "badge-method-delete",
  };
  return <span className={`inline-block ${classes[method] || ""}`}>{method}</span>;
}

function AuthBadge({ level }: { level: "required" | "optional" | "none" }) {
  const classes: Record<string, string> = {
    required: "badge-auth-required",
    optional: "badge-auth-optional",
    none: "badge-auth-none",
  };
  const labels: Record<string, string> = {
    required: "Auth Required",
    optional: "Auth Optional",
    none: "No Auth",
  };
  return <span className={`inline-block ${classes[level]}`}>{labels[level]}</span>;
}

interface ParamDef {
  name: string;
  type?: string;
  description: string;
}

/**
 * Generate a stable anchor id from method + path. `GET /api/repos/:owner`
 * → `get-api-repos-owner`. Strips leading slash, replaces every
 * non-alphanumeric run with `-`, trims dashes. */
function endpointSlug(method: string, path: string): string {
  return `${method.toLowerCase()}-${path}`
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function Endpoint({
  method,
  path,
  auth,
  description,
  pathParams,
  queryParams,
  body,
  response,
  notes,
}: {
  method: string;
  path: string;
  auth: "required" | "optional" | "none";
  description: string;
  pathParams?: ParamDef[];
  queryParams?: ParamDef[];
  body?: Record<string, unknown>;
  response?: Record<string, unknown>;
  notes?: string;
}) {
  const slug = endpointSlug(method, path);
  return (
    <div id={slug} className="card mb-4 overflow-hidden scroll-mt-20 group">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-secondary border-b border-border flex-wrap">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-medium text-text-primary">{path}</code>
        {/* Per-endpoint permalink. Hidden until the row is hovered so it
         * doesn't clutter the dense list, but discoverable for anyone who
         * wants to share a deep link. */}
        <a
          href={`#${slug}`}
          aria-label={`Permalink to ${method} ${path}`}
          className="text-accent text-sm font-mono opacity-0 group-hover:opacity-100 transition-opacity no-underline hover:underline"
        >
          #
        </a>
        <div className="flex-1" />
        <AuthBadge level={auth} />
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-text-secondary">{description}</p>

        {pathParams && pathParams.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">Path Parameters</h4>
            <ParamTable params={pathParams} />
          </div>
        )}

        {queryParams && queryParams.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">Query Parameters</h4>
            <ParamTable params={queryParams} />
          </div>
        )}

        {body && (
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">Request Body</h4>
            <JsonBlock value={body} />
          </div>
        )}

        {response && (
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-1">Response</h4>
            <JsonBlock value={response} />
          </div>
        )}

        {notes && (
          <p className="text-xs text-text-secondary border-t border-border-muted pt-2">{notes}</p>
        )}
      </div>
    </div>
  );
}

function ParamTable({ params }: { params: ParamDef[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-text-secondary">
          <th className="pb-1 pr-4 font-medium">Name</th>
          {params.some((p) => p.type) && <th className="pb-1 pr-4 font-medium">Type</th>}
          <th className="pb-1 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p) => (
          <tr key={p.name} className="text-text-primary">
            <td className="py-0.5 pr-4 font-mono">{p.name}</td>
            {params.some((pp) => pp.type) && (
              <td className="py-0.5 pr-4 text-text-secondary">{p.type || "—"}</td>
            )}
            <td className="py-0.5 text-text-secondary">{p.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SyntaxRow({ syntax, desc, example }: { syntax: string; desc: string; example: string }) {
  return (
    <tr>
      <td className="py-1 pr-4 font-mono">
        <Code>{syntax}</Code>
      </td>
      <td className="py-1 pr-4">{desc}</td>
      <td className="py-1 font-mono text-text-secondary">{example}</td>
    </tr>
  );
}

/**
 * Tokenize a serialized JSON string for syntax highlighting. Runs at SSR
 * render time so no client JS is needed and the highlighted output ships
 * in the initial HTML. Cheap regex-based pass — accurate enough for the
 * shape of JSON we emit in docs (keys/strings/numbers/booleans/null).
 */
function highlightJson(json: string): string {
  // Escape HTML entities first so any user-provided key/value text doesn't
  // break out of the rendered block.
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "tk-num";
      if (match.startsWith('"')) {
        cls = match.endsWith(":") || /":\s*$/.test(match) ? "tk-key" : "tk-str";
      } else if (match === "true" || match === "false") {
        cls = "tk-bool";
      } else if (match === "null") {
        cls = "tk-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <pre className="bg-surface-secondary border border-border-muted rounded p-3 pr-16 text-xs font-mono overflow-x-auto whitespace-pre json-block">
        <code dangerouslySetInnerHTML={{ __html: highlightJson(json) }} />
      </pre>
      <CopyButton text={json} />
    </div>
  );
}
