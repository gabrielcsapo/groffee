import { BrowserChrome } from "./browser-chrome";

interface DiffLine {
  kind: "add" | "remove" | "context" | "hunk";
  oldNum?: number;
  newNum?: number;
  text: string;
}

const lines: DiffLine[] = [
  { kind: "hunk", text: "@@ -12,7 +12,9 @@ export function loadConfig() {" },
  { kind: "context", oldNum: 12, newNum: 12, text: "  const port = env.PORT ?? 3000;" },
  { kind: "context", oldNum: 13, newNum: 13, text: "  const sshPort = env.SSH_PORT ?? 2223;" },
  { kind: "remove", oldNum: 14, text: "  const externalUrl = env.EXTERNAL_URL;" },
  {
    kind: "add",
    newNum: 14,
    text: "  const externalUrl = env.EXTERNAL_URL ?? `http://localhost:${port}`;",
  },
  { kind: "add", newNum: 15, text: "  const dataDir = env.DATA_DIR ?? './data';" },
  { kind: "context", oldNum: 15, newNum: 16, text: "" },
  { kind: "context", oldNum: 16, newNum: 17, text: "  return { port, sshPort, externalUrl };" },
  { kind: "remove", oldNum: 17, text: "}" },
  { kind: "add", newNum: 18, text: "  return { port, sshPort, externalUrl, dataDir };" },
  { kind: "add", newNum: 19, text: "}" },
];

function lineClass(kind: DiffLine["kind"]) {
  switch (kind) {
    case "add":
      return "bg-success/10";
    case "remove":
      return "bg-error/10";
    case "hunk":
      return "bg-surface-secondary text-text-secondary";
    default:
      return "";
  }
}

function gutterChar(kind: DiffLine["kind"]) {
  if (kind === "add") return "+";
  if (kind === "remove") return "-";
  return " ";
}

export function MockDiffView() {
  return (
    <BrowserChrome url="groffee.example.com/gabrielcsapo/groffee/pull/12/files">
      <div className="bg-surface">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs">
          <svg
            className="w-4 h-4 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="font-mono text-text-primary">packages/web/src/config.ts</span>
          <span className="ml-auto text-success">+3</span>
          <span className="text-error">−2</span>
        </div>
        <div className="font-mono text-xs">
          {lines.map((l, i) => (
            <div key={i} className={`flex ${lineClass(l.kind)}`}>
              <span className="w-10 shrink-0 text-right pr-2 text-text-secondary select-none">
                {l.oldNum ?? ""}
              </span>
              <span className="w-10 shrink-0 text-right pr-2 text-text-secondary select-none">
                {l.newNum ?? ""}
              </span>
              <span className="w-4 shrink-0 text-text-secondary select-none">
                {gutterChar(l.kind)}
              </span>
              <span className="flex-1 whitespace-pre text-text-primary py-0.5">{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}
