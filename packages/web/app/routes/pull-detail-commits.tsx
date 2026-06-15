import { PullCommitsConsumer } from "./pull-detail-tabs.client";

/**
 * Commits tab — child of `/owner/repo/pull/:n`. Reads the commit list from
 * the parent's `PullDetailContext`.
 */
export default function PullDetailCommits() {
  return <PullCommitsConsumer />;
}
