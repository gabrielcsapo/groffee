# groffee

> A self-hosted Git platform built with Node.js

## Features

- Repository hosting with Smart HTTP and SSH push/pull
- Git LFS (Large File Storage) support
- Pull requests and issues
- Code search (FTS5)
- SSH key and personal access token authentication
- Admin portal with structured logging

## Requirements

- Node.js 22+
- pnpm 10+
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

| Variable       | Default                  | Description                                           |
| -------------- | ------------------------ | ----------------------------------------------------- |
| `PORT`         | `3000`                   | HTTP server port                                      |
| `SSH_PORT`     | `2223`                   | SSH server port                                       |
| `DATA_DIR`     | `./data`                 | Directory for database, repositories, and LFS objects |
| `EXTERNAL_URL` | `http://localhost:$PORT` | Public-facing URL (required for Git LFS over SSH)     |

## Docker

```bash
docker build -t groffee .
docker run -p 3000:3000 -p 2223:2223 \
  -e EXTERNAL_URL=https://groffee.example.com \
  -v groffee-data:/app/data groffee
```

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
