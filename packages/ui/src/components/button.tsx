import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "default" | "sm";
}

export function Button({
  variant = "secondary",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : "btn-secondary";

  const sizeClass = size === "sm" ? "btn-sm" : "";

  return (
    <button className={`${variantClass} ${sizeClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
