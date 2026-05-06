/**
 * Helpers for the search code-language facet.
 *
 * The previous implementation extracted extensions in SQLite via a brittle
 * SUBSTR + dot-counting trick that yielded substrings like ".lient.tsx" for
 * paths with multiple dots (e.g. `foo.client.tsx`). This module replaces
 * that with a correct lastIndexOf-based extraction in JS.
 *
 * We keep the facet keyed by raw extension (so the ext-LIKE filter in
 * `searchCode` keeps working) and let the client map the extension to a
 * display label via `extToLang` / `langDisplayName`.
 */

/**
 * Extract the extension from a file path (the part after the LAST `.`).
 * Returns null when the path has no extension or the dot is in a directory
 * name (e.g. `foo.dir/bar`).
 */
export function extractExtension(filePath: string): string | null {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const basename = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const lastDot = basename.lastIndexOf(".");
  if (lastDot <= 0) return null; // dotfiles like ".gitignore" → no extension
  const ext = basename.slice(lastDot + 1).toLowerCase();
  return ext || null;
}

/**
 * Aggregate (filePath, count) rows into raw-extension facets:
 *   1. Extract extension per row via `extractExtension`.
 *   2. Sum counts per extension.
 *   3. Sort by count desc and cap at `topN`.
 *
 * Caller side: `langDisplayName(facet.ext)` produces the user-facing label
 * ("TypeScript" for "ts", ".sed" for unknowns). Keeping `ext` as the raw
 * extension means the existing `?ext=ts` URL filter continues to work
 * unchanged.
 */
export function aggregateLanguageFacets(
  rows: Array<{ filePath: string; count: number }>,
  topN: number = 20,
): Array<{ ext: string; count: number }> {
  const byExt = new Map<string, number>();
  for (const row of rows) {
    const ext = extractExtension(row.filePath);
    if (!ext) continue;
    byExt.set(ext, (byExt.get(ext) ?? 0) + row.count);
  }
  return Array.from(byExt.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
