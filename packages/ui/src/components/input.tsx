import type { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "search";
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
}

const BASE_INPUT_CLASS =
  "block w-full text-sm bg-surface text-text-primary border border-border rounded-md " +
  "placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-text-link/40 " +
  "focus:border-text-link disabled:bg-surface-secondary disabled:cursor-not-allowed";

export function Input({
  variant = "default",
  leadingIcon,
  trailingSlot,
  className,
  ...rest
}: InputProps) {
  const padding = variant === "search" || leadingIcon ? "pl-9 pr-3 py-1.5" : "px-3 py-1.5";
  const inputClass = [BASE_INPUT_CLASS, padding, className ?? ""].join(" ");

  if (!leadingIcon && !trailingSlot && variant !== "search") {
    return <input className={inputClass} {...rest} />;
  }

  return (
    <div className="relative">
      {(leadingIcon || variant === "search") && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">
          {leadingIcon ?? <SearchIcon />}
        </span>
      )}
      <input className={inputClass} {...rest} />
      {trailingSlot && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailingSlot}</span>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z" />
    </svg>
  );
}
