// Type of layout mode based on terminal dimensions.
export type LayoutMode = "compact" | "standard" | "ultra" | "wide";

export interface TuiLayout {
  terminalWidth: number;
  contentWidth: number;
  mode: LayoutMode;
  dense: boolean;
  textSummary: boolean;
  showLargeLogo: boolean;
  showStyledLogo: boolean;
}

/** Derives deterministic layout breakpoints from the startup terminal dimensions. */
export function createTuiLayout(columns: number, rows: number): TuiLayout {
  const terminalWidth = Math.max(Math.floor(columns), 1);
  const terminalRows = Math.max(Math.floor(rows), 1);
  const mode = getLayoutMode(terminalWidth, terminalRows);
  const maxWidth = mode === "wide" ? 120 : mode === "standard" ? 104 : 96;
  const contentWidth = Math.max(Math.min(terminalWidth - 2, maxWidth), 1);

  return {
    terminalWidth,
    contentWidth,
    mode,
    dense: mode === "compact" || mode === "ultra",
    textSummary: terminalRows < 40 || terminalWidth < 40,
    showLargeLogo: terminalWidth >= 130 && terminalRows >= 28,
    showStyledLogo: terminalWidth >= 72 && terminalRows >= 40,
  };
}

function getLayoutMode(columns: number, rows: number): LayoutMode {
  if (columns < 70 || rows < 18) {
    return "ultra";
  }
  if (columns < 100 || rows < 28) {
    return "compact";
  }
  if (columns < 130) {
    return "standard";
  }
  return "wide";
}
