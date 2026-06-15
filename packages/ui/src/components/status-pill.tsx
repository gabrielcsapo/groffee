import type { ReactNode } from "react";

/**
 * Status pill for PRs and Issues. Single source of truth so the live
 * product, mocks in the docs, and any future surface render the same
 * filled-tint + same-hue-border badge.
 *
 * The visual language is defined in @groffee/ui/theme.css via the
 * `badge-open` / `badge-closed` / `badge-merged` / `badge-draft` classes;
 * this component picks the right class and the right label. Drift between
 * call sites used to be a problem (mock-issue-list tinted closed-issues
 * purple, the product tints them red) — funneling every status pill
 * through this component eliminates that.
 */
export type StatusPillState = "open" | "closed" | "merged" | "draft";

const STATE_CLASS: Record<StatusPillState, string> = {
  open: "badge-open",
  closed: "badge-closed",
  merged: "badge-merged",
  draft: "badge-draft",
};

const STATE_LABEL: Record<StatusPillState, string> = {
  open: "Open",
  closed: "Closed",
  merged: "Merged",
  draft: "Draft",
};

export function StatusPill({
  state,
  label,
  icon,
  className = "",
}: {
  state: StatusPillState;
  /** Override the default label (e.g. lowercase "open" in the mocks). */
  label?: string;
  /** Optional leading icon — typically a small status circle. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge ${STATE_CLASS[state]} ${className}`}>
      {icon}
      {label ?? STATE_LABEL[state]}
    </span>
  );
}
