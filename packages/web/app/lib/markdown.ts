import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Render markdown content to HTML string.
 * Uses GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks).
 */
export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string;
}
