// Type of layout mode based on terminal dimensions.
export type LayoutMode = "compact" | "standard" | "ultra" | "wide";

/**
 * Store layout information for a TUI (Text User Interface) application.
 */
export interface TuiLayout {
  terminalWidth: number;
  contentWidth: number;
  mode: LayoutMode;
  dense: boolean;
  textSummary: boolean;
  showLargeLogo: boolean;
  showStyledLogo: boolean;
}

/**
 * Creates a TUI layout based on the provided terminal dimensions.
 * @param columns - Number of terminal columns.
 * @param rows - Number of terminal rows.
 * @returns - TuiLayout object containing layout information for the TUI application.
 */
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

/**
 * Get the layout mode based on terminal dimensions.
 * @param columns - Number of terminal columns.
 * @param rows - Number of terminal rows.
 * @returns - The layout mode as a string ("compact", "standard", "ultra", or "wide").
 */
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
