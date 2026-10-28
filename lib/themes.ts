/**
 * Colour themes. The actual token values live in app/globals.css under `:root[data-theme="…"]`;
 * this list only drives the picker in Settings (labels + preview swatches).
 */
export const THEMES = [
  { id: "graphite", label: "Graphite", sidebar: "#18181b", primary: "#3f3f46" },
  { id: "navy", label: "Navy", sidebar: "#0f1f4a", primary: "#1e3a8a" },
  { id: "teal", label: "Teal", sidebar: "#0b3b36", primary: "#0f766e" },
  { id: "indigo", label: "Indigo", sidebar: "#1e1b4b", primary: "#4338ca" },
  { id: "wine", label: "Wine", sidebar: "#3b0a1a", primary: "#9f1239" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "graphite";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}
