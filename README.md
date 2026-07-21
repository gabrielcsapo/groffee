# groffee

> Git, locally roasted.

Groffee is an opinionated, self-hosted Git forge for individuals and small teams. It combines
repository hosting, review, automation, and day-to-day administration in one warm, compact UI—
without depending on a hosted control plane.

## Features

- Smart HTTP and SSH repository hosting, including Git LFS
- Repository browsing, syntax highlighting, history, diffs, blame, and browser-based file editing
- Issues and pull requests with Markdown, threaded discussion, inline review, and merge/squash flows
- SQLite FTS5 search across repositories, code, issues, and pull requests
- Built-in pipelines with matrices, encrypted secrets, live logs, annotations, artifacts, and reruns
- Static Pages deployment from pipeline jobs
- Password, SSH key, deploy key, and personal access token authentication
- Invitations, collaborators, notifications, audit history, and repository controls
- Admin dashboard, user management, structured logs, and host-level maintenance commands

## Why Groffee

Groffee is designed for the homelab and the small private forge: straightforward storage,
understandable operations, and a UI with less ceremony than an enterprise Git host. Data lives in
SQLite and ordinary directories, repositories remain standard bare Git repositories, and the
application ships as one Node.js service plus an SSH listener.

## Requirements

- Node.js 22+
- pnpm 11.1.3 (declared by `packageManager` and activated through Corepack)
- git
- git-lfs

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server (port 3000)
pnpm dev
```

The first registered user is automatically promoted to admin.

## Admin CLI

For host-level operations (password resets, recomputing storage, rebuilding the search index) use the admin CLI:

```bash
pnpm admin reset-password <username> <new-password>
pnpm admin make-admin <username>
pnpm admin disable-user <username> [--enable]
pnpm admin recompute-storage
pnpm admin reindex-search [<owner/repo>]
```

Every CLI action is recorded in the audit log under `admin.cli.*` (attributed to the `system` user when present, otherwise the first admin).

## Git LFS

Groffee supports the Git LFS Batch API for storing large files outside the Git repository.

### Setup

Ensure `git-lfs` is installed on both the server and client:

```bash
# macOS
brew install git-lfs

# Debian/Ubuntu
apt-get install git-lfs
```

### Usage

```bash
# In your repository, track large files by extension
git lfs track "*.bin"
git lfs track "*.psd"
git lfs track "*.zip"

# Commit and push as normal
git add .gitattributes
git add large-file.bin
git commit -m "add large file"
git push origin main
```

LFS objects are stored on disk at `data/lfs-objects/` using content-addressable storage. Authentication uses the same credentials as regular git operations (password or personal access token via HTTP Basic Auth).

LFS over SSH is also supported. When pushing via an SSH remote, Groffee handles `git-lfs-authenticate` to issue short-lived tokens automatically. This requires the `EXTERNAL_URL` environment variable so the SSH server knows the HTTP endpoint to advertise to the LFS client:

```bash
EXTERNAL_URL=https://groffee.example.com pnpm start
```

### Endpoints

| Method | Path                                       | Description                             |
| ------ | ------------------------------------------ | --------------------------------------- |
| POST   | `/:owner/:repo.git/info/lfs/objects/batch` | Batch API (negotiate uploads/downloads) |
| PUT    | `/:owner/:repo.git/info/lfs/objects/:oid`  | Upload an LFS object                    |
| GET    | `/:owner/:repo.git/info/lfs/objects/:oid`  | Download an LFS object                  |
| POST   | `/:owner/:repo.git/info/lfs/verify`        | Verify an upload completed              |

## Environment Variables

See the [configuration guide](packages/docs/src/pages/configuration.mdx) for the complete environment reference, including Docker runner limits and Pages settings.

## Docker

```bash
docker build -t groffee .
docker run -p 3000:3000 -p 2223:2223 \
  -e EXTERNAL_URL=https://groffee.example.com \
  -e NODE_ENV=production \
  -e DOCKER_HOST_DATA_DIR=/var/lib/docker/volumes/groffee-data/_data \
  -v groffee-data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock groffee
```

Production CI requires a dedicated `groffee-ci` Docker network with restricted egress. See the configuration guide before enabling repository pipelines.

Pages publishing is disabled per repository by default, including for public repositories. An
owner must explicitly enable it in repository settings. Published Pages sites are public even when
their source repository is private.

## Project Structure

```
packages/
  web/    React 19 + Hono + Vite (frontend + API + SSH server)
  db/     Drizzle ORM + SQLite (schema, migrations, queries)
  git/    Git operations (isomorphic-git reads, git CLI for protocol)
data/
  groffee.sqlite       Database
  repositories/        Bare git repositories
  lfs-objects/         Git LFS object storage
```
