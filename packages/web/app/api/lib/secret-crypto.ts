import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DATA_DIR } from "./paths.js";

// Layout of a sealed secret: [12-byte IV][16-byte GCM tag][ciphertext...]
// IV size matches AES-GCM's recommended 96 bits. Tag size is the GCM default.
const IV_LEN = 12;
const TAG_LEN = 16;

const KEY_PATH = resolve(DATA_DIR, ".groffee-key");

let _key: Buffer | null = null;

/**
 * Read the master key from `<DATA_DIR>/.groffee-key`, creating it on first
 * call. The file is 32 bytes (raw, not encoded) with mode 0600. The key is
 * cached in module scope after the first read; rotating it requires a server
 * restart (and re-encrypting all existing secrets, which is outside v1).
 */
function getMasterKey(): Buffer {
  if (_key !== null) return _key;
  if (existsSync(KEY_PATH)) {
    const buf = readFileSync(KEY_PATH);
    if (buf.length !== 32) {
      throw new Error(
        `Invalid groffee key at ${KEY_PATH}: expected 32 bytes, got ${buf.length}. ` +
          `Either restore the original file or wipe it (this will invalidate all stored secrets).`,
      );
    }
    _key = buf;
    return _key;
  }
  // First-run: generate a fresh 32-byte key.
  const key = randomBytes(32);
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  // Write with restrictive perms. We `chmodSync` after write because Node's
  // `mode` option to writeFileSync is honored by the fs syscall but interacts
  // with umask; chmod is unconditional.
  writeFileSync(KEY_PATH, key, { mode: 0o600 });
  try {
    chmodSync(KEY_PATH, 0o600);
  } catch {
    // chmod can fail on Windows / mounted volumes — best effort
  }
  _key = key;
  return _key;
}

export function encryptSecret(plaintext: string): Buffer {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv) as CipherGCM;
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack as IV || TAG || CT so callers can hand a single Buffer to the DB.
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(buf: Buffer): string {
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error(`Sealed secret too short (${buf.length} bytes)`);
  }
  const key = getMasterKey();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  // `final()` throws on tag mismatch — we let it propagate so callers see the
  // tampering rather than getting back garbage / empty bytes.
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf-8");
}

// Smoke test on import in development: verify the round-trip works with the
// real key file. We skip this in production to avoid noisy warnings on
// containers where DATA_DIR may not yet be writable at module-load time.
if (process.env.NODE_ENV === "development") {
  try {
    const sample = "groffee-secret-crypto-self-test";
    const sealed = encryptSecret(sample);
    const back = decryptSecret(sealed);
    if (back !== sample) {
      console.warn("[secret-crypto] self-test mismatch — secrets are likely broken");
    }
  } catch (err) {
    console.warn(
      "[secret-crypto] self-test failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
