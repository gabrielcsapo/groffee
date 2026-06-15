import { PullFilesConsumer } from "./pull-detail-tabs.client";

/**
 * Files-changed tab — child of `/owner/repo/pull/:n`. Reads the diff +
 * inline review comments from the parent's `PullDetailContext`; navigating
 * to this route from the conversation tab does NOT trigger a re-fetch.
 */
export default function PullDetailFiles() {
  return <PullFilesConsumer />;
}
