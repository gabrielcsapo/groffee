import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "public" | "private" | "open" | "closed" | "merged";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "badge",
  public: "badge badge-public",
  private: "badge badge-private",
  open: "badge badge-open",
  closed: "badge badge-closed",
  merged: "badge badge-merged",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span className={`${variantClasses[variant]} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
