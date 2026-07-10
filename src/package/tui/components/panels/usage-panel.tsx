import {Box} from "ink";
import type {ReactElement} from "react";
import type {TuiUsageCard} from "../../view-model";
import {Panel} from "../primitives/panel";
import {UsageCard} from "./usage-card";

/** Props for the usage limits panel. */
export interface UsagePanelProps {
  /** Cards to render. */
  cards: TuiUsageCard[];
  /** Terminal width used to size cards. */
  width: number;
  /** Whether cards should stack vertically. */
  stacked: boolean;
  /** Whether to reduce vertical spacing. */
  dense?: boolean;
}

/**
 * Renders the 5-hour and weekly usage limit cards.
 *
 * @param props - Usage cards and responsive layout options.
 * @returns Ink usage panel element.
 */
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
