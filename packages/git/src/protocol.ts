import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

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
 * Returns a web Response with the ref advertisement stream.
 */
export function handleInfoRefs(repoPath: string, service: ServiceType): Response {
  const header = `# service=git-${service}\n`;
  const headerBytes = new TextEncoder().encode(pktLine(header) + "0000");

  const proc = spawn("git", [service, "--stateless-rpc", "--advertise-refs", "."], {
    cwd: repoPath,
  });

  proc.stderr.on("data", (data: Buffer) => {
    console.error(`git ${service} stderr:`, data.toString());
  });

  proc.on("error", (err) => {
    console.error(`git ${service} spawn error:`, err);
  });

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(headerBytes);

      proc.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      proc.stdout.on("end", () => {
        controller.close();
      });

      proc.stdout.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      proc.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `application/x-git-${service}-advertisement`,
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Handle POST /git-upload-pack or /git-receive-pack
 * Pipes the request body to git and returns a web Response with the result stream.
 */
export function handleServiceRpc(
  repoPath: string,
  service: ServiceType,
  req: IncomingMessage | ReadableStream,
): Response {
  const proc = spawn("git", [service, "--stateless-rpc", "."], {
    cwd: repoPath,
  });

  // Pipe request body into git stdin
  if (req instanceof ReadableStream) {
    Readable.fromWeb(req as import("stream/web").ReadableStream).pipe(proc.stdin);
  } else {
    req.pipe(proc.stdin);
  }

  proc.stderr.on("data", (data: Buffer) => {
    console.error(`git ${service} stderr:`, data.toString());
  });

  proc.on("error", (err) => {
    console.error(`git ${service} spawn error:`, err);
  });

  const stream = new ReadableStream({
    start(controller) {
      proc.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      proc.stdout.on("end", () => {
        controller.close();
      });

      proc.stdout.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      proc.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `application/x-git-${service}-result`,
      "Cache-Control": "no-cache",
    },
  });
}
