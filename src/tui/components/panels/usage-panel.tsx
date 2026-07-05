import { Box } from "ink";
import type { ReactElement } from "react";
import type { TuiUsageCard } from "../../view-model";
import { Panel } from "../primitives/panel";
import { UsageCard } from "./usage-card";

/** Props for the usage limits panel. */
export interface UsagePanelProps {
  /** Cards to render. */
  cards: TuiUsageCard[];
  /** Terminal width used to size cards. */
  width: number;
  /** Whether cards should stack vertically. */
  stacked: boolean;
}

/**
 * Renders the 5-hour and weekly usage limit cards.
 *
 * @param props - Usage cards and responsive layout options.
 * @returns Ink usage panel element.
 */
export function UsagePanel({ cards, width, stacked }: UsagePanelProps): ReactElement {
  const innerWidth = Math.max(width - 4, 56);
  const gutter = stacked ? 0 : Math.max(Math.round(innerWidth * 0.03), 2);
  const cardWidth = stacked ? Math.max(width - 6, 28) : Math.max(Math.floor((innerWidth - gutter * 3) / 2), 28);

  return (
    <Panel title="Usage Limits">
      <Box flexDirection={stacked ? "column" : "row"} marginLeft={gutter} marginRight={gutter}>
        {cards.map((card, index) => (
          <Box key={card.title} marginBottom={stacked && index < cards.length - 1 ? 1 : 0} marginRight={!stacked && index < cards.length - 1 ? gutter : 0}>
            <UsageCard card={card} width={cardWidth} />
          </Box>
        ))}
      </Box>
    </Panel>
  );
}
