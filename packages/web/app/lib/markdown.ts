import { createHash } from "node:crypto";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// LRU cache for rendered markdown (max 100 entries)
const MD_CACHE_MAX = 100;
const mdCache = new Map<string, string>();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // strip non-word chars except whitespace and dashes
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Walks the rendered HTML and:
 *  - Adds id="<slug>" + a trailing `<a class="heading-anchor" href="#slug">` to every <h1>..<h6>.
 *  - Deduplicates collisions with a running `-1`, `-2`, ... suffix so the same heading
 *    text appearing twice still resolves to a unique anchor.
 *  - Appends a plain `<button data-md-copy>` to every <pre> so client-side delegation
 *    can wire it up to the clipboard. No inline handler — the markdown stays cacheable
 *    and the runtime cost is paid once at mount.
 *
 * Implemented as a regex pass rather than a full DOM walk because (a) the input has
 * already been sanitized by DOMPurify, so we control the tag set, and (b) we don't
 * want to pay for a JSDOM-style parse on every render. The expressions are
 * intentionally narrow so they don't match nested or malformed structures.
 */
function postProcessHtml(html: string): string {
  const counts = new Map<string, number>();
  const heading = /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/g;
  let result = html.replace(heading, (_full, tag: string, attrs: string, inner: string) => {
    // Compute slug from the inner text (strip tags).
    const text = inner.replace(/<[^>]+>/g, "").trim();
    const base = slugify(text) || "section";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const slug = seen === 0 ? base : `${base}-${seen}`;

    // If the heading already has an id attribute, don't override it.
    const hasId = /\sid\s*=/.test(attrs);
    const newAttrs = hasId ? attrs : `${attrs} id="${slug}"`;
    const anchor = `<a class="heading-anchor" href="#${slug}" aria-label="Permalink: ${text.replace(/"/g, "&quot;")}">#</a>`;
    return `<${tag}${newAttrs}>${inner}${anchor}</${tag}>`;
  });

  // Append a copy button to every <pre> block. We place it INSIDE so the wrapper
  // markup stays a single element (works inside lists, blockquotes, etc.).
  result = result.replace(/<pre>([\s\S]*?)<\/pre>/g, (_m, inner: string) => {
    const button = `<button type="button" data-md-copy aria-label="Copy code">Copy</button>`;
    return `<pre>${inner}${button}</pre>`;
  });

  return result;
}

export function renderMarkdown(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  const cached = mdCache.get(hash);
  if (cached) {
    // Move to end for LRU behavior
    mdCache.delete(hash);
    mdCache.set(hash, cached);
    return cached;
  }

  const raw = marked.parse(content, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "a",
      "strong",
      "em",
      "del",
      "s",
      "mark",
      "sup",
      "sub",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "img",
      "figure",
      "figcaption",
      "div",
      "span",
      "details",
      "summary",
      "input",
      "button",
    ],
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "class",
      "id",
      "type",
      "checked",
      "disabled",
      "align",
      "colspan",
      "rowspan",
      "aria-label",
      "data-md-copy",
    ],
    ALLOW_DATA_ATTR: false,
  });

  // Post-process AFTER sanitization so we can inject anchors/buttons that
  // would otherwise be stripped (DOMPurify drops <button data-md-copy> by
  // default once we add it before sanitization).
  const result = postProcessHtml(sanitized);

  // Evict oldest entry if cache is full
  if (mdCache.size >= MD_CACHE_MAX) {
    const oldest = mdCache.keys().next().value!;
    mdCache.delete(oldest);
  }
  mdCache.set(hash, result);

  return result;
}
