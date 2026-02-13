import ssh2 from "ssh2";
import type { AuthContext, Connection, Session } from "ssh2";

const { Server: SshServer } = ssh2;
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";

import { db, sshKeys, users, repositories } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { canPush, canRead } from "./lib/permissions.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = process.env.DATA_DIR || path.resolve(PROJECT_ROOT, "data");
const SSH_HOST_KEY_PATH = path.resolve(DATA_DIR, "ssh_host_ed25519_key");
const SSH_PORT = parseInt(process.env.SSH_PORT || "2222", 10);

function getOrCreateHostKey(): Buffer {
  if (existsSync(SSH_HOST_KEY_PATH)) {
    return readFileSync(SSH_HOST_KEY_PATH);
  }

  mkdirSync(path.dirname(SSH_HOST_KEY_PATH), { recursive: true });

  // Generate an OpenSSH-format ed25519 key via ssh-keygen
  execFileSync("ssh-keygen", ["-t", "ed25519", "-f", SSH_HOST_KEY_PATH, "-N", "", "-q"]);

  return readFileSync(SSH_HOST_KEY_PATH);
}

async function findUserByPublicKey(
  clientKey: { algo: string; data: Buffer },
): Promise<{ userId: string; username: string } | null> {
  const allKeys = await db
    .select({
      userId: sshKeys.userId,
      publicKey: sshKeys.publicKey,
    })
    .from(sshKeys);

  for (const stored of allKeys) {
    const parts = stored.publicKey.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const storedKeyData = Buffer.from(parts[1], "base64");

    if (
      storedKeyData.length === clientKey.data.length &&
      timingSafeEqual(storedKeyData, clientKey.data)
    ) {
      const [user] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, stored.userId))
        .limit(1);
      if (user) return { userId: user.id, username: user.username };
    }
  }
  return null;
}

/**
 * Parse the git command from the SSH exec request.
 * Git sends: git-upload-pack '/owner/repo.git'
 * or: git-receive-pack '/owner/repo.git'
 */
function parseGitCommand(
  command: string,
): { service: "upload-pack" | "receive-pack"; owner: string; repoName: string } | null {
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

export function startSshServer() {
  const hostKey = getOrCreateHostKey();

  const server = new SshServer({ hostKeys: [hostKey] }, (client: Connection) => {
    let authenticatedUser: { userId: string; username: string } | null = null;

    client.on("authentication", (ctx: AuthContext) => {
      if (ctx.method === "publickey") {
        findUserByPublicKey({ algo: ctx.key.algo, data: ctx.key.data })
          .then((user) => {
            if (user) {
              authenticatedUser = user;
              ctx.accept();
            } else {
              ctx.reject(["publickey"]);
            }
          })
          .catch(() => ctx.reject(["publickey"]));
      } else {
        ctx.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      client.on("session", (accept: () => Session) => {
        const session = accept();

        session.on("exec", async (accept, reject, info) => {
          const parsed = parseGitCommand(info.command);
          if (!parsed || !authenticatedUser) {
            reject();
            return;
          }

          const [owner] = await db
            .select()
            .from(users)
            .where(eq(users.username, parsed.owner))
            .limit(1);

          if (!owner) {
            reject();
            return;
          }

          const [repo] = await db
            .select()
            .from(repositories)
            .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, parsed.repoName)))
            .limit(1);

          if (!repo) {
            reject();
            return;
          }

          // Permission check
          if (parsed.service === "receive-pack") {
            const allowed = await canPush(authenticatedUser.userId, repo.id);
            if (!allowed) {
              reject();
              return;
            }
          } else {
            const allowed = await canRead(authenticatedUser.userId, repo.id);
            if (!allowed) {
              reject();
              return;
            }
          }

          const channel = accept();

          // SSH uses the interactive (non-stateless) git protocol
          const gitProc = spawn("git", [parsed.service, repo.diskPath]);

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

          function tryClose() {
            if (exitCode !== null && stdoutEnded) {
              channel.exit(exitCode);
              channel.end();
            }
          }

          gitProc.stdout.on("end", () => {
            stdoutEnded = true;
            tryClose();
          });

          gitProc.on("exit", (code) => {
            exitCode = code ?? 1;
            tryClose();
          });

          channel.on("close", () => {
            gitProc.kill();
          });
        });
      });
    });

    client.on("error", (err) => {
      console.error("SSH client error:", err.message);
    });
  });

  server.listen(SSH_PORT, "0.0.0.0", () => {
    console.log(`SSH server listening on port ${SSH_PORT}`);
  });

  return server;
}
