import { Text } from "ink";
import type { ReactElement } from "react";
import { theme, type TuiTone } from "../../theme";

/** Props for the smooth progress bar component. */
export interface ProgressBarProps {
  /** Remaining percent to render. */
  percent: number | null;
  /** Width of the bar body. */
  width: number;
  /** Color tone for the filled portion. */
  tone: TuiTone;
}

/**
 * Renders a compact smooth progress bar.
 *
 * @param props - Progress percentage, width, and tone.
 * @returns Ink text element containing the progress bar.
 */
export function ProgressBar({ percent, width, tone }: ProgressBarProps): ReactElement {
  const bar = buildProgressBar(percent, width);
  return <Text color={theme[tone]}>{bar}</Text>;
}

/**
 * Builds the smooth progress bar string.
 *
 * @param percent - Remaining percent to render.
 * @param width - Width of the bar body.
 * @returns Progress bar string.
 */
export function buildProgressBar(percent: number | null, width: number): string {
  const safePercent = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const filled = Math.round((safePercent / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(width - filled, 0))}`;
}
