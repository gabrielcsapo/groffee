"use client";

import { useState, useRef } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EXT_NAMES: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript JSX", ".js": "JavaScript", ".jsx": "JavaScript JSX",
  ".py": "Python", ".rb": "Ruby", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
  ".swift": "Swift", ".c": "C", ".cpp": "C++", ".h": "C/C++ Header", ".cs": "C#", ".php": "PHP",
  ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".less": "Less", ".vue": "Vue", ".svelte": "Svelte",
  ".json": "JSON", ".yaml": "YAML", ".yml": "YAML", ".toml": "TOML", ".xml": "XML",
  ".md": "Markdown", ".mdx": "MDX", ".sql": "SQL", ".sh": "Shell", ".bash": "Bash",
  ".lock": "Lock file", ".svg": "SVG", ".wasm": "WebAssembly", ".zig": "Zig",
  ".ex": "Elixir", ".lua": "Lua", ".r": "R", ".dart": "Dart", ".scala": "Scala",
  ".graphql": "GraphQL", ".proto": "Protocol Buffers",
};

const LANG_COLORS = [
  "var(--color-primary)", "var(--color-success)", "var(--color-warning)",
  "var(--color-danger)", "var(--color-merged)", "var(--color-info)", "#e0913e", "#6b8e9b",
];

// Shared tooltip component
function Tooltip({ text, x, y, containerRef }: { text: string; x: number; y: number; containerRef: React.RefObject<HTMLDivElement | null> }) {
  if (!containerRef.current) return null;
  return (
    <div
      className="absolute pointer-events-none z-10 px-2.5 py-1.5 text-xs rounded-md border border-border bg-surface text-text-primary shadow-md whitespace-nowrap"
      style={{ left: x, top: y - 36, transform: "translateX(-50%)" }}
    >
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 1. Commit Punchcard (day-of-week × hour-of-day)
// ─────────────────────────────────────────────────

interface PunchcardData { day: number; hour: number; count: number }

export function CommitPunchcard({ data }: { data: PunchcardData[] }) {
  const [hovered, setHovered] = useState<{ day: number; hour: number; count: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...data.map((d) => d.count));

  const lookup = new Map<string, number>();
  for (const d of data) lookup.set(`${d.day}-${d.hour}`, d.count);

  const labelWidth = 36;
  const topPadding = 24;
  const cellSize = 28;
  const maxRadius = 11;
  const svgWidth = labelWidth + 24 * cellSize;
  const svgHeight = topPadding + 7 * cellSize + 8;

  function formatHour(h: number) {
    return h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  }

  return (
    <div className="overflow-x-auto relative" ref={containerRef}>
      {hovered && (
        <Tooltip
          text={`${hovered.count} commit${hovered.count !== 1 ? "s" : ""} on ${DAYS[hovered.day]} at ${formatHour(hovered.hour)}`}
          x={hovered.x} y={hovered.y} containerRef={containerRef}
        />
      )}
      <svg width={svgWidth} height={svgHeight} className="block" onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: 24 }, (_, h) => (
          <text key={`h-${h}`} x={labelWidth + h * cellSize + cellSize / 2} y={14} fontSize={9} fill="var(--color-text-secondary)" textAnchor="middle">
            {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
          </text>
        ))}
        {DAYS.map((dayName, d) => (
          <g key={`day-${d}`}>
            <text x={0} y={topPadding + d * cellSize + cellSize / 2 + 3} fontSize={10} fill="var(--color-text-secondary)">{dayName}</text>
            {Array.from({ length: 24 }, (_, h) => {
              const count = lookup.get(`${d}-${h}`) || 0;
              const ratio = count / max;
              const r = count > 0 ? Math.max(2, ratio * maxRadius) : 0;
              const cx = labelWidth + h * cellSize + cellSize / 2;
              const cy = topPadding + d * cellSize + cellSize / 2;
              const isHovered = hovered?.day === d && hovered?.hour === h;
              return (
                <circle
                  key={`${d}-${h}`}
                  cx={cx} cy={cy}
                  r={r === 0 ? cellSize / 2 : isHovered ? r + 2 : r}
                  fill={r === 0 ? "transparent" : "var(--color-primary)"}
                  opacity={r === 0 ? 0 : isHovered ? 1 : 0.2 + ratio * 0.8}
                  stroke={isHovered && r > 0 ? "var(--color-text-primary)" : "none"}
                  strokeWidth={1}
                  style={{ cursor: count > 0 ? "pointer" : "default", transition: "r 0.1s, opacity 0.1s" }}
                  onMouseEnter={() => count > 0 && setHovered({ day: d, hour: h, count, x: cx, y: cy })}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 2. Commit Velocity (weekly area chart)
// ─────────────────────────────────────────────────

interface WeekData { week: number; count: number }

export function CommitVelocity({ data }: { data: WeekData[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-6">No commit data available.</p>;
  }

  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const width = 600;
  const height = 180;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const yTicks = niceYTicks(maxCount);
  const yMax = yTicks[yTicks.length - 1];

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(1, data.length - 1)) * chartW,
    y: padding.top + chartH - (d.count / yMax) * chartH,
    week: d.week,
    count: d.count,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  const monthLabels: { label: string; x: number }[] = [];
  let lastMonth = -1;
  for (const p of points) {
    const m = new Date(p.week * 1000).getMonth();
    if (m !== lastMonth) { monthLabels.push({ label: MONTHS[m], x: p.x }); lastMonth = m; }
  }

  const hp = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="overflow-x-auto relative" ref={containerRef}>
      {hp && (
        <Tooltip
          text={`${hp.count} commit${hp.count !== 1 ? "s" : ""} · week of ${new Date(hp.week * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          x={(hp.x / width) * (containerRef.current?.clientWidth || width)}
          y={(hp.y / height) * ((containerRef.current?.clientWidth || width) * height / width)}
          containerRef={containerRef}
        />
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHoveredIdx(null)}>
        {yTicks.map((tick) => {
          const y = padding.top + chartH - (tick / yMax) * chartH;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--color-border-muted)" strokeWidth={0.5} />
              <text x={padding.left - 4} y={y + 3} fontSize={9} fill="var(--color-text-secondary)" textAnchor="end">{tick}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="var(--color-primary)" opacity={0.15} />
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} />

        {/* Vertical hover line */}
        {hp && (
          <>
            <line x1={hp.x} y1={padding.top} x2={hp.x} y2={padding.top + chartH} stroke="var(--color-border)" strokeWidth={0.5} strokeDasharray="3,3" />
            <circle cx={hp.x} cy={hp.y} r={4} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
          </>
        )}

        {/* Invisible hover targets */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - (chartW / data.length) / 2}
            y={padding.top}
            width={chartW / data.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {monthLabels.map((m, i) => (
          <text key={i} x={m.x} y={height - 4} fontSize={9} fill="var(--color-text-secondary)">{m.label}</text>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 3. Code Frequency (file changes per week)
// ─────────────────────────────────────────────────

interface FileFreqData { week: number; additions: number; modifications: number; deletions: number }

export function CodeFrequency({ data }: { data: FileFreqData[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-6">No file change data available.</p>;
  }

  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const width = 600;
  const height = 200;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxUp = Math.max(1, ...data.map((d) => d.additions + d.modifications));
  const maxDown = Math.max(1, ...data.map((d) => d.deletions));
  const yMax = Math.max(maxUp, maxDown);
  const yTicks = niceYTicks(yMax);
  const yScale = yTicks[yTicks.length - 1];

  const baseline = padding.top + chartH / 2;
  const halfH = chartH / 2;
  const gap = chartW / data.length;
  const barW = Math.max(1, gap * 0.7);

  const monthLabels: { label: string; x: number }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < data.length; i++) {
    const m = new Date(data[i].week * 1000).getMonth();
    if (m !== lastMonth) { monthLabels.push({ label: MONTHS[m], x: padding.left + i * gap }); lastMonth = m; }
  }

  const hd = hoveredIdx !== null ? data[hoveredIdx] : null;
  const hx = hoveredIdx !== null ? padding.left + hoveredIdx * gap + gap / 2 : 0;

  return (
    <div ref={containerRef}>
      <div className="flex items-center gap-4 mb-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--color-success)" }} /> Additions
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--color-primary)" }} /> Modifications
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--color-danger)" }} /> Deletions
        </span>
      </div>
      <div className="overflow-x-auto relative">
        {hd && (
          <Tooltip
            text={`+${hd.additions} ~${hd.modifications} -${hd.deletions} · week of ${new Date(hd.week * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            x={(hx / width) * (containerRef.current?.clientWidth || width)}
            y={(baseline / height) * ((containerRef.current?.clientWidth || width) * height / width) - 20}
            containerRef={containerRef}
          />
        )}
        <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHoveredIdx(null)}>
          <line x1={padding.left} y1={baseline} x2={width - padding.right} y2={baseline} stroke="var(--color-border)" strokeWidth={0.5} />
          <text x={padding.left - 4} y={baseline + 3} fontSize={9} fill="var(--color-text-secondary)" textAnchor="end">0</text>
          <text x={padding.left - 4} y={padding.top + 3} fontSize={9} fill="var(--color-text-secondary)" textAnchor="end">+{yScale}</text>
          <text x={padding.left - 4} y={height - padding.bottom + 3} fontSize={9} fill="var(--color-text-secondary)" textAnchor="end">-{yScale}</text>

          {data.map((d, i) => {
            const x = padding.left + i * gap + (gap - barW) / 2;
            const modH = (d.modifications / yScale) * halfH;
            const addH = (d.additions / yScale) * halfH;
            const delH = (d.deletions / yScale) * halfH;
            const isHov = hoveredIdx === i;
            const op = isHov ? 1 : hoveredIdx !== null ? 0.3 : 0.8;

            return (
              <g key={i}>
                {modH > 0 && <rect x={x} y={baseline - modH} width={barW} height={modH} fill="var(--color-primary)" opacity={op} />}
                {addH > 0 && <rect x={x} y={baseline - modH - addH} width={barW} height={addH} fill="var(--color-success)" opacity={op} />}
                {delH > 0 && <rect x={x} y={baseline} width={barW} height={delH} fill="var(--color-danger)" opacity={op} />}
                <rect x={padding.left + i * gap} y={padding.top} width={gap} height={chartH} fill="transparent" onMouseEnter={() => setHoveredIdx(i)} />
              </g>
            );
          })}

          {monthLabels.map((m, i) => (
            <text key={i} x={m.x} y={height - 4} fontSize={9} fill="var(--color-text-secondary)">{m.label}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 4. Language Breakdown (horizontal bar chart)
// ─────────────────────────────────────────────────

interface LanguageData { language: string; count: number; percentage: number }

export function LanguageBreakdown({ data }: { data: LanguageData[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-6">No language data available.</p>;
  }

  const top = data.slice(0, 10);
  const rest = data.slice(10);
  const otherCount = rest.reduce((sum, r) => sum + r.count, 0);
  const otherPct = rest.reduce((sum, r) => sum + r.percentage, 0);

  const items = [
    ...top,
    ...(otherCount > 0 ? [{ language: "Other", count: otherCount, percentage: Math.round(otherPct * 10) / 10 }] : []),
  ];
  const maxCount = Math.max(1, ...items.map((d) => d.count));

  return (
    <div className="space-y-1.5">
      <div className="flex h-3 rounded-full overflow-hidden">
        {items.map((item, i) => (
          <div
            key={item.language}
            className="transition-opacity duration-150"
            style={{
              width: `${item.percentage}%`,
              backgroundColor: item.language === "Other" ? "var(--color-text-secondary)" : LANG_COLORS[i % LANG_COLORS.length],
              minWidth: item.percentage > 0 ? 2 : 0,
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.3 : 1,
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {items.map((item, i) => (
          <div
            key={item.language}
            className="flex items-center gap-1.5 text-xs cursor-default transition-opacity duration-150"
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1 }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.language === "Other" ? "var(--color-text-secondary)" : LANG_COLORS[i % LANG_COLORS.length] }}
            />
            <span className="text-text-primary font-medium">{displayLang(item.language)}</span>
            <span className="text-text-secondary">{item.percentage}%</span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1">
        {items.map((item, i) => (
          <div
            key={item.language}
            className="flex items-center gap-2 cursor-default transition-opacity duration-150"
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1 }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className="text-xs text-text-secondary w-24 text-right truncate shrink-0">{displayLang(item.language)}</span>
            <div className="flex-1 h-4 rounded bg-surface-secondary overflow-hidden">
              <div
                className="h-full rounded transition-all duration-150"
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
                  backgroundColor: item.language === "Other" ? "var(--color-text-secondary)" : LANG_COLORS[i % LANG_COLORS.length],
                  opacity: hoveredIdx === i ? 1 : 0.8,
                }}
              />
            </div>
            <span className="text-xs text-text-secondary w-14 shrink-0">{item.count} file{item.count !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 5. Contributor Timeline (swim-lane dot chart)
// ─────────────────────────────────────────────────

interface ContributorTimelineData { email: string; name: string; weeks: { week: number; count: number }[] }

export function ContributorTimeline({ data }: { data: ContributorTimelineData[] }) {
  const [hovered, setHovered] = useState<{ email: string; week: number; count: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-6">No contributor data available.</p>;
  }

  const allWeeks = new Set<number>();
  let globalMax = 1;
  for (const c of data) {
    for (const w of c.weeks) { allWeeks.add(w.week); if (w.count > globalMax) globalMax = w.count; }
  }
  const weekList = Array.from(allWeeks).sort((a, b) => a - b);
  if (weekList.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-6">No contributor data available.</p>;
  }

  const labelWidth = 120;
  const pad = { top: 20, right: 12 };
  const rowHeight = 28;
  const maxRadius = 8;
  const dotAreaWidth = Math.max(400, weekList.length * 10);
  const svgWidth = labelWidth + dotAreaWidth + pad.right;
  const svgHeight = pad.top + data.length * rowHeight + 24;

  const weekMin = weekList[0];
  const weekMax = weekList[weekList.length - 1];
  const weekRange = Math.max(1, weekMax - weekMin);

  const monthLabels: { label: string; x: number }[] = [];
  let lastMonth = -1;
  for (const w of weekList) {
    const m = new Date(w * 1000).getMonth();
    if (m !== lastMonth) { monthLabels.push({ label: MONTHS[m], x: labelWidth + ((w - weekMin) / weekRange) * dotAreaWidth }); lastMonth = m; }
  }

  return (
    <div className="overflow-x-auto relative" ref={containerRef}>
      {hovered && (
        <Tooltip
          text={`${hovered.count} commit${hovered.count !== 1 ? "s" : ""} · week of ${new Date(hovered.week * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          x={hovered.x} y={hovered.y} containerRef={containerRef}
        />
      )}
      <svg width={svgWidth} height={svgHeight} className="block" onMouseLeave={() => setHovered(null)}>
        {monthLabels.map((m, i) => (
          <text key={i} x={m.x} y={12} fontSize={9} fill="var(--color-text-secondary)">{m.label}</text>
        ))}
        {data.map((contributor, i) => {
          const y = pad.top + i * rowHeight + rowHeight / 2;
          const color = LANG_COLORS[i % LANG_COLORS.length];
          const isRowHovered = hovered?.email === contributor.email;

          return (
            <g key={contributor.email}>
              {i % 2 === 0 && (
                <rect x={0} y={y - rowHeight / 2} width={svgWidth} height={rowHeight} fill="var(--color-surface-secondary)" opacity={0.3} />
              )}
              <text x={labelWidth - 8} y={y + 3} fontSize={10} fill="var(--color-text-primary)" textAnchor="end" fontWeight={isRowHovered ? 600 : 400}>
                {contributor.name.length > 16 ? contributor.name.slice(0, 16) + "..." : contributor.name}
              </text>
              {contributor.weeks.map((w) => {
                const cx = labelWidth + ((w.week - weekMin) / weekRange) * dotAreaWidth;
                const ratio = w.count / globalMax;
                const r = Math.max(2, ratio * maxRadius);
                const isDotHovered = hovered?.email === contributor.email && hovered?.week === w.week;
                return (
                  <circle
                    key={w.week} cx={cx} cy={y}
                    r={isDotHovered ? r + 2 : r}
                    fill={color}
                    opacity={isDotHovered ? 1 : isRowHovered ? 0.8 : 0.3 + ratio * 0.7}
                    stroke={isDotHovered ? "var(--color-text-primary)" : "none"}
                    strokeWidth={1}
                    style={{ cursor: "pointer", transition: "r 0.1s, opacity 0.1s" }}
                    onMouseEnter={() => setHovered({ email: contributor.email, week: w.week, count: w.count, x: cx, y: y })}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

function displayLang(ext: string): string {
  if (ext === "Other") return "Other";
  return EXT_NAMES[ext] || ext.replace(/^\./, "").toUpperCase();
}

function niceYTicks(max: number): number[] {
  if (max <= 0) return [0];
  const step = niceStep(max / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + Math.round(step));
  return ticks;
}

function niceStep(rough: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  if (norm <= 1.5) return mag;
  if (norm <= 3) return 2 * mag;
  if (norm <= 7) return 5 * mag;
  return 10 * mag;
}
