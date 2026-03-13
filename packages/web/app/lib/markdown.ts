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
  const result = DOMPurify.sanitize(raw, {
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
    ],
    ALLOW_DATA_ATTR: false,
  });

  // Evict oldest entry if cache is full
  if (mdCache.size >= MD_CACHE_MAX) {
    const oldest = mdCache.keys().next().value!;
    mdCache.delete(oldest);
  }
  mdCache.set(hash, result);

  return result;
}
