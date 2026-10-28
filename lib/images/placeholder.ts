/**
 * Generates clearly-labelled placeholder vehicle photos as SVG. Used for demo seed data so the
 * app works offline without third-party image licensing concerns.
 */

export type BodyStyle = "hatch" | "sedan" | "suv" | "mpv";

const COLOR_HEX: Record<string, string> = {
  white: "#EEF0F3",
  "pearl white": "#F4F2EC",
  silver: "#BCC1C8",
  grey: "#6B7280",
  gray: "#6B7280",
  black: "#22262C",
  red: "#A8232A",
  blue: "#1F4E9C",
  brown: "#6E4630",
  orange: "#D35A1B",
  beige: "#CDBE98",
  green: "#2F5D46",
  maroon: "#5E1A24",
};

export function colorToHex(color: string): string {
  return COLOR_HEX[color.trim().toLowerCase()] ?? "#8A94A3";
}

interface Shape {
  frontX: number;
  hoodY: number;
  hoodEndX: number;
  hoodEndY: number;
  roofStartX: number;
  roofY: number;
  roofEndX: number;
  rearGlassEndX: number;
  rearGlassEndY: number;
  deckY: number;
  rearX: number;
  wheelA: number;
  wheelB: number;
}

const SHAPES: Record<BodyStyle, Shape> = {
  sedan: { frontX: 86, hoodY: 298, hoodEndX: 300, hoodEndY: 280, roofStartX: 392, roofY: 198, roofEndX: 566, rearGlassEndX: 652, rearGlassEndY: 262, deckY: 270, rearX: 752, wheelA: 230, wheelB: 620 },
  hatch: { frontX: 110, hoodY: 304, hoodEndX: 296, hoodEndY: 284, roofStartX: 384, roofY: 196, roofEndX: 604, rearGlassEndX: 686, rearGlassEndY: 250, deckY: 254, rearX: 706, wheelA: 236, wheelB: 590 },
  suv: { frontX: 86, hoodY: 276, hoodEndX: 296, hoodEndY: 262, roofStartX: 378, roofY: 170, roofEndX: 660, rearGlassEndX: 726, rearGlassEndY: 222, deckY: 228, rearX: 752, wheelA: 232, wheelB: 622 },
  mpv: { frontX: 80, hoodY: 284, hoodEndX: 270, hoodEndY: 262, roofStartX: 352, roofY: 172, roofEndX: 690, rearGlassEndX: 738, rearGlassEndY: 222, deckY: 228, rearX: 756, wheelA: 222, wheelB: 640 },
};

const GROUND = 392;
const ARCH = 62;
const TYRE = 50;

function bodyPath(k: Shape): string {
  const { frontX: f, hoodY, hoodEndX, hoodEndY, roofStartX, roofY, roofEndX, rearGlassEndX, rearGlassEndY, deckY, rearX: r, wheelA, wheelB } = k;
  return [
    `M ${f + 10} ${GROUND}`,
    `C ${f - 2} ${GROUND - 12}, ${f - 4} ${GROUND - 42}, ${f + 6} ${GROUND - 62}`,
    `C ${f + 12} ${hoodY + 14}, ${f + 26} ${hoodY + 4}, ${f + 54} ${hoodY}`,
    `L ${hoodEndX} ${hoodEndY}`,
    `C ${hoodEndX + 30} ${hoodEndY - 16}, ${roofStartX - 30} ${roofY + 14}, ${roofStartX} ${roofY + 4}`,
    `C ${roofStartX + 30} ${roofY - 4}, ${roofEndX - 40} ${roofY - 6}, ${roofEndX} ${roofY}`,
    `C ${roofEndX + 30} ${roofY + 8}, ${rearGlassEndX - 24} ${rearGlassEndY - 30}, ${rearGlassEndX} ${rearGlassEndY}`,
    `L ${r - 24} ${deckY}`,
    `C ${r - 8} ${deckY + 2}, ${r} ${deckY + 20}, ${r + 2} ${deckY + 46}`,
    `L ${r} ${GROUND - 20}`,
    `C ${r} ${GROUND - 6}, ${r - 8} ${GROUND}, ${r - 22} ${GROUND}`,
    `L ${wheelB + ARCH} ${GROUND}`,
    `A ${ARCH} ${ARCH} 0 0 0 ${wheelB - ARCH} ${GROUND}`,
    `L ${wheelA + ARCH} ${GROUND}`,
    `A ${ARCH} ${ARCH} 0 0 0 ${wheelA - ARCH} ${GROUND}`,
    "Z",
  ].join(" ");
}

function windowPath(k: Shape): string {
  const belt = k.hoodEndY + 6;
  return [
    `M ${k.hoodEndX + 34} ${belt}`,
    `C ${k.hoodEndX + 52} ${belt - 14}, ${k.roofStartX - 22} ${k.roofY + 24}, ${k.roofStartX + 6} ${k.roofY + 14}`,
    `L ${k.roofEndX - 4} ${k.roofY + 12}`,
    `C ${k.roofEndX + 20} ${k.roofY + 20}, ${k.rearGlassEndX - 44} ${belt - 30}, ${k.rearGlassEndX - 28} ${belt}`,
    "Z",
  ].join(" ");
}

function wheel(cx: number, rim: string): string {
  const cy = GROUND - TYRE + 8;
  const spokes = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 - 90) * (Math.PI / 180);
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * 28).toFixed(1)}" y2="${(cy + Math.sin(a) * 28).toFixed(1)}" stroke="#5b636f" stroke-width="7" stroke-linecap="round"/>`;
  }).join("");
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${TYRE}" fill="#16181c"/>
    <circle cx="${cx}" cy="${cy}" r="${TYRE - 4}" fill="none" stroke="#2a2e35" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="33" fill="${rim}"/>
    ${spokes}
    <circle cx="${cx}" cy="${cy}" r="31" fill="none" stroke="#e5e8ec" stroke-width="2" opacity=".6"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#3b424d"/>
  </g>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

export function placeholderSvg(opts: {
  title: string;
  color: string;
  style: BodyStyle;
  variant: 0 | 1 | 2;
}): string {
  const paint = colorToHex(opts.color);
  const k = SHAPES[opts.style];
  const belt = k.hoodEndY + 6;
  const pillar = Math.round((k.roofStartX + k.roofEndX) / 2);
  const frontDoor = k.hoodEndX + 40;
  const backgrounds = [
    { top: "#f5f7fa", bottom: "#dfe4ea", floor: "#cfd6de", text: "#172033", sub: "#667085" },
    { top: "#2b3341", bottom: "#141922", floor: "#0e1219", text: "#e5e7eb", sub: "#9ca3af" },
    { top: "#f3efe8", bottom: "#ddd5c8", floor: "#cbc1b2", text: "#2b2418", sub: "#7a6e5d" },
  ] as const;
  const bg = backgrounds[opts.variant];
  const transform =
    opts.variant === 1 ? "translate(840 0) scale(-1 1)" : opts.variant === 2 ? "translate(-150 -96) scale(1.32)" : "translate(10 0)";
  const rim = opts.variant === 1 ? "#9aa1ab" : "#c3c9d1";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 520" width="1640" height="1040">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.top}"/><stop offset="1" stop-color="${bg.bottom}"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.floor}" stop-opacity="0"/><stop offset=".35" stop-color="${bg.floor}" stop-opacity=".7"/><stop offset="1" stop-color="${bg.floor}"/></linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".42" stop-color="#fff" stop-opacity=".04"/>
      <stop offset=".62" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".28"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4656"/><stop offset=".55" stop-color="#1f2731"/><stop offset="1" stop-color="#2d3846"/></linearGradient>
    <radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="820" height="520" fill="url(#bg)"/>
  <rect y="300" width="820" height="220" fill="url(#floor)"/>
  <g transform="${transform}">
    <ellipse cx="${(k.frontX + k.rearX) / 2}" cy="${GROUND + 8}" rx="${(k.rearX - k.frontX) / 2 + 30}" ry="20" fill="url(#shadow)"/>
    ${[k.wheelA, k.wheelB].map((x) => `<path d="M ${x - ARCH + 2} ${GROUND} A ${ARCH - 2} ${ARCH - 2} 0 0 1 ${x + ARCH - 2} ${GROUND} Z" fill="#0d0f12"/>`).join("")}
    <path d="${bodyPath(k)}" fill="${paint}"/>
    <path d="${bodyPath(k)}" fill="url(#paint)"/>
    <path d="${bodyPath(k)}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1.5"/>
    <path d="${windowPath(k)}" fill="url(#glass)"/>
    <path d="M ${k.hoodEndX + 60} ${belt - 8} L ${pillar - 30} ${k.roofY + 22}" stroke="#fff" stroke-opacity=".12" stroke-width="18" stroke-linecap="round"/>
    <rect x="${pillar - 5}" y="${k.roofY + 8}" width="10" height="${belt - k.roofY - 8}" fill="${paint}"/>
    <rect x="${pillar - 5}" y="${k.roofY + 8}" width="10" height="${belt - k.roofY - 8}" fill="#000" opacity=".25"/>
    <path d="M ${k.frontX + 56} ${k.hoodY + 30} C ${k.hoodEndX} ${belt + 20}, ${k.rearX - 120} ${belt + 18}, ${k.rearX - 12} ${k.deckY + 30}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.5"/>
    <path d="M ${frontDoor} ${belt + 2} L ${frontDoor - 4} ${GROUND - 34}" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
    <path d="M ${pillar} ${belt + 2} L ${pillar + 2} ${GROUND - 30}" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
    <rect x="${frontDoor + 70}" y="${belt + 22}" width="28" height="6" rx="3" fill="#000" opacity=".25"/>
    <rect x="${pillar + 50}" y="${belt + 22}" width="28" height="6" rx="3" fill="#000" opacity=".25"/>
    <path d="M ${k.wheelA + ARCH + 6} ${GROUND - 14} L ${k.wheelB - ARCH - 6} ${GROUND - 14} L ${k.wheelB - ARCH - 6} ${GROUND} L ${k.wheelA + ARCH + 6} ${GROUND} Z" fill="#000" opacity=".22"/>
    <ellipse cx="${k.frontX + 34}" cy="${k.hoodY + 18}" rx="20" ry="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
    <rect x="${k.frontX + 6}" y="${GROUND - 46}" width="44" height="10" rx="4" fill="#111" opacity=".55"/>
    <rect x="${k.rearX - 12}" y="${k.deckY + 10}" width="12" height="26" rx="4" fill="#b91c1c"/>
    ${wheel(k.wheelA, rim)}
    ${wheel(k.wheelB, rim)}
  </g>
  <text x="32" y="462" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600" fill="${bg.text}">${escapeXml(opts.title)}</text>
  <text x="32" y="490" font-family="Inter, Arial, sans-serif" font-size="14" fill="${bg.sub}">Placeholder image · demo data</text>
</svg>`;
}

export function placeholderBlob(opts: Parameters<typeof placeholderSvg>[0]): Blob {
  return new Blob([placeholderSvg(opts)], { type: "image/svg+xml" });
}
