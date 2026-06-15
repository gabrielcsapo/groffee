import type { ReactNode } from "react";

type CalloutKind = "note" | "warning" | "danger";

interface CalloutProps {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}

const STYLES: Record<CalloutKind, { wrapper: string; title: string }> = {
  note: {
    wrapper: "bg-info-bg/40 border-l-4 border-info text-text-primary",
    title: "text-info",
  },
  warning: {
    wrapper: "bg-warning-bg/40 border-l-4 border-warning text-text-primary",
    title: "text-warning",
  },
  danger: {
    wrapper: "bg-danger-bg/40 border-l-4 border-danger text-text-primary",
    title: "text-danger",
  },
};

export function Callout({ kind = "note", title, children }: CalloutProps) {
  const s = STYLES[kind];
  return (
    <div className={`px-4 py-3 my-3 rounded-r-md text-sm ${s.wrapper}`}>
      {title && (
        <div className={`font-semibold text-xs uppercase tracking-wide mb-1 ${s.title}`}>
          {title}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
