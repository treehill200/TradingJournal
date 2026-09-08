export const COLORS = {
  profit: "#34d399",
  profitSoft: "rgba(52, 211, 153, 0.16)",
  loss: "#fb7185",
  lossSoft: "rgba(251, 113, 133, 0.16)",
  brand: "#6d8dff",
  brandSoft: "rgba(109, 141, 255, 0.18)",
  muted: "#8d97ab",
  faint: "#79849a",
  line: "#1c2331",
  surface: "#0b0f17",
} as const;

export function toneColor(value: number): string {
  if (value > 0) return COLORS.profit;
  if (value < 0) return COLORS.loss;
  return COLORS.muted;
}

export function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "text-muted";
  return value > 0 ? "text-profit" : "text-loss";
}
