/** Shared terminal color tokens for the Ink TUI. */
export const theme = {
  title: "#f8fafc",
  accent: "#38bdf8",
  border: "#334155",
  muted: "#94a3b8",
  text: "#e2e8f0",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  gray: "#64748b",
} as const;

/** Display tone names used by TUI view models and components. */
export type TuiTone = "green" | "yellow" | "red" | "gray";
