import { describe, it, expect } from "vitest";
import { generateFingerprint } from "../lib/ssh.js";

describe("generateFingerprint", () => {
  it("generates a fingerprint for a valid ed25519 key", () => {
    const key =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test@groffee";
    const fp = generateFingerprint(key);
    expect(fp).toMatch(/^SHA256:/);
    expect(fp!.length).toBeGreaterThan(10);
  });

  it("generates a fingerprint for a valid rsa key", () => {
    const key =
      "ssh-rsa c3NoLXJzYSBrZXkgZGF0YSBwbGFjZWhvbGRlciB0aGF0IGlzIGxvbmcgZW5vdWdoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA test@example.com";
    const fp = generateFingerprint(key);
    expect(fp).toMatch(/^SHA256:/);
  });

  it("generates a fingerprint for ecdsa keys", () => {
    const key =
      "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKF/yGII user@host";
    const fp = generateFingerprint(key);
    expect(fp).toMatch(/^SHA256:/);
  });

  it("returns same fingerprint for same key regardless of comment", () => {
    const key1 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl user@laptop";
    const key2 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl other@server";
    expect(generateFingerprint(key1)).toBe(generateFingerprint(key2));
  });

  it("returns different fingerprints for different keys", () => {
    const key1 =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test";
    const key2 =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ0BA9DaqajkBiCf5GPmBMbfPJkopHnBRGaGJkrbzDlj test";
    expect(generateFingerprint(key1)).not.toBe(generateFingerprint(key2));
  });

  it("handles keys without a comment", () => {
    const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
    const fp = generateFingerprint(key);
    expect(fp).toMatch(/^SHA256:/);
  });

  it("handles leading/trailing whitespace", () => {
    const key =
      "  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test  ";
    const fp = generateFingerprint(key);
    expect(fp).toMatch(/^SHA256:/);
  });

  it("returns null for empty string", () => {
    expect(generateFingerprint("")).toBeNull();
  });

  it("returns null for random text", () => {
    expect(generateFingerprint("not a key at all")).toBeNull();
  });

  it("returns null for unsupported key type", () => {
    expect(generateFingerprint("ssh-unknown AAAAC3NzaC1lZDI1NTE5AAAAIJ0BA")).toBeNull();
  });

  it("returns null for missing base64 data", () => {
    expect(generateFingerprint("ssh-ed25519")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(generateFingerprint("ssh-ed25519 !!!invalid!!!")).toBeNull();
  });

  it("returns null for too-short key data", () => {
    // "dGVzdA==" decodes to "test" (4 bytes, < 16 minimum)
    expect(generateFingerprint("ssh-ed25519 dGVzdA==")).toBeNull();
  });
});
