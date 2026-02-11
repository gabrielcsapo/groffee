export default function Docs() {
  return (
    <div className="flex gap-8 mt-4">
      {/* Sidebar */}
      <aside className="hidden lg:block w-56 shrink-0">
        <nav className="sticky top-24 text-sm space-y-4">
          <div>
            <h3 className="font-semibold text-text-primary mb-1">Overview</h3>
            <a href="#overview" className="block text-text-secondary hover:text-text-link py-0.5">
              Introduction
            </a>
            <a
              href="#authentication"
              className="block text-text-secondary hover:text-text-link py-0.5"
            >
              Authentication
            </a>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary mb-1">Endpoints</h3>
            <a href="#health" className="block text-text-secondary hover:text-text-link py-0.5">
              Health
            </a>
            <a href="#auth" className="block text-text-secondary hover:text-text-link py-0.5">
              Auth
            </a>
            <a
              href="#repositories"
              className="block text-text-secondary hover:text-text-link py-0.5"
            >
              Repositories
            </a>
            <a href="#issues" className="block text-text-secondary hover:text-text-link py-0.5">
              Issues
            </a>
            <a
              href="#pull-requests"
              className="block text-text-secondary hover:text-text-link py-0.5"
            >
              Pull Requests
            </a>
            <a
              href="#git-protocol"
              className="block text-text-secondary hover:text-text-link py-0.5"
            >
              Git Protocol
            </a>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Intro */}
        <section id="overview" className="mb-10">
          <h1 className="text-2xl font-bold text-text-primary mb-2">API Documentation</h1>
          <p className="text-text-secondary text-sm mb-4">
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
          <h2 className="text-xl font-bold text-text-primary mb-2">Authentication</h2>
          <p className="text-text-secondary text-sm mb-3">
            Authentication is cookie-based. Call <Code>POST /api/auth/login</Code> or{" "}
            <Code>POST /api/auth/register</Code> to obtain a session cookie. Include credentials in
            subsequent requests.
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
          description="Check if the server is running."
          response={{ status: "ok" }}
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
          path="/api/repos/:owner/:name"
          auth="optional"
          description="Get repository details."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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
          path="/api/repos/:owner/:name"
          auth="required"
          description="Update repository settings. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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
          path="/api/repos/:owner/:name"
          auth="required"
          description="Delete a repository. Must be the repo owner."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
          ]}
          response={{ deleted: true }}
          notes="Permanently deletes the database record and the bare git repository from disk. Returns 403 if not owner."
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:name/refs"
          auth="optional"
          description="List all branches and tags."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
          ]}
          response={{
            refs: [{ name: "string", oid: "string", type: "branch | tag" }],
            defaultBranch: "string",
          }}
        />

        <Endpoint
          method="GET"
          path="/api/repos/:owner/:name/tree/:ref+"
          auth="optional"
          description="List directory contents at a given ref and path."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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
          path="/api/repos/:owner/:name/blob/:ref+"
          auth="optional"
          description="Get file contents at a given ref and path."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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
          path="/api/repos/:owner/:name/commits/:ref"
          auth="optional"
          description="List commits for a branch or tag."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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
          path="/api/repos/:owner/:name/commit/:sha"
          auth="optional"
          description="Get a single commit with its diff."
          pathParams={[
            { name: "owner", description: "Username" },
            { name: "name", description: "Repository name" },
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

        {/* Git Protocol */}
        <SectionHeader id="git-protocol" title="Git Protocol (Smart HTTP)" />

        <div className="card p-4 text-sm text-text-secondary mb-6">
          These endpoints implement Git's Smart HTTP protocol for <Code>git clone</Code>,{" "}
          <Code>git fetch</Code>, and <Code>git push</Code>. They use binary git protocol streams,
          not JSON. You typically interact with these via the <Code>git</Code> CLI rather than
          calling them directly.
        </div>

        <Endpoint
          method="GET"
          path="/:owner/:repo.git/info/refs"
          auth="none"
          description="Git ref advertisement (discovery)."
          queryParams={[
            {
              name: "service",
              type: "string",
              description: '"git-upload-pack" or "git-receive-pack"',
            },
          ]}
          notes="Returns binary git protocol data. Used automatically by git clone/fetch/push."
        />

        <Endpoint
          method="POST"
          path="/:owner/:repo.git/git-upload-pack"
          auth="none"
          description="Git fetch/clone data exchange."
          notes="Binary git protocol. Used by git clone and git fetch."
        />

        <Endpoint
          method="POST"
          path="/:owner/:repo.git/git-receive-pack"
          auth="none"
          description="Git push data exchange."
          notes="Binary git protocol. Used by git push. Auth for push is planned but not yet implemented."
        />
      </div>
    </div>
  );
}

/* ─── Helper components ─── */

function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="text-xl font-bold text-text-primary mt-10 mb-4 pt-4 border-t border-border first:mt-0 first:border-t-0 scroll-mt-20"
    >
      {title}
    </h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-surface-secondary border border-border-muted rounded text-xs font-mono">
      {children}
    </code>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-100 text-blue-800 border-blue-200",
    POST: "bg-green-100 text-green-800 border-green-200",
    PATCH: "bg-yellow-100 text-yellow-800 border-yellow-200",
    DELETE: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span
      className={`inline-block text-xs font-bold font-mono px-2 py-0.5 rounded border ${colors[method] || ""}`}
    >
      {method}
    </span>
  );
}

function AuthBadge({ level }: { level: "required" | "optional" | "none" }) {
  const styles: Record<string, string> = {
    required: "bg-red-50 text-red-700 border-red-200",
    optional: "bg-yellow-50 text-yellow-700 border-yellow-200",
    none: "bg-gray-50 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    required: "Auth Required",
    optional: "Auth Optional",
    none: "No Auth",
  };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded border ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

interface ParamDef {
  name: string;
  type?: string;
  description: string;
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
  return (
    <div className="card mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-secondary border-b border-border flex-wrap">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-medium text-text-primary">{path}</code>
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-surface-secondary border border-border-muted rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
