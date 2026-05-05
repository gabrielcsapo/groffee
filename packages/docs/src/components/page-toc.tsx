import { useEffect, useState } from "react";
import { useLocation } from "react-router";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function PageToc() {
  const location = useLocation();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const collect = () => {
      const article = document.querySelector("main article");
      if (!article) return [] as Heading[];
      return Array.from(article.querySelectorAll("h2[id], h3[id]")).map((el) => ({
        id: el.id,
        text: el.textContent ?? "",
        level: Number(el.tagName[1]),
      }));
    };
    setHeadings(collect());
    // MDX content can mount async; re-collect on next frame just in case.
    const t = setTimeout(() => setHeadings(collect()), 50);
    return () => clearTimeout(t);
  }, [location.pathname]);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav aria-label="On this page" className="sticky top-20 text-sm">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        On this page
      </h3>
      <ul className="space-y-1 border-l border-border">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <li key={h.id} className={h.level === 3 ? "pl-3" : ""}>
              <a
                href={`#${h.id}`}
                className={`block -ml-px pl-3 py-0.5 border-l hover:no-underline ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
