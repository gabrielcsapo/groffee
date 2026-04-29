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

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

ENV EXTERNAL_URL=""

EXPOSE 3000
EXPOSE 2223

CMD ["pnpm", "start"]
