import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_MODULE_ID = "virtual:search-index";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

interface SearchEntry {
  id: string;
  title: string;
  path: string;
  content: string;
  section: string;
}

function stripMdx(raw: string): { title: string; content: string } {
  const lines = raw.split("\n");
  let title = "";
  let inImport = false;
  const contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip import statements
    if (trimmed.startsWith("import ")) {
      inImport = true;
      if (trimmed.includes(" from ") || trimmed.endsWith(";")) inImport = false;
      continue;
    }
    if (inImport) {
      if (trimmed.includes(" from ") || trimmed.endsWith(";")) inImport = false;
      continue;
    }

    // Skip JSX tags (component usage)
    if (trimmed.startsWith("<") && !trimmed.startsWith("<http")) continue;

    // Extract title from first heading
    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match && !title) {
      title = h1Match[1];
      contentLines.push(h1Match[1]);
      continue;
    }

    // Strip markdown formatting but keep text
    const cleaned = trimmed
      .replace(/^#{1,6}\s+/, "") // headings
      .replace(/\*\*(.+?)\*\*/g, "$1") // bold
      .replace(/\*(.+?)\*/g, "$1") // italic
      .replace(/`(.+?)`/g, "$1") // inline code
      .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
      .replace(/!\[.*?\]\(.+?\)/g, ""); // images

    if (cleaned) contentLines.push(cleaned);
  }

  return { title: title || "Untitled", content: contentLines.join(" ").slice(0, 2000) };
}

async function findMdxFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMdxFiles(full)));
    } else if (entry.name.endsWith(".mdx")) {
      results.push(full);
    }
  }
  return results;
}

async function buildIndex(pagesDir: string): Promise<SearchEntry[]> {
  const files = await findMdxFiles(pagesDir);
  const entries: SearchEntry[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const { title, content } = stripMdx(raw);
    const rel = relative(pagesDir, file).replace(/\.mdx$/, "").replace(/\\/g, "/");
    const section = rel.includes("/") ? rel.split("/")[0] : "docs";

    entries.push({
      id: rel,
      title,
      path: `/${rel}`,
      content,
      section,
    });
  }

  return entries;
}

export function searchIndexPlugin(): Plugin {
  let pagesDir: string;

  return {
    name: "groffee-search-index",

    configResolved(config) {
      pagesDir = join(config.root, "src/pages");
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const entries = await buildIndex(pagesDir);
        return `export default ${JSON.stringify(entries)}`;
      }
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith(".mdx") && file.includes("pages")) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          return [mod];
        }
      }
    },
  };
}
