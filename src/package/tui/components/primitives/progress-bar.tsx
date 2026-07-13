import {Text} from "ink";
import type {ReactElement} from "react";
import {theme, type TuiTone} from "@/package/tui/theme";

export interface ProgressBarProps {
  percent: number | null;
  width: number;
  tone: TuiTone;
}

export function ProgressBar({percent, width, tone}: ProgressBarProps): ReactElement {
  const bar = buildProgressBar(percent, width);
  return <Text color={theme[tone]}>{bar}</Text>;
}

/** Builds a width-bounded progress bar for known or unavailable percentages. */
export function buildProgressBar(percent: number | null, width: number): string {
  const safeWidth = Number.isFinite(width) ? Math.max(Math.floor(width), 0) : 0;
  const safePercent = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const filled = Math.round((safePercent / 100) * safeWidth);
  return `${"█".repeat(filled)}${"░".repeat(safeWidth - filled)}`;
}
