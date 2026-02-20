import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [], // load on demand
    });
  }
  return highlighterPromise;
}

export const extToLang: Record<string, string> = {
  // JavaScript / TypeScript
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  // Systems
  rs: "rust",
  go: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  zig: "zig",
  // JVM
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  // Scripting
  py: "python",
  rb: "ruby",
  php: "php",
  lua: "lua",
  pl: "perl",
  r: "r",
  // Functional
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  clj: "clojure",
  // Mobile
  swift: "swift",
  dart: "dart",
  // .NET
  cs: "csharp",
  fs: "fsharp",
  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  // Data / Config
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  ini: "ini",
  env: "dotenv",
  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  // Other
  md: "markdown",
  mdx: "mdx",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  tf: "hcl",
  hcl: "hcl",
  proto: "protobuf",
  cmake: "cmake",
};

const filenameToLang: Record<string, string> = {
  Makefile: "makefile",
  Dockerfile: "dockerfile",
  Containerfile: "dockerfile",
  "CMakeLists.txt": "cmake",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
  ".bashrc": "bash",
  ".zshrc": "bash",
  ".env": "dotenv",
  ".env.local": "dotenv",
};

export function getLangFromFilename(filename: string): string | null {
  if (filenameToLang[filename]) return filenameToLang[filename];
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return extToLang[ext] ?? null;
}

const MAX_HIGHLIGHT_LINES = 5000;

/**
 * Extracts per-line inner HTML from shiki's codeToHtml output.
 * Returns an array of HTML strings (one per line), or null on failure.
 */
function extractLines(html: string): string[] | null {
  // shiki wraps each line in <span class="line">...</span>
  // \s* handles newlines/whitespace shiki places between </span> and next <span class="line">
  const lineRegex = /<span class="line">([\s\S]*?)<\/span>\s*(?=<span class="line">|<\/code>)/g;
  const lines: string[] = [];
  let match;
  while ((match = lineRegex.exec(html)) !== null) {
    lines.push(match[1]);
  }
  // Fallback: try splitting by newlines within <code>
  if (lines.length === 0) {
    const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
    if (!codeMatch) return null;
    return codeMatch[1]
      .split("\n")
      .map((l) => l.replace(/^<span class="line">/, "").replace(/<\/span>$/, ""));
  }
  return lines;
}

async function doHighlight(code: string, lang: string): Promise<string[] | null> {
  try {
    const highlighter = await getHighlighter();
    const loaded = highlighter.getLoadedLanguages();
    if (!loaded.includes(lang as BundledLanguage)) {
      await highlighter.loadLanguage(lang as BundledLanguage);
    }
    const html = highlighter.codeToHtml(code, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
    });
    return extractLines(html);
  } catch {
    return null;
  }
}

/**
 * Highlights file content and returns per-line HTML strings.
 * Returns null if the language isn't supported or highlighting fails.
 */
export async function highlightCode(code: string, lang: string): Promise<string[] | null> {
  const lineCount = code.split("\n").length;
  if (lineCount > MAX_HIGHLIGHT_LINES) return null;
  return doHighlight(code, lang);
}

interface DiffHunk {
  lines: string[];
}

/**
 * Highlights an FTS5 search snippet while preserving <mark> tags.
 * Returns highlighted HTML string or null if language isn't supported.
 */
export async function highlightSearchSnippet(
  snippet: string,
  filePath: string,
): Promise<string | null> {
  const filename = filePath.split("/").pop() || filePath;
  const lang = getLangFromFilename(filename);
  if (!lang) return null;

  // Strip <mark>/<\/mark> tags, recording their text positions
  const marks: { start: number; end: number }[] = [];
  let cleanText = "";
  let remaining = snippet;

  while (remaining.length > 0) {
    const markStart = remaining.indexOf("<mark>");
    if (markStart === -1) {
      cleanText += remaining;
      break;
    }
    cleanText += remaining.slice(0, markStart);
    remaining = remaining.slice(markStart + 6);

    const markEnd = remaining.indexOf("</mark>");
    if (markEnd === -1) {
      cleanText += remaining;
      break;
    }
    const textStart = cleanText.length;
    cleanText += remaining.slice(0, markEnd);
    marks.push({ start: textStart, end: cleanText.length });
    remaining = remaining.slice(markEnd + 7);
  }

  if (cleanText.trim().length === 0) return null;

  const lines = await doHighlight(cleanText, lang);
  if (!lines) return null;

  const highlightedHtml = lines.join("\n");
  return insertMarksIntoHtml(highlightedHtml, marks);
}

/**
 * Inserts <mark> tags at correct text positions within Shiki-highlighted HTML.
 * Skips over HTML tags and handles entities as single characters.
 */
function insertMarksIntoHtml(
  html: string,
  marks: { start: number; end: number }[],
): string {
  if (marks.length === 0) return html;

  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let result = "";
  let textPos = 0;
  let markIdx = 0;
  let inMark = false;
  let i = 0;

  while (i < html.length) {
    // Open mark at current text position
    if (!inMark && markIdx < sorted.length && textPos === sorted[markIdx].start) {
      result += "<mark>";
      inMark = true;
    }
    // Close mark at current text position
    if (inMark && markIdx < sorted.length && textPos === sorted[markIdx].end) {
      result += "</mark>";
      inMark = false;
      markIdx++;
      if (markIdx < sorted.length && textPos === sorted[markIdx].start) {
        result += "<mark>";
        inMark = true;
      }
    }

    if (html[i] === "<") {
      // HTML tag — copy verbatim, no text position advance
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        result += html.slice(i);
        break;
      }
      result += html.slice(i, tagEnd + 1);
      i = tagEnd + 1;
    } else if (html[i] === "&") {
      // HTML entity — counts as 1 text character
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i < 10) {
        result += html.slice(i, semi + 1);
        i = semi + 1;
      } else {
        result += html[i];
        i++;
      }
      textPos++;
    } else {
      result += html[i];
      i++;
      textPos++;
    }
  }

  // Close any trailing marks
  if (!inMark && markIdx < sorted.length && textPos === sorted[markIdx].start) {
    result += "<mark>";
    inMark = true;
  }
  if (inMark) result += "</mark>";

  return result;
}

/**
 * Highlights diff hunks and returns a Map of "hunkIdx-lineIdx" → highlighted HTML.
 * Reconstructs new-side and old-side code for accurate cross-line tokenization.
 */
export async function highlightDiffLines(
  hunks: DiffHunk[],
  lang: string,
): Promise<Map<string, string> | null> {
  const newEntries: { hunkIdx: number; lineIdx: number }[] = [];
  const oldEntries: { hunkIdx: number; lineIdx: number }[] = [];
  const newCodeLines: string[] = [];
  const oldCodeLines: string[] = [];

  for (let hi = 0; hi < hunks.length; hi++) {
    for (let li = 0; li < hunks[hi].lines.length; li++) {
      const line = hunks[hi].lines[li];
      const prefix = line[0];
      const text = line.slice(1);

      if (prefix === " " || prefix === "+") {
        newEntries.push({ hunkIdx: hi, lineIdx: li });
        newCodeLines.push(text);
      }
      if (prefix === " " || prefix === "-") {
        oldEntries.push({ hunkIdx: hi, lineIdx: li });
        oldCodeLines.push(text);
      }
    }
  }

  const totalLines = newCodeLines.length + oldCodeLines.length;
  if (totalLines > MAX_HIGHLIGHT_LINES) return null;

  const [newHL, oldHL] = await Promise.all([
    newCodeLines.length > 0 ? doHighlight(newCodeLines.join("\n"), lang) : null,
    oldCodeLines.length > 0 ? doHighlight(oldCodeLines.join("\n"), lang) : null,
  ]);

  const lineMap = new Map<string, string>();

  // Map new-side (context + added lines)
  if (newHL) {
    newEntries.forEach((entry, i) => {
      if (newHL[i] != null) {
        lineMap.set(`${entry.hunkIdx}-${entry.lineIdx}`, newHL[i]);
      }
    });
  }

  // Map old-side (deleted lines only — context already covered by new-side)
  if (oldHL) {
    oldEntries.forEach((entry, i) => {
      const key = `${entry.hunkIdx}-${entry.lineIdx}`;
      if (oldHL[i] != null && !lineMap.has(key)) {
        lineMap.set(key, oldHL[i]);
      }
    });
  }

  return lineMap.size > 0 ? lineMap : null;
}
