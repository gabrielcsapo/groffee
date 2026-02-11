export {
  listRefs,
  resolveHead,
  getTree,
  getBlob,
  getCommitLog,
  getCommit,
  getLastCommitsForPaths,
  type GitRef,
  type TreeEntry,
  type CommitInfo,
  type LastCommitInfo,
} from "./read.js";

export { getDiff, type DiffFile, type DiffHunk } from "./diff.js";

export { getBlame, type BlameLine } from "./blame.js";

export { handleInfoRefs, handleServiceRpc } from "./protocol.js";

export { initBareRepo } from "./init.js";
