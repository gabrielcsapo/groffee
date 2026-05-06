"use client";

import { useCallback, useRef, useState } from "react";
import { previewMarkdown } from "../lib/server/markdown-preview";

interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  name?: string;
}

type Tab = "write" | "preview";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

interface ToolbarButton {
  label: string;
  title: string;
  apply: (sel: { before: string; selected: string; after: string }) => {
    text: string;
    cursorStart: number;
    cursorEnd: number;
  };
}

const TOOLBAR: ToolbarButton[] = [
  {
    label: "B",
    title: "Bold (wrap with **)",
    apply: ({ before, selected, after }) => {
      const inner = selected || "bold text";
      const text = `${before}**${inner}**${after}`;
      const start = before.length + 2;
      return { text, cursorStart: start, cursorEnd: start + inner.length };
    },
  },
  {
    label: "I",
    title: "Italic (wrap with _)",
    apply: ({ before, selected, after }) => {
      const inner = selected || "italic text";
      const text = `${before}_${inner}_${after}`;
      const start = before.length + 1;
      return { text, cursorStart: start, cursorEnd: start + inner.length };
    },
  },
  {
    label: "<>",
    title: "Code (wrap with `)",
    apply: ({ before, selected, after }) => {
      const inner = selected || "code";
      const isBlock = inner.includes("\n");
      if (isBlock) {
        const text = `${before}\n\`\`\`\n${inner}\n\`\`\`\n${after}`;
        const start = before.length + 5;
        return { text, cursorStart: start, cursorEnd: start + inner.length };
      }
      const text = `${before}\`${inner}\`${after}`;
      const start = before.length + 1;
      return { text, cursorStart: start, cursorEnd: start + inner.length };
    },
  },
  {
    label: "Link",
    title: "Link",
    apply: ({ before, selected, after }) => {
      const label = selected || "link text";
      const text = `${before}[${label}](https://)${after}`;
      const urlStart = before.length + label.length + 3;
      return { text, cursorStart: urlStart, cursorEnd: urlStart + 8 };
    },
  },
  {
    label: "List",
    title: "Bulleted list",
    apply: ({ before, selected, after }) => {
      const lines = (selected || "list item").split("\n");
      const inserted = lines.map((l) => `- ${l}`).join("\n");
      const prefix = before.endsWith("\n") || before.length === 0 ? "" : "\n";
      const text = `${before}${prefix}${inserted}${after}`;
      const start = before.length + prefix.length;
      return { text, cursorStart: start, cursorEnd: start + inserted.length };
    },
  },
  {
    label: '"',
    title: "Quote",
    apply: ({ before, selected, after }) => {
      const lines = (selected || "quote").split("\n");
      const inserted = lines.map((l) => `> ${l}`).join("\n");
      const prefix = before.endsWith("\n") || before.length === 0 ? "" : "\n";
      const text = `${before}${prefix}${inserted}${after}`;
      const start = before.length + prefix.length;
      return { text, cursorStart: start, cursorEnd: start + inserted.length };
    },
  },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 6,
  autoFocus,
  name,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const insertAtCursor = useCallback(
    (insertion: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        onChange(value + insertion);
        return;
      }
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? start;
      const next = value.slice(0, start) + insertion + value.slice(end);
      onChange(next);
      // Restore caret after the inserted content.
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        const cursor = start + insertion.length;
        t.setSelectionRange(cursor, cursor);
        t.focus();
      });
    },
    [value, onChange],
  );

  const applyToolbarAction = useCallback(
    (button: ToolbarButton) => {
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? value.length;
      const end = ta?.selectionEnd ?? start;
      const before = value.slice(0, start);
      const selected = value.slice(start, end);
      const after = value.slice(end);
      const result = button.apply({ before, selected, after });
      onChange(result.text);
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        t.setSelectionRange(result.cursorStart, result.cursorEnd);
        t.focus();
      });
    },
    [value, onChange],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<{ url: string; filename: string } | null> => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setUploadError(
          `Skipped ${file.name || "file"}: unsupported type ${file.type || "unknown"}`,
        );
        return null;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setUploadError(data?.error || `Upload failed (${res.status})`);
          return null;
        }
        const data = (await res.json()) as { url: string; filename: string };
        return { url: data.url, filename: data.filename };
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        return null;
      }
    },
    [],
  );

  const uploadAndInsert = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadError(null);
      setUploading((n) => n + files.length);
      try {
        for (const file of files) {
          const result = await uploadFile(file);
          if (result) {
            const altBase = (result.filename || file.name || "image").replace(/\.[^.]+$/, "");
            const md = `![${altBase}](${result.url})`;
            insertAtCursor(`${md}\n`);
          }
          setUploading((n) => Math.max(0, n - 1));
        }
      } finally {
        setUploading(0);
      }
    },
    [uploadFile, insertAtCursor],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) uploadAndInsert(files);
    },
    [uploadAndInsert],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items || []);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        uploadAndInsert(files);
      }
    },
    [uploadAndInsert],
  );

  const handleSelectTab = useCallback(
    async (next: Tab) => {
      setTab(next);
      if (next === "preview") {
        if (!value.trim()) {
          setPreviewHtml("");
          return;
        }
        setPreviewLoading(true);
        try {
          const res = await previewMarkdown(value);
          setPreviewHtml(res.html);
        } catch {
          setPreviewHtml("");
        } finally {
          setPreviewLoading(false);
        }
      }
    },
    [value],
  );

  const rows = Math.max(minRows, 4);

  return (
    <div className="border border-border rounded-md bg-surface focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
      <div className="flex items-center justify-between border-b border-border px-2 py-1 gap-2">
        <div className="flex">
          <button
            type="button"
            onClick={() => handleSelectTab("write")}
            className={`px-3 py-1 text-xs font-medium rounded ${
              tab === "write"
                ? "bg-surface-secondary text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab("preview")}
            className={`px-3 py-1 text-xs font-medium rounded ${
              tab === "preview"
                ? "bg-surface-secondary text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Preview
          </button>
        </div>
        {tab === "write" && (
          <div className="flex items-center gap-1">
            {TOOLBAR.map((btn) => (
              <button
                key={btn.label}
                type="button"
                title={btn.title}
                onClick={() => applyToolbarAction(btn)}
                className="px-2 py-1 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "write" ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            rows={rows}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`w-full px-3 py-2 bg-surface text-sm font-mono focus:outline-none resize-y min-h-[6rem] rounded-b-md ${
              dragActive ? "ring-2 ring-primary ring-inset" : ""
            }`}
          />
          {(uploading > 0 || uploadError) && (
            <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1 pointer-events-none">
              {uploading > 0 && (
                <span className="px-2 py-1 text-xs rounded bg-surface-secondary border border-border text-text-secondary shadow-sm">
                  Uploading{uploading > 1 ? ` (${uploading})` : ""}...
                </span>
              )}
              {uploadError && (
                <span className="px-2 py-1 text-xs rounded bg-danger-bg border border-danger/30 text-danger shadow-sm pointer-events-auto">
                  {uploadError}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="markdown-body px-3 py-2 text-sm min-h-[6rem]"
          style={{ minHeight: `${rows * 1.5}rem` }}
        >
          {previewLoading ? (
            <span className="text-text-secondary text-xs">Rendering preview...</span>
          ) : previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <span className="text-text-secondary italic text-xs">Nothing to preview.</span>
          )}
        </div>
      )}
    </div>
  );
}

export default MarkdownEditor;
