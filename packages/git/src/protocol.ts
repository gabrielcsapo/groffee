import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

type ServiceType = "upload-pack" | "receive-pack";

/**
 * Encode a string in git's pkt-line format.
 * pkt-line: 4 hex chars for total line length + data
 */
function pktLine(data: string): string {
  const len = data.length + 4;
  return len.toString(16).padStart(4, "0") + data;
}

/**
 * Handle GET /info/refs?service=git-upload-pack|git-receive-pack
 * Advertises available refs to the git client.
 */
export function handleInfoRefs(
  repoPath: string,
  service: ServiceType,
  res: ServerResponse,
): void {
  res.setHeader(
    "Content-Type",
    `application/x-git-${service}-advertisement`,
  );
  res.setHeader("Cache-Control", "no-cache");

  // Write the service advertisement header
  const header = `# service=git-${service}\n`;
  res.write(pktLine(header));
  res.write("0000"); // flush-pkt

  const proc = spawn("git", [service, "--stateless-rpc", "--advertise-refs", "."], {
    cwd: repoPath,
  });

  proc.stdout.pipe(res);

  proc.stderr.on("data", (data: Buffer) => {
    console.error(`git ${service} stderr:`, data.toString());
  });

  proc.on("error", (err) => {
    console.error(`git ${service} spawn error:`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`git ${service} exited with code ${code}`);
    }
  });
}

/**
 * Handle POST /git-upload-pack or /git-receive-pack
 * Performs the actual pack negotiation and data transfer.
 */
export function handleServiceRpc(
  repoPath: string,
  service: ServiceType,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.setHeader("Content-Type", `application/x-git-${service}-result`);
  res.setHeader("Cache-Control", "no-cache");

  const proc = spawn("git", [service, "--stateless-rpc", "."], {
    cwd: repoPath,
  });

  req.pipe(proc.stdin);
  proc.stdout.pipe(res);

  proc.stderr.on("data", (data: Buffer) => {
    console.error(`git ${service} stderr:`, data.toString());
  });

  proc.on("error", (err) => {
    console.error(`git ${service} spawn error:`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`git ${service} exited with code ${code}`);
    }
  });
}
