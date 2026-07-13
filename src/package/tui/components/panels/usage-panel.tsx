import {Box} from "ink";
import type {ReactElement} from "react";
import type {TuiUsageCard} from "@/package/tui/view-model";
import {Panel} from "@/package/tui/components/primitives/panel";
import {UsageCard} from "@/package/tui/components/panels/usage-card";

export interface UsagePanelProps {
  cards: TuiUsageCard[];
  width: number;
  stacked: boolean;
  dense?: boolean;
}

/** Renders responsive 5-hour and weekly usage cards. */
export function UsagePanel({cards, width, stacked, dense = false}: UsagePanelProps): ReactElement {
  const bodyWidth = Math.max(width - 4, 1);
  const gutter = stacked ? 0 : Math.max(Math.round(bodyWidth * 0.03), 2);
  const cardWidth = stacked
    ? Math.max(bodyWidth - 4, 1)
    : Math.max(Math.floor((bodyWidth - gutter) / 2), 1);
  const lastCardWidth = stacked ? cardWidth : Math.max(bodyWidth - gutter - cardWidth, 1);

  return (
    <Panel dense={dense} title="Usage Limits" width={width}>
      <Box
        alignItems={stacked ? "center" : undefined}
        flexDirection={stacked ? "column" : "row"}
        justifyContent={stacked ? undefined : "center"}
        width={bodyWidth}
      >
        {cards.map((card, index) => (
          <Box
            key={card.title}
            marginBottom={stacked && index < cards.length - 1 && !dense ? 1 : 0}
            marginRight={!stacked && index < cards.length - 1 ? gutter : 0}
          >
            <UsageCard card={card} width={index === cards.length - 1 ? lastCardWidth : cardWidth} />
          </Box>
        ))}
      </Box>
    </Panel>
  );
}
