"use client";

import { useEffect, useRef, useState } from "react";

interface MarkdownCopyButtonsProps {
  /** Sanitized markdown HTML — set via dangerouslySetInnerHTML. */
  html: string;
  /** Outer wrapper className (e.g. `markdown-body px-6 py-5`). */
  className?: string;
}

/**
 * Mounts on a div that renders sanitized markdown HTML and:
 *   - Delegates clicks on `[data-md-copy]` buttons to copy the parent <pre>'s
 *     text content to the clipboard, with a transient "Copied!" tooltip.
 *
 * Heading anchors are baked into the HTML by `renderMarkdown` so they don't
 * require any client-side glue.
 *
 * The buttons themselves are emitted as plain HTML (no inline handler) by the
 * server-side renderer so the markdown stays cacheable and serializable.
 */
export function MarkdownCopyButtons({ html, className }: MarkdownCopyButtonsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest("[data-md-copy]") as HTMLButtonElement | null;
      if (!btn) return;
      ev.preventDefault();

      // Find the closest <pre>. The button is appended INSIDE the <pre> as the
      // last element, so use closest("pre") which matches the button's ancestor.
      const pre = btn.closest("pre");
      if (!pre) return;

      // Copy the text content of the <code> child (or of the <pre> as a fallback),
      // excluding the button text we appended.
      const code = pre.querySelector("code");
      const textSource = code ?? pre;
      // Walk children, skipping the copy button.
      let text = "";
      const walker = document.createTreeWalker(textSource, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = (node as Text).parentElement;
          if (parent?.closest("[data-md-copy]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let n: Node | null = walker.nextNode();
      while (n) {
        text += (n as Text).data;
        n = walker.nextNode();
      }

      const rect = btn.getBoundingClientRect();
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 4, visible: true });
          setTimeout(() => setTooltip((t) => ({ ...t, visible: false })), 1500);
        })
        .catch(() => {
          // Best effort — clipboard may be unavailable in some contexts.
        });
    }

    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [html]);

  return (
    <>
      <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
      {tooltip.visible && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full px-2 py-1 rounded bg-black text-white text-xs pointer-events-none shadow"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          Copied!
        </div>
      )}
    </>
  );
}
