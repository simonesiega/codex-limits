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
  const barWidth = Math.max(Math.min(width - 6, 32), 12);

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      width={width}
    >
      <Text bold>{card.title}</Text>
      <Text color={theme[card.tone]}>{card.remainingLabel}</Text>
      <ProgressBar percent={card.percent} tone={card.tone} width={barWidth} />
      <Text dimColor>{card.resetLabel}</Text>
    </Box>
  );
}
