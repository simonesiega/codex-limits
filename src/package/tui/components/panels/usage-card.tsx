import {Box, Text} from "ink";
import type {ReactElement} from "react";
import {theme} from "@/package/tui/theme";
import {truncateText} from "@/package/tui/text";
import type {TuiUsageCard} from "@/package/tui/view-model";
import {ProgressBar} from "@/package/tui/components/primitives/progress-bar";

export interface UsageCardProps {
  card: TuiUsageCard;
  width: number;
}

/** Renders one normalized usage window card. */
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
