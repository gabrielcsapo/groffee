"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Two-shape rail data model:
 *
 *  - `kind: "links"` for prose-style sections (Overview, Reference). One
 *    item per heading; clicking jumps to the anchor.
 *
 *  - `kind: "endpoints"` for an API surface group. The group title is also
 *    a link (to the section anchor), and underneath sits a method+path row
 *    for every endpoint in the group. This is the moves the docs from a
 *    "wiki TOC" to a Stripe/Vercel-tier "endpoint index" — you can scan the
 *    rail for `POST /api/repos` instead of guessing which section heading
 *    contains it.
 */
export type SidebarMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface SidebarEndpoint {
  method: SidebarMethod;
  path: string;
  /** Anchor id on the page, matches Endpoint's auto-generated slug. */
  slug: string;
}

interface LinkGroup {
  kind: "links";
  title: string;
  links: { href: string; label: string }[];
}

interface EndpointGroup {
  kind: "endpoints";
  title: string;
  sectionHref: string;
  endpoints: SidebarEndpoint[];
}

export type SidebarGroup = LinkGroup | EndpointGroup;

const METHOD_CLASS: Record<SidebarMethod, string> = {
  GET: "text-accent",
  POST: "text-action",
  PATCH: "text-warning",
  PUT: "text-warning",
  DELETE: "text-danger",
};

/**
 * Filter the nav groups against a search query. Each query word must appear
 * somewhere in the group title + method/path (for endpoints) or label (for
 * links). Returns the filtered groups with empty groups removed. Comparison
 * is case-insensitive; multi-word queries match across fields ("post repo"
 * matches `POST /api/repos`).
 */
function filterGroups(groups: SidebarGroup[], query: string): SidebarGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const terms = q.split(/\s+/).filter(Boolean);

  const matches = (haystack: string) => {
    const lower = haystack.toLowerCase();
    return terms.every((t) => lower.includes(t));
  };

  const out: SidebarGroup[] = [];
  for (const g of groups) {
    if (g.kind === "links") {
      const links = g.links.filter((l) => matches(`${g.title} ${l.label}`));
      if (links.length) out.push({ ...g, links });
    } else {
      const endpoints = g.endpoints.filter((e) => matches(`${g.title} ${e.method} ${e.path}`));
      if (endpoints.length) out.push({ ...g, endpoints });
    }
  }
  return out;
}

/** Pick the slug to jump to on Enter — first endpoint in the first group,
 * or the first link of a links-group if no endpoints matched. */
function firstHash(filtered: SidebarGroup[]): string | null {
  for (const g of filtered) {
    if (g.kind === "endpoints" && g.endpoints[0]) return `#${g.endpoints[0].slug}`;
    if (g.kind === "links" && g.links[0]) return g.links[0].href;
  }
  return null;
}

export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const railRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredGroups = useMemo(() => filterGroups(groups, query), [groups, query]);

  // Keyboard: Cmd/Ctrl-K focuses the search; Esc clears + blurs. These
  // shortcuts only fire when the rail input is mounted, so they're
  // scoped to /docs by definition.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Collect every anchor id the rail can highlight — both link-group hrefs
  // and endpoint slugs. Observer setup is deferred to the next paint
  // because the docs page streams: the sidebar can hydrate before all the
  // section anchors below it have been committed to the DOM. If we queried
  // `getElementById` synchronously on mount we'd get `null` for most ids
  // and the observer would never attach.
  //
  // To stay robust against further streaming (e.g. future async sections)
  // we ALSO listen on `scroll` with a fallback: if the observer never fires
  // for some reason, the scroll handler picks the topmost-above-fold
  // section as active. The handlers don't fight — whichever updates
  // `activeId` first wins, and they converge on the same answer.
  useEffect(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.kind === "links") {
        ids.push(...g.links.map((l) => l.href.replace(/^#/, "")));
      } else {
        ids.push(g.sectionHref.replace(/^#/, ""), ...g.endpoints.map((e) => e.slug));
      }
    }

    let observer: IntersectionObserver | null = null;

    const attach = () => {
      const els = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (els.length === 0) return false;

      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .map((e) => e.target as HTMLElement);
          if (visible.length === 0) return;
          const topmost = visible.reduce((a, b) =>
            a.getBoundingClientRect().top < b.getBoundingClientRect().top ? a : b,
          );
          setActiveId(topmost.id);
        },
        { rootMargin: "-10% 0px -65% 0px", threshold: 0 },
      );
      for (const el of els) observer.observe(el);
      return true;
    };

    // Try to attach now, then re-attempt after a frame and after a tick in
    // case content is still streaming in. Stops as soon as it finds work
    // to do.
    if (!attach()) {
      requestAnimationFrame(() => {
        if (!attach()) setTimeout(attach, 200);
      });
    }

    // Belt-and-braces fallback. If the IntersectionObserver never updated
    // `activeId` for any reason (streaming SSR, an old browser, an element
    // that arrives mid-scroll), this scroll handler will. It computes the
    // topmost section heading whose top is above 35% of the viewport — the
    // same cutoff the observer's rootMargin uses.
    const onScroll = () => {
      const ids2 = ids;
      const cutoff = window.innerHeight * 0.35;
      let bestId: string | null = null;
      let bestTop = -Infinity;
      for (const id of ids2) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= cutoff && top > bestTop) {
          bestTop = top;
          bestId = id;
        }
      }
      if (bestId) setActiveId(bestId);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [groups]);

  // Whenever the active row changes, keep it inside the SCROLL CONTAINER's
  // viewport — note that the scroll container is the `<nav>`'s parent
  // (the `<aside>` in api-docs.tsx, which has `overflow-y-auto`), not the
  // `<nav>` itself. Manual `scrollTo` on that container is unambiguous:
  // it only ever touches the rail, never the window.
  useEffect(() => {
    if (!activeId || !railRef.current) return;
    const nav = railRef.current;
    // Walk up the DOM until we find an element whose computed `overflow-y`
    // is `auto` or `scroll`. That's the scroll container; the `<nav>` itself
    // has `overflow: visible` so its bounding rect spans 2000px+ and a
    // naive "is the row visible?" check against `nav` would always pass.
    let scrollContainer: HTMLElement | null = nav.parentElement;
    while (scrollContainer) {
      const oy = window.getComputedStyle(scrollContainer).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scrollContainer = scrollContainer.parentElement;
    }
    if (!scrollContainer) return;

    const row = nav.querySelector(`[data-rail-id="${activeId}"]`);
    if (!(row instanceof HTMLElement)) return;

    // Visibility check, using the container's rect (not the nav's).
    const containerRect = scrollContainer.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top >= containerRect.top + 8 && rowRect.bottom <= containerRect.bottom - 8) {
      return;
    }

    // Compute the row's position relative to the scroll container.
    // `offsetTop` chains through positioned ancestors and can lie when
    // sticky/relative wrappers sit between the nav and the container, so
    // we use bounding rects + the container's current scrollTop instead —
    // that's invariant under whichever positioning the parent uses.
    const rowOffsetWithinContainer = rowRect.top - containerRect.top + scrollContainer.scrollTop;
    const target = rowOffsetWithinContainer - scrollContainer.clientHeight / 3;
    scrollContainer.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeId]);

  return (
    <nav ref={railRef} className="text-sm font-mono">
      {/* Search — sticky to the top of the rail's scroll container so the
       * input stays in view as the endpoint list scrolls below it. Cmd-K
       * focuses; Esc clears + blurs. The input visually replaces the
       * "on this page" label rendered by the parent above the rail. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const hash = firstHash(filteredGroups);
          if (hash) {
            window.location.hash = hash;
            setQuery("");
            inputRef.current?.blur();
          }
        }}
        className="sticky top-0 z-10 -mx-1 px-1 pb-3 mb-2 bg-canvas"
      >
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary/60 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search endpoints"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search endpoints"
            /* The global `/` and `⌘K` shortcuts in root.client.tsx look
             * for this attribute. When present (i.e. on /docs), `/` focuses
             * this input instead of opening the global Spotlight. */
            data-docs-search="true"
            className="w-full pl-8 pr-12 py-1.5 text-[12px] bg-surface-secondary border border-border rounded text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          />
          <kbd
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-text-secondary/60 border border-border rounded px-1 py-0.5 leading-none pointer-events-none"
            aria-hidden="true"
          >
            ⌘K
          </kbd>
        </div>
      </form>

      {filteredGroups.length === 0 && query.trim() && (
        <p className="text-[11px] text-text-secondary px-1 py-2">
          no matches for <span className="text-text-primary">{query}</span>
        </p>
      )}

      <div className="space-y-4">
        {filteredGroups.map((group, gIdx) => {
          const isEndpointGroup = group.kind === "endpoints";
          const groupHeaderActive =
            isEndpointGroup &&
            // Group header is "active" only when no endpoint inside it is
            // already the active row — prevents the dual-highlight diluting
            // the active state (auditor caught this).
            activeId === group.sectionHref.replace(/^#/, "") &&
            !group.endpoints.some((ep) => ep.slug === activeId);

          const headerNode = (
            <h3
              className={`text-[10px] uppercase tracking-[0.14em] mb-1 pt-2 ${
                gIdx > 0 ? "border-t border-border-muted" : ""
              } ${
                isEndpointGroup
                  ? groupHeaderActive
                    ? "text-text-primary font-semibold"
                    : "text-text-primary font-semibold"
                  : "text-text-secondary font-semibold"
              }`}
            >
              {isEndpointGroup ? (
                <a
                  href={group.sectionHref}
                  data-rail-id={group.sectionHref.replace(/^#/, "")}
                  aria-current={groupHeaderActive ? "location" : undefined}
                  className="block py-0.5 hover:text-accent no-underline hover:no-underline transition-colors"
                >
                  {group.title}
                </a>
              ) : (
                <>{group.title}</>
              )}
            </h3>
          );

          return (
            <div key={group.title}>
              {headerNode}
              <ul className="space-y-0">
                {group.kind === "links"
                  ? group.links.map((link) => {
                      const id = link.href.replace(/^#/, "");
                      const isActive = activeId === id;
                      return (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            data-rail-id={id}
                            aria-current={isActive ? "location" : undefined}
                            className={`block py-1 pl-2 -ml-px border-l-[3px] text-xs no-underline hover:no-underline transition-colors ${
                              isActive
                                ? "border-accent text-accent font-medium bg-accent/8"
                                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-muted"
                            }`}
                          >
                            · {link.label}
                          </a>
                        </li>
                      );
                    })
                  : group.endpoints.map((ep) => {
                      const isActive = activeId === ep.slug;
                      return (
                        <li key={ep.slug}>
                          <a
                            href={`#${ep.slug}`}
                            data-rail-id={ep.slug}
                            aria-current={isActive ? "location" : undefined}
                            title={`${ep.method} ${ep.path}`}
                            className={`flex gap-2 py-1 pl-2 -ml-px border-l-[3px] text-[11px] leading-snug no-underline hover:no-underline transition-colors ${
                              isActive
                                ? "border-accent bg-accent/8"
                                : "border-transparent hover:border-border-muted hover:bg-surface-secondary/50"
                            }`}
                          >
                            {/* Method tag — fixed 48px column. DELETE (6 chars)
                             * still fits at this font-size and the tighter
                             * column reclaims dead space across 47 rows. */}
                            <span className={`shrink-0 w-12 ${METHOD_CLASS[ep.method]}`}>
                              {ep.method}
                            </span>
                            {/* Path. Params like `:owner` get an amber tint so
                             * the literal segments and variables are visually
                             * separable on long paths. */}
                            <span
                              className={`break-all ${
                                isActive ? "text-text-primary font-medium" : "text-text-secondary"
                              }`}
                            >
                              {renderPath(ep.path, isActive)}
                            </span>
                          </a>
                        </li>
                      );
                    })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Tokenize an API path so colon-prefixed params (`:owner`, `:repo`,
 * `:ref+`, `:number`) render distinct from literal segments. Pierre/Stripe
 * both do this — it makes long paths instantly readable.
 */
function renderPath(path: string, active: boolean) {
  // Split on slash boundaries but keep the slashes. Then re-tokenize each
  // segment for `:param` vs literal.
  const segments = path.split(/(\/)/).filter(Boolean);
  return segments.map((seg, i) => {
    if (seg === "/") {
      return (
        <span key={i} className="opacity-40">
          /
        </span>
      );
    }
    if (seg.startsWith(":")) {
      return (
        <span key={i} className={active ? "text-accent" : "text-accent/80"}>
          {seg}
        </span>
      );
    }
    return <span key={i}>{seg}</span>;
  });
}
