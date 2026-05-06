"use client";

import { RefPicker } from "@groffee/ui";
import { useRouter } from "react-flight-router/client";

export type RefPickerMode = "tree" | "blob" | "commits";

interface RefPickerWrapperProps {
  branches: { name: string }[];
  tags?: { name: string }[];
  currentRef: string;
  /** `/owner/repo` — used to build the destination URL. */
  basePath: string;
  /**
   * Which page to navigate to when the user picks a ref.
   * - "tree": `/owner/repo/tree/<ref>[/path]`
   * - "blob": `/owner/repo/blob/<ref>/<path>` (falls back to tree when no path)
   * - "commits": `/owner/repo/commits/<ref>`
   */
  mode?: RefPickerMode;
  /** Sub-path within the tree/blob (without leading slash). Used for tree/blob modes. */
  path?: string;
}

export function BranchSwitcherWrapper({
  branches,
  tags = [],
  currentRef,
  basePath,
  mode = "tree",
  path = "",
}: RefPickerWrapperProps) {
  const { navigate } = useRouter();

  function handleSelect(ref: string) {
    const encoded = encodeURIComponent(ref);
    if (mode === "commits") {
      navigate(`${basePath}/commits/${encoded}`);
      return;
    }
    if (mode === "blob" && path) {
      navigate(`${basePath}/blob/${encoded}/${path}`);
      return;
    }
    // tree (or blob without path → fall back to tree)
    if (path) {
      navigate(`${basePath}/tree/${encoded}/${path}`);
    } else {
      navigate(`${basePath}/tree/${encoded}`);
    }
  }

  return (
    <RefPicker branches={branches} tags={tags} currentRef={currentRef} onSelect={handleSelect} />
  );
}
