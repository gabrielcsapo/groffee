FROM node:22-slim

RUN apt-get update && apt-get install -y git git-lfs && rm -rf /var/lib/apt/lists/* \
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
