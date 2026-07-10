import {Box, Text} from "ink";
import type {ReactElement} from "react";
import {theme} from "../../theme";
import type {TuiUsageCard} from "../../view-model";
import {ProgressBar} from "../primitives/progress-bar";

/** Props for a usage-limit card. */
export interface UsageCardProps {
  /** Usage card display model. */
  card: TuiUsageCard;
  /** Card width for responsive layouts. */
  width: number;
}

/**
 * Renders one usage-limit card with remaining percent and reset text.
 *
 * @param props - Usage card data and width.
 * @returns Ink usage-card element.
 */
export function UsageCard({card, width}: UsageCardProps): ReactElement {
  const contentWidth = Math.max(width - 4, 1);
  const barWidth = Math.max(Math.min(contentWidth, 32), 1);

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      width={width}
    >
      <Text bold>{truncateText(card.title, contentWidth)}</Text>
      <Text color={theme[card.tone]}>{truncateText(card.remainingLabel, contentWidth)}</Text>
      <ProgressBar percent={card.percent} tone={card.tone} width={barWidth} />
      <Text dimColor>{truncateText(card.resetLabel, contentWidth)}</Text>
    </Box>
  );
}

function truncateText(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, Math.max(width, 0));
  }

  return `${value.slice(0, width - 1)}…`;
}
