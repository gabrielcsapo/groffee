/**
 * Tiny ANSI-escape → HTML converter.
 *
 * Handles the core 16 colors + bright variants (foreground & background) and
 * the bold/dim/italic/underline attributes. Anything else (256-color,
 * truecolor, cursor positioning, screen clears) is silently stripped so it
 * never bleeds into HTML.
 *
 * The returned HTML uses `<span class="ansi-...">` markup so the doc styles
 * decide the actual color values; that keeps light/dark mode working.
 *
 * Important: callers must HTML-escape input BEFORE invoking this so that
 * `<`, `>`, `&` in the raw log content can't smuggle markup through. We do
 * not escape here on the assumption that the caller already did.
 */

const FG_BASE: Record<number, string> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
};

const BG_BASE: Record<number, string> = {
  40: "black",
  41: "red",
  42: "green",
  43: "yellow",
  44: "blue",
  45: "magenta",
  46: "cyan",
  47: "white",
};

interface AnsiState {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

function newState(): AnsiState {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
  };
}

function classFromState(state: AnsiState): string {
  const parts: string[] = [];
  if (state.fg) parts.push(`ansi-fg-${state.fg}`);
  if (state.bg) parts.push(`ansi-bg-${state.bg}`);
  if (state.bold) parts.push("ansi-bold");
  if (state.dim) parts.push("ansi-dim");
  if (state.italic) parts.push("ansi-italic");
  if (state.underline) parts.push("ansi-underline");
  return parts.join(" ");
}

function applySgr(state: AnsiState, codes: number[]): AnsiState {
  // No params is the same as `0` (reset) per the spec.
  if (codes.length === 0) codes = [0];

  const next = { ...state };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) {
      next.fg = null;
      next.bg = null;
      next.bold = false;
      next.dim = false;
      next.italic = false;
      next.underline = false;
    } else if (c === 1) {
      next.bold = true;
    } else if (c === 2) {
      next.dim = true;
    } else if (c === 3) {
      next.italic = true;
    } else if (c === 4) {
      next.underline = true;
    } else if (c === 22) {
      next.bold = false;
      next.dim = false;
    } else if (c === 23) {
      next.italic = false;
    } else if (c === 24) {
      next.underline = false;
    } else if (c === 39) {
      next.fg = null;
    } else if (c === 49) {
      next.bg = null;
    } else if (FG_BASE[c]) {
      next.fg = FG_BASE[c];
    } else if (BG_BASE[c]) {
      next.bg = BG_BASE[c];
    } else if (c >= 90 && c <= 97) {
      next.fg = `bright-${FG_BASE[c - 60]}`;
    } else if (c >= 100 && c <= 107) {
      next.bg = `bright-${BG_BASE[c - 60]}`;
    } else if (c === 38 || c === 48) {
      // 256-color or true-color — skip the param payload.
      const mode = codes[i + 1];
      if (mode === 5) {
        i += 2; // skip mode + index
      } else if (mode === 2) {
        i += 4; // skip mode + r + g + b
      } else {
        i += 1;
      }
    }
    // Unknown codes are silently ignored.
  }
  return next;
}

// Build regexes via `new RegExp` so the source code carries no inline control
// bytes (which oxlint flags as `no-control-regex`). The compiled regexes are
// identical to the literal forms.
const ESC = "";
const BEL = "";
// Matches CSI `ESC [ ... <final>` sequences. We extract only `m` (SGR);
// every other terminator is consumed and dropped.
const CSI_RE = new RegExp(`${ESC}\\[([0-9;?]*)([@-~])`, "g");
// OSC (`ESC ] ... BEL` or `ESC ] ... ESC \`), DCS/PM/APC/SOS (`ESC P|X|^|_`),
// and charset designators (`ESC ( X` / `ESC ) X`). All dropped.
const OTHER_ESC_RE = new RegExp(
  `${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|${ESC}[PX^_][^${ESC}]*?(?:${ESC}\\\\|$)|${ESC}[()][\\x20-\\x7e]`,
  "g",
);

/**
 * Convert ANSI-escaped text to HTML. Caller must pre-escape <, >, & in the
 * source text — we only emit `<span>` tags for color/styling, never any
 * other markup, so user content cannot inject new tags.
 */
export function ansiToHtml(input: string): string {
  if (!input) return "";

  // First strip non-CSI escapes so they don't pass through as garbage.
  const sanitized = input.replace(OTHER_ESC_RE, "");

  let out = "";
  let state = newState();
  let openSpan = false;
  let lastIdx = 0;

  function closeSpan() {
    if (openSpan) {
      out += "</span>";
      openSpan = false;
    }
  }
  function openSpanIfNeeded() {
    const cls = classFromState(state);
    if (cls) {
      out += `<span class="${cls}">`;
      openSpan = true;
    }
  }

  CSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSI_RE.exec(sanitized)) !== null) {
    if (match.index > lastIdx) {
      out += sanitized.slice(lastIdx, match.index);
    }
    lastIdx = CSI_RE.lastIndex;

    const final = match[2];
    if (final === "m") {
      const codes = match[1]
        .split(";")
        .filter((s) => s.length > 0)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));
      const nextState = applySgr(state, codes);
      // Re-emit a span only if the visible style changed.
      if (classFromState(nextState) !== classFromState(state)) {
        closeSpan();
        state = nextState;
        openSpanIfNeeded();
      } else {
        state = nextState;
      }
    }
    // Other CSI commands (cursor, erase, etc.) are dropped.
  }
  if (lastIdx < sanitized.length) {
    out += sanitized.slice(lastIdx);
  }
  closeSpan();
  return out;
}

/**
 * HTML-escape a string so it's safe to embed in HTML text content.
 * Use BEFORE calling ansiToHtml if your input is raw user-controlled text.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convenience: escape THEN ansi-to-html in the right order.
 */
export function safeAnsiToHtml(rawText: string): string {
  return ansiToHtml(escapeHtml(rawText));
}

/**
 * Parse a single log line that may have a leading ISO-8601 timestamp
 * followed by a TAB. Lines written before the timestamp-prefix change won't
 * match and are returned with `ts: null`.
 */
const TS_LINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\t(.*)$/;
export function splitTimestampedLine(line: string): { ts: string | null; content: string } {
  const m = TS_LINE_RE.exec(line);
  if (m) return { ts: m[1], content: m[2] };
  return { ts: null, content: line };
}

/**
 * Parse a whole log blob: split on newlines, peel timestamps, ANSI-convert
 * each line. Returns an array of { ts, html } per line.
 */
export interface LogCommand {
  severity: "error" | "warning" | "notice";
  message: string;
  file?: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  title?: string;
}

export interface LogLine {
  ts: string | null;
  html: string;
  command?: LogCommand;
}

// GitHub-Actions style workflow commands the CI runner may emit.
// Spec: `::name params::message` where params is comma-separated `key=value`
// pairs. The message may contain percent-encoded `%0A`/`%0D`/`%25` to embed
// newlines / carriage returns / literal `%` without breaking the line.
const WORKFLOW_CMD_RE = /^::(error|warning|notice)(?:\s+([^:]*))?::(.*)$/;

function decodeCommandPayload(s: string): string {
  // Order matters: decode %25 last so an actual `%0A` token isn't mangled by
  // an earlier `%25` → `%` substitution that would invent a new `%0A`.
  return s.replace(/%0A/g, "\n").replace(/%0D/g, "\r").replace(/%25/g, "%");
}

function parseWorkflowCommand(content: string): LogCommand | null {
  const m = WORKFLOW_CMD_RE.exec(content);
  if (!m) return null;
  const severity = m[1] as LogCommand["severity"];
  const rawParams = m[2] ?? "";
  const message = decodeCommandPayload(m[3] ?? "");
  const cmd: LogCommand = { severity, message };
  if (rawParams.trim()) {
    for (const pair of rawParams.split(",")) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const k = pair.slice(0, eq).trim();
      const v = decodeCommandPayload(pair.slice(eq + 1).trim());
      if (!v) continue;
      if (k === "file") cmd.file = v;
      else if (k === "line") {
        const n = parseInt(v, 10);
        if (!isNaN(n)) cmd.line = n;
      } else if (k === "col") {
        const n = parseInt(v, 10);
        if (!isNaN(n)) cmd.col = n;
      } else if (k === "endLine") {
        const n = parseInt(v, 10);
        if (!isNaN(n)) cmd.endLine = n;
      } else if (k === "endColumn") {
        const n = parseInt(v, 10);
        if (!isNaN(n)) cmd.endCol = n;
      } else if (k === "title") cmd.title = v;
    }
  }
  return cmd;
}

export function parseLogBlob(blob: string): LogLine[] {
  if (!blob) return [];
  // Drop the trailing empty line that a final `\n` produces (typical for
  // line-buffered output). Preserve internal blank lines.
  const lines = blob.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => {
    const { ts, content } = splitTimestampedLine(line);
    const command = parseWorkflowCommand(content);
    if (command) {
      // The visible HTML is just the decoded message (used as a fallback if
      // the renderer doesn't recognise the `command` field). Newlines in the
      // message become explicit `\n` characters; the renderer is responsible
      // for splitting them.
      return { ts, html: escapeHtml(command.message), command };
    }
    return { ts, html: safeAnsiToHtml(content) };
  });
}
