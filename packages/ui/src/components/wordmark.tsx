/**
 * Wordmark — "groffee" rendered as a single SVG, with the coffee-cup mark
 * sitting in the slot of the lowercase `o`. The text glyphs use Fraunces
 * Black via SVG `<text>` (Fraunces is loaded as a webfont); the cup is
 * stacked shapes (no mask) so the same component can render multiple times
 * on a page without React-id mismatches and without SSR hydration risk.
 *
 * Geometry was calibrated by eye against Fraunces 9pt Black at 260 units:
 *   - viewBox is 920 × 320
 *   - "gr"   sits at x=10,  baseline=245
 *   - cup   occupies x=290..458 (168 units wide), vertically centered
 *     against the x-height of the surrounding letters
 *   - "ffee" sits at x=475, baseline=245
 *
 * If Fraunces fails to load (rare — `font-display: swap` handles fallback),
 * the SVG renders in the browser's default serif. The cup never depends on
 * a font.
 */
interface WordmarkProps {
  /** Height of the rendered wordmark in pixels. Width auto-scales. */
  height?: number;
  /** Color of the cup mark. Defaults to `currentColor` so the parent can theme it. */
  cupColor?: string;
  /** Color of the text. Defaults to `currentColor`. */
  textColor?: string;
  className?: string;
  ariaLabel?: string;
}

export function Wordmark({
  height = 96,
  cupColor,
  textColor,
  className = "",
  ariaLabel = "groffee",
}: WordmarkProps) {
  // Aspect ratio of the baked layout: 920 wide / 320 tall ≈ 2.875.
  const width = (height * 920) / 320;
  const cup = cupColor ?? "currentColor";
  const text = textColor ?? "currentColor";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 920 320"
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      {/* Left half — "gr" */}
      <text
        x="10"
        y="245"
        fontFamily='"Fraunces", "Inter Tight", serif'
        fontWeight="900"
        fontSize="260"
        letterSpacing="-10"
        fill={text}
        style={{
          fontOpticalSizing: "auto",
          fontVariationSettings: "'opsz' 144",
        }}
      >
        gr
      </text>

      {/* Cup — drawn as stacked shapes (no <mask>) so the wordmark can be
       * instantiated any number of times on a page without ID collisions
       * or React useId hydration mismatches. The base disc is the brand
       * accent; the cup detail (body + handle + steam) is drawn on top
       * in canvas color to "carve" the cup silhouette out of the disc.
       *
       * The whole group sits at (290, 75) and scales the 24-unit source
       * artwork to a 168-unit cup, matching the x-height of Fraunces Black
       * `o` at 260px.
       */}
      <g transform="translate(290 75) scale(7)">
        {/* Base disc — the visible color the cup carves into. */}
        <circle cx="12" cy="12" r="10" fill={cup} />

        {/* Cup body */}
        <path
          d="M8 9.8c0-.44.36-.8.8-.8h6.4c.44 0 .8.36.8.8v4.9c0 1.6-1.3 2.9-2.9 2.9h-2.2c-1.6 0-2.9-1.3-2.9-2.9v-4.9z"
          fill="var(--color-canvas)"
        />

        {/* Cup handle */}
        <path
          d="M15.6 10.6h.9c1.05 0 1.9.85 1.9 1.9v.4c0 1.05-.85 1.9-1.9 1.9h-.9v-1.2h.8c.4 0 .7-.3.7-.7v-.4c0-.4-.3-.7-.7-.7h-.8v-1.2z"
          fill="var(--color-canvas)"
        />

        {/* Three steam droplets above the cup */}
        <path
          d="M10.2 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
          fill="var(--color-canvas)"
        />
        <path
          d="M12 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
          fill="var(--color-canvas)"
        />
        <path
          d="M13.8 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
          fill="var(--color-canvas)"
        />
      </g>

      {/* Right half — "ffee" */}
      <text
        x="475"
        y="245"
        fontFamily='"Fraunces", "Inter Tight", serif'
        fontWeight="900"
        fontSize="260"
        letterSpacing="-10"
        fill={text}
        style={{
          fontOpticalSizing: "auto",
          fontVariationSettings: "'opsz' 144",
        }}
      >
        ffee
      </text>
    </svg>
  );
}
