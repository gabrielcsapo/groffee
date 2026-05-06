"use server";

import { renderMarkdown } from "../markdown";

export async function previewMarkdown(text: string): Promise<{ html: string }> {
  if (typeof text !== "string") return { html: "" };
  // Cap input to 256 KB so previews stay quick.
  const capped = text.length > 256 * 1024 ? text.slice(0, 256 * 1024) : text;
  return { html: renderMarkdown(capped) };
}
