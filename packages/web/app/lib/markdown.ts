import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "blockquote", "pre", "code",
      "ul", "ol", "li", "dl", "dt", "dd",
      "a", "strong", "em", "del", "s", "mark", "sup", "sub",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
      "img", "figure", "figcaption",
      "div", "span", "details", "summary",
      "input",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id", "type", "checked", "disabled", "align", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
  });
}
