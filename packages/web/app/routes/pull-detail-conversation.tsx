import { PullConversationConsumer } from "./pull-detail-tabs.client";

/**
 * Conversation tab — the default (index) child of `/owner/repo/pull/:n`.
 * Server entry exists only to give the route a real module; the actual
 * rendering reads from the parent's `PullDetailContext`.
 */
export default function PullDetailConversation() {
  return <PullConversationConsumer />;
}
