import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as Theme) || "system";
  });
  const [systemResolved, setSystemResolved] = useState<"light" | "dark">(() =>
    resolveSystemTheme(),
  );

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      localStorage.removeItem("theme");
      if (systemResolved === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    }
  }, [theme, systemResolved]);

  function cycle() {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  }

  const resolved: "light" | "dark" = theme === "system" ? systemResolved : theme;
  const label = theme === "system" ? `Theme: system (${systemResolved})` : `Theme: ${theme}`;

  return (
    <button
      onClick={cycle}
      className="relative p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10"
      title={label}
      aria-label={label}
    >
      {resolved === "light" ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
      {theme === "system" && (
        <span
          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
