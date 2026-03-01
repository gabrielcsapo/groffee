export interface LfsPointer {
  oid: string; // sha256 hex (64 chars)
  size: number; // actual file size in bytes
}

const LFS_VERSION = "https://git-lfs.github.com/spec/v1";
const LFS_POINTER_MAX_SIZE = 200;

/**
 * Parse an LFS pointer from blob content string.
 * Returns null if the content is not a valid LFS pointer.
 *
 * Format:
 *   version https://git-lfs.github.com/spec/v1
 *   oid sha256:<64-hex-chars>
 *   size <number>
 */
export function parseLfsPointer(content: string | null): LfsPointer | null {
  if (!content || content.length > LFS_POINTER_MAX_SIZE) return null;

  const lines = content.trim().split("\n");
  if (lines.length < 3) return null;

  const versionMatch = lines[0].match(/^version (.+)$/);
  if (!versionMatch || versionMatch[1] !== LFS_VERSION) return null;

  const oidMatch = lines[1].match(/^oid sha256:([0-9a-f]{64})$/);
  if (!oidMatch) return null;

  const sizeMatch = lines[2].match(/^size (\d+)$/);
  if (!sizeMatch) return null;

  return {
    oid: oidMatch[1],
    size: parseInt(sizeMatch[1], 10),
  };
}

/**
 * Build the on-disk path for an LFS object given its sha256 OID.
 * Uses the same 2-level sharded layout as git-lfs.ts.
 */
export function lfsObjectDiskPath(dataDir: string, oid: string): string {
  return `${dataDir}/lfs-objects/${oid.substring(0, 2)}/${oid.substring(2, 4)}/${oid}`;
}
