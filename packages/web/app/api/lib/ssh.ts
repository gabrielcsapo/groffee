import { createHash } from "node:crypto";

const VALID_KEY_TYPES = [
  "ssh-rsa",
  "ssh-ed25519",
  "ssh-dss",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
];

/**
 * Parse an OpenSSH public key string and return the SHA256 fingerprint.
 * Accepts formats like: "ssh-rsa AAAA... comment", "ssh-ed25519 AAAA... comment"
 * Returns null if the key is invalid.
 */
export function generateFingerprint(publicKey: string): string | null {
  const trimmed = publicKey.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) return null;

  const keyType = parts[0];
  if (!VALID_KEY_TYPES.includes(keyType)) return null;

  const keyData = parts[1];

  let decoded: Buffer;
  try {
    decoded = Buffer.from(keyData, "base64");
    if (decoded.toString("base64") !== keyData) return null;
    if (decoded.length < 16) return null;
  } catch {
    return null;
  }

  const hash = createHash("sha256").update(decoded).digest("base64");
  return `SHA256:${hash.replace(/=+$/, "")}`;
}
