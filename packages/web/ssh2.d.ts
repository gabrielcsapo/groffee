declare module "ssh2" {
  import type { EventEmitter } from "events";

  export interface AuthContext {
    method: string;
    username: string;
    key: { algo: string; data: Buffer };
    accept: () => void;
    reject: (methods?: string[]) => void;
  }

  export interface Channel extends EventEmitter {
    write(data: Buffer | string): boolean;
    end(): void;
    exit(code: number): void;
    stderr: { write(data: Buffer | string): boolean };
  }

  export interface Session extends EventEmitter {
    on(
      event: "exec",
      listener: (accept: () => Channel, reject: () => void, info: { command: string }) => void,
    ): this;
  }

  export interface Connection extends EventEmitter {
    on(event: "authentication", listener: (ctx: AuthContext) => void): this;
    on(event: "ready", listener: () => void): this;
    on(event: "session", listener: (accept: () => Session) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  interface ServerOptions {
    hostKeys: Buffer[];
  }

  class Server {
    constructor(options: ServerOptions, connectionListener: (client: Connection) => void);
    listen(port: number, host: string, callback?: () => void): void;
    close(): void;
  }

  const ssh2: { Server: typeof Server };
  export default ssh2;
}
