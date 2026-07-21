FROM node:22-slim

# Install git, git-lfs, and Docker CLI (for CI/CD pipeline container execution)
# At runtime, mount the host Docker socket: -v /var/run/docker.sock:/var/run/docker.sock
RUN apt-get update \
    && apt-get install -y git git-lfs ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global safe.directory '*' \
    && git lfs install --system

# Pinned to match the `packageManager` field in package.json. When you bump
# pnpm locally, update both here and there together.
RUN corepack enable

WORKDIR /app

# Dep-install layer: copy everything pnpm needs to resolve and verify the
# lockfile, but NOT the source. Lets `pnpm install` cache cleanly between
# rebuilds — this layer only invalidates when a manifest or lockfile changes.
# Required pieces:
#   - pnpm-lock.yaml          : the lockfile we install --frozen against
#   - pnpm-workspace.yaml     : tells pnpm about packages/* + holds policy
#                               settings (allowBuilds, minimumReleaseAgeExclude)
#   - .npmrc                  : npm-compatible settings (minimum-release-age,
#                               ignore-build-scripts, etc.)
#   - root + each workspace package.json : needed for the dependency graph
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/db/package.json   ./packages/db/
COPY packages/docs/package.json ./packages/docs/
COPY packages/git/package.json  ./packages/git/
COPY packages/ui/package.json   ./packages/ui/
COPY packages/web/package.json  ./packages/web/
RUN pnpm install --frozen-lockfile

COPY . .
ENV EXTERNAL_URL=""
ENV NODE_ENV="production"

EXPOSE 3000
EXPOSE 2223

CMD ["pnpm", "start"]
