import ssh2 from "ssh2";
import type { AuthContext, Connection, Session } from "ssh2";

import type { Duplex } from "node:stream";
type Channel = Duplex & {
  exit(code: number): void;
  end(): void;
  write(data: string | Buffer): boolean;
  stderr: { write(data: Buffer): void };
};

const { Server: SshServer } = ssh2;
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { timingSafeEqual, createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";

import { db, sshKeys, users, repositories } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { canPush, canRead } from "./lib/permissions.js";
import { createEphemeralLfsToken } from "./lib/git-auth.js";
import { snapshotRefs } from "@groffee/git";
import { triggerIncrementalIndex } from "./lib/indexer.js";
import { logger } from "./lib/logger.js";
import { logAudit } from "./lib/audit.js";
import path from "node:path";
import { DATA_DIR, EXTERNAL_URL, resolveDiskPath } from "./lib/paths.js";
const SSH_HOST_KEY_PATH = path.resolve(DATA_DIR, "ssh_host_ed25519_key");
const SSH_PORT = parseInt(process.env.SSH_PORT || "2223", 10);

function getOrCreateHostKey(): Buffer {
  if (existsSync(SSH_HOST_KEY_PATH)) {
    logger.info("SSH host key loaded from disk", {
      source: "ssh",
      metadata: { path: SSH_HOST_KEY_PATH },
    });
    return readFileSync(SSH_HOST_KEY_PATH);
  }

  mkdirSync(path.dirname(SSH_HOST_KEY_PATH), { recursive: true });

  // Generate an OpenSSH-format ed25519 key via ssh-keygen
  execFileSync("ssh-keygen", ["-t", "ed25519", "-f", SSH_HOST_KEY_PATH, "-N", "", "-q"]);

  logger.info("SSH host key generated (none existed)", {
    source: "ssh",
    metadata: { path: SSH_HOST_KEY_PATH },
  });

  return readFileSync(SSH_HOST_KEY_PATH);
}

async function findUserByPublicKey(clientKey: {
  algo: string;
  data: Buffer;
}): Promise<{ userId: string; username: string } | null> {
  // Compute fingerprint from client key data (same algorithm as keys.ts)
  const hash = createHash("sha256").update(clientKey.data).digest("base64");
  const fingerprint = `SHA256:${hash.replace(/=+$/, "")}`;

  // Direct lookup by fingerprint (indexed)
  const [stored] = await db
    .select({
      userId: sshKeys.userId,
      publicKey: sshKeys.publicKey,
    })
    .from(sshKeys)
    .where(eq(sshKeys.fingerprint, fingerprint))
    .limit(1);

  if (!stored) return null;

  // Verify full key data matches (defense in depth against hash collisions)
  const parts = stored.publicKey.trim().split(/\s+/);
  if (parts.length >= 2) {
    const storedKeyData = Buffer.from(parts[1], "base64");
    if (
      storedKeyData.length !== clientKey.data.length ||
      !timingSafeEqual(storedKeyData, clientKey.data)
    ) {
      return null;
    }
  }

  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  return user ? { userId: user.id, username: user.username } : null;
}

/**
 * Parse the git command from the SSH exec request.
 * Git sends: git-upload-pack '/owner/repo.git'
 * or: git-receive-pack '/owner/repo.git'
 */
function parseGitCommand(command: string): {
  service: "upload-pack" | "receive-pack";
  owner: string;
  repoName: string;
} | null {
  const match = command.match(
    /^git-(upload-pack|receive-pack)\s+'?\/?([^/]+)\/([^/]+?)(?:\.git)?'?$/,
  );
  if (!match) return null;
  return {
    service: match[1] as "upload-pack" | "receive-pack",
    owner: match[2],
    repoName: match[3],
  };
}

/**
 * Parse git-lfs-authenticate command from SSH exec request.
 * LFS sends: git-lfs-authenticate '/owner/repo.git' upload
 * or: git-lfs-authenticate '/owner/repo.git' download
 */
function parseLfsAuthCommand(command: string): {
  owner: string;
  repoName: string;
  operation: "upload" | "download";
} | null {
  const match = command.match(
    /^git-lfs-authenticate\s+'?\/?([^/]+)\/([^/]+?)(?:\.git)?'?\s+(upload|download)$/,
  );
  if (!match) return null;
  return {
    owner: match[1],
    repoName: match[2],
    operation: match[3] as "upload" | "download",
  };
}

export function startSshServer() {
  const hostKey = getOrCreateHostKey();

  // @ts-expect-error - ssh2 default import types require callback but it's optional at runtime
  const server = new SshServer({ hostKeys: [hostKey] });

  (server as unknown as NodeJS.EventEmitter).on(
    "connection",
    (client: Connection, info: { ip: string }) => {
      let authenticatedUser: { userId: string; username: string } | null = null;
      const connectionId = crypto.randomUUID();
      const clientIp = info?.ip || "unknown";

      client.on("authentication", (ctx: AuthContext) => {
        if (ctx.method === "publickey") {
          findUserByPublicKey({ algo: ctx.key.algo, data: ctx.key.data })
            .then((user) => {
              if (user) {
                authenticatedUser = user;
                logger.info(`SSH auth success: ${user.username}`, {
                  requestId: connectionId,
                  userId: user.userId,
                  source: "ssh",
                  method: "auth",
                  metadata: { ip: clientIp, keyAlgo: ctx.key.algo },
                });
                ctx.accept();
              } else {
                logger.warn("SSH auth failed: unknown public key", {
                  requestId: connectionId,
                  source: "ssh",
                  method: "auth",
                  metadata: { ip: clientIp, keyAlgo: ctx.key.algo },
                });
                ctx.reject(["publickey"]);
              }
            })
            .catch((err) => {
              logger.error(`SSH auth error: ${err.message}`, {
                requestId: connectionId,
                source: "ssh",
                method: "auth",
                metadata: { ip: clientIp },
              });
              ctx.reject(["publickey"]);
            });
        } else {
          ctx.reject(["publickey"]);
        }
      });

      client.on("ready", () => {
        client.on("session", (accept: () => Session) => {
          const session = accept();

          (session as NodeJS.EventEmitter).on("shell", (accept: () => Channel) => {
            const channel = accept();
            channel.write(
              `Hi ${authenticatedUser?.username ?? "there"}! You've successfully authenticated, but Groffee does not provide shell access.\r\n`,
            );
            channel.exit(0);
            channel.end();
          });

          session.on("exec", async (accept, _reject, info) => {
            // Handle git-lfs-authenticate before regular git commands
            const lfsAuth = parseLfsAuthCommand(info.command);
            if (lfsAuth && authenticatedUser) {
              const channel = accept();
              try {
                const [owner] = await db
                  .select()
                  .from(users)
                  .where(eq(users.username, lfsAuth.owner))
                  .limit(1);

                if (!owner) {
                  channel.stderr.write(Buffer.from(`Repository not found\n`));
                  channel.exit(1);
                  channel.end();
                  return;
                }

                const [repo] = await db
                  .select()
                  .from(repositories)
                  .where(
                    and(
                      eq(repositories.ownerId, owner.id),
                      eq(repositories.name, lfsAuth.repoName),
                    ),
                  )
                  .limit(1);

                if (!repo) {
                  channel.stderr.write(Buffer.from(`Repository not found\n`));
                  channel.exit(1);
                  channel.end();
                  return;
                }

                if (lfsAuth.operation === "upload") {
                  if (!(await canPush(authenticatedUser.userId, repo.id))) {
                    channel.stderr.write(Buffer.from(`Permission denied\n`));
                    channel.exit(1);
                    channel.end();
                    return;
                  }
                } else {
                  if (!(await canRead(authenticatedUser.userId, repo.id))) {
                    channel.stderr.write(Buffer.from(`Permission denied\n`));
                    channel.exit(1);
                    channel.end();
                    return;
                  }
                }

                const { plainToken, expiresInSeconds } = await createEphemeralLfsToken(
                  authenticatedUser.userId,
                );

                const basicAuth = Buffer.from(
                  `${authenticatedUser.username}:${plainToken}`,
                ).toString("base64");

                const response = JSON.stringify({
                  href: `${EXTERNAL_URL}/${lfsAuth.owner}/${lfsAuth.repoName}/info/lfs`,
                  header: {
                    Authorization: `Basic ${basicAuth}`,
                  },
                  expires_in: expiresInSeconds,
                });

                channel.write(response + "\n");
                channel.exit(0);
                channel.end();

                logger.info(
                  `SSH LFS authenticate: ${lfsAuth.owner}/${lfsAuth.repoName} (${lfsAuth.operation})`,
                  {
                    requestId: connectionId,
                    userId: authenticatedUser.userId,
                    source: "ssh",
                    method: "lfs-authenticate",
                    path: `${lfsAuth.owner}/${lfsAuth.repoName}`,
                    metadata: { ip: clientIp, operation: lfsAuth.operation },
                  },
                );
              } catch (err: any) {
                channel.stderr.write(Buffer.from(`Internal error\n`));
                channel.exit(1);
                channel.end();
                logger.error(`SSH LFS authenticate error: ${err.message}`, {
                  requestId: connectionId,
                  userId: authenticatedUser.userId,
                  source: "ssh",
                  metadata: { ip: clientIp },
                });
              }
              return;
            }

            const parsed = parseGitCommand(info.command);
            if (!parsed || !authenticatedUser) {
              // Non-git commands get a friendly greeting (like `ssh -T`)
              if (authenticatedUser && !parsed) {
                const channel = accept();
                channel.write(
                  `Hi ${authenticatedUser.username}! You've successfully authenticated, but Groffee does not provide shell access.\r\n`,
                );
                channel.exit(0);
                channel.end();
                return;
              }
              logger.warn(`SSH exec rejected: ${!parsed ? "invalid command" : "unauthenticated"}`, {
                requestId: connectionId,
                userId: authenticatedUser?.userId,
                source: "ssh",
                metadata: { ip: clientIp, command: info.command },
              });
              const channel = accept();
              channel.stderr.write(
                Buffer.from(
                  !authenticatedUser
                    ? "ERROR: Permission denied. Please make sure you have a valid SSH key added to your Groffee account.\n"
                    : "ERROR: Invalid command.\n",
                ),
              );
              channel.exit(1);
              channel.end();
              return;
            }

            const repoPath = `${parsed.owner}/${parsed.repoName}`;
            const operationType = parsed.service === "receive-pack" ? "push" : "pull";

            const [owner] = await db
              .select()
              .from(users)
              .where(eq(users.username, parsed.owner))
              .limit(1);

            if (!owner) {
              logger.warn(`SSH repo not found: owner "${parsed.owner}" does not exist`, {
                requestId: connectionId,
                userId: authenticatedUser.userId,
                source: "ssh",
                path: repoPath,
                metadata: { ip: clientIp },
              });
              const channel = accept();
              channel.stderr.write(Buffer.from(`ERROR: Repository not found: ${repoPath}\n`));
              channel.exit(1);
              channel.end();
              return;
            }

            const [repo] = await db
              .select()
              .from(repositories)
              .where(
                and(eq(repositories.ownerId, owner.id), eq(repositories.name, parsed.repoName)),
              )
              .limit(1);

            if (!repo) {
              logger.warn(`SSH repo not found: ${repoPath}`, {
                requestId: connectionId,
                userId: authenticatedUser.userId,
                source: "ssh",
                path: repoPath,
                metadata: { ip: clientIp },
              });
              const channel = accept();
              channel.stderr.write(Buffer.from(`ERROR: Repository not found: ${repoPath}\n`));
              channel.exit(1);
              channel.end();
              return;
            }

            // Permission check
            if (parsed.service === "receive-pack") {
              const allowed = await canPush(authenticatedUser.userId, repo.id);
              if (!allowed) {
                logger.warn(`SSH permission denied: push to ${repoPath}`, {
                  requestId: connectionId,
                  userId: authenticatedUser.userId,
                  source: "ssh",
                  method: operationType,
                  path: repoPath,
                  statusCode: 403,
                  metadata: { ip: clientIp },
                });
                logAudit({
                  userId: authenticatedUser.userId,
                  action: "ssh.push_denied",
                  targetType: "repository",
                  targetId: repo.id,
                  metadata: { repoName: repoPath },
                  ipAddress: clientIp,
                }).catch(console.error);
                const channel = accept();
                channel.stderr.write(
                  Buffer.from(
                    `ERROR: Permission denied: you do not have push access to ${repoPath}\n`,
                  ),
                );
                channel.exit(1);
                channel.end();
                return;
              }
            } else {
              const allowed = await canRead(authenticatedUser.userId, repo.id);
              if (!allowed) {
                logger.warn(`SSH permission denied: pull from ${repoPath}`, {
                  requestId: connectionId,
                  userId: authenticatedUser.userId,
                  source: "ssh",
                  method: operationType,
                  path: repoPath,
                  statusCode: 403,
                  metadata: { ip: clientIp },
                });
                logAudit({
                  userId: authenticatedUser.userId,
                  action: "ssh.pull_denied",
                  targetType: "repository",
                  targetId: repo.id,
                  metadata: { repoName: repoPath },
                  ipAddress: clientIp,
                }).catch(console.error);
                const channel = accept();
                channel.stderr.write(
                  Buffer.from(
                    `ERROR: Permission denied: you do not have read access to ${repoPath}\n`,
                  ),
                );
                channel.exit(1);
                channel.end();
                return;
              }
            }

            const channel = accept();
            const startTime = Date.now();

            logger.info(`SSH ${operationType} started: ${repoPath}`, {
              requestId: connectionId,
              userId: authenticatedUser.userId,
              source: "ssh",
              method: operationType,
              path: repoPath,
              metadata: { ip: clientIp, service: parsed.service },
            });

            // Snapshot refs before push to detect changes afterwards
            const refsBefore =
              parsed.service === "receive-pack"
                ? await snapshotRefs(resolveDiskPath(repo.diskPath))
                : null;

            // SSH uses the interactive (non-stateless) git protocol
            const gitProc = spawn("git", [parsed.service, resolveDiskPath(repo.diskPath)]);

            // Explicit data flow avoids pipe() timing issues with ssh2 channels
            channel.on("data", (data: Buffer) => {
              gitProc.stdin.write(data);
            });
            channel.on("end", () => {
              gitProc.stdin.end();
            });

            gitProc.stdout.on("data", (data: Buffer) => {
              channel.write(data);
            });
            gitProc.stderr.on("data", (data: Buffer) => {
              channel.stderr.write(data);
            });

            // Wait for stdout to fully drain before signaling exit
            let exitCode: number | null = null;
            let stdoutEnded = false;
            let channelClosed = false;

            function tryClose() {
              if (exitCode !== null && stdoutEnded && !channelClosed) {
                channelClosed = true;
                try {
                  channel.exit(exitCode);
                  channel.end();
                } catch {
                  // Channel may already be closed
                }
              }
            }

            gitProc.stdout.on("end", () => {
              stdoutEnded = true;
              tryClose();
            });

            gitProc.on("exit", (code) => {
              exitCode = code ?? 1;
              const duration = Date.now() - startTime;

              if (exitCode === 0) {
                logger.info(`SSH ${operationType} completed: ${repoPath}`, {
                  requestId: connectionId,
                  userId: authenticatedUser!.userId,
                  source: "ssh",
                  method: operationType,
                  path: repoPath,
                  duration,
                  statusCode: 0,
                  metadata: { ip: clientIp },
                });
                logAudit({
                  userId: authenticatedUser!.userId,
                  action: `ssh.${operationType}`,
                  targetType: "repository",
                  targetId: repo.id,
                  metadata: { repoName: repoPath, duration },
                  ipAddress: clientIp,
                }).catch(console.error);
              } else {
                logger.error(`SSH ${operationType} failed: ${repoPath} (exit ${exitCode})`, {
                  requestId: connectionId,
                  userId: authenticatedUser!.userId,
                  source: "ssh",
                  method: operationType,
                  path: repoPath,
                  duration,
                  statusCode: exitCode,
                  metadata: { ip: clientIp },
                });
              }

              tryClose();
              // Trigger indexing after successful push
              if (parsed.service === "receive-pack" && code === 0 && refsBefore) {
                triggerIncrementalIndex(repo.id, resolveDiskPath(repo.diskPath), refsBefore).catch(
                  (err) =>
                    logger.error("Post-push SSH indexing failed", {
                      requestId: connectionId,
                      userId: authenticatedUser!.userId,
                      source: "ssh",
                      metadata: { error: err.message, repoPath },
                    }),
                );
              }
            });

            channel.on("close", () => {
              channelClosed = true;
              if (exitCode === null) {
                const duration = Date.now() - startTime;
                logger.warn(`SSH ${operationType} cancelled: ${repoPath}`, {
                  requestId: connectionId,
                  userId: authenticatedUser!.userId,
                  source: "ssh",
                  method: operationType,
                  path: repoPath,
                  duration,
                  metadata: { ip: clientIp, reason: "client_disconnect" },
                });
              }
              gitProc.kill();
            });
          });
        });
      });

      client.on("error", (err) => {
        logger.error(`SSH client error: ${err.message}`, {
          requestId: connectionId,
          source: "ssh",
          metadata: { ip: clientIp },
        });
      });
    },
  );

  server.listen(SSH_PORT, "0.0.0.0", () => {
    console.log(`SSH server listening on port ${SSH_PORT}`);
  });

  return server;
}
