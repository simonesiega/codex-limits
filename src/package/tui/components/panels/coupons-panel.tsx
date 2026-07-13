import {Box, Text} from "ink";
import type {ReactElement} from "react";
import {theme} from "@/package/tui/theme";
import {truncateText} from "@/package/tui/text";
import type {TuiCouponRow, TuiCouponSummaryCard} from "@/package/tui/view-model";
import {Panel} from "@/package/tui/components/primitives/panel";

export interface CouponsPanelProps {
  summary: TuiCouponSummaryCard;
  couponRows: TuiCouponRow[];
  emptyLabel: string;
  stacked: boolean;
  width: number;
  dense?: boolean;
  compactRows?: boolean;
}

/** Renders responsive reset-credit summary and list cards. */
export function CouponsPanel({
  summary,
  couponRows,
  emptyLabel,
  stacked,
  width,
  dense = false,
  compactRows = false,
}: CouponsPanelProps): ReactElement {
  const bodyWidth = Math.max(width - 4, 1);
  const gutter = stacked ? 0 : Math.max(Math.round(bodyWidth * 0.02), 1);
  const summaryWidth = stacked
    ? Math.max(bodyWidth - 4, 1)
    : Math.max(Math.floor((bodyWidth - gutter) * 0.35), 1);
  const listWidth = stacked
    ? Math.max(bodyWidth - 4, 1)
    : Math.max(bodyWidth - summaryWidth - gutter, 1);

  return (
    <Panel dense={dense} title="Reset Coupons" width={width}>
      <Box
        alignItems={stacked ? "center" : undefined}
        flexDirection={stacked ? "column" : "row"}
        justifyContent={stacked ? undefined : "center"}
        width={bodyWidth}
      >
        <Box marginBottom={stacked && !dense ? 1 : 0} marginRight={stacked ? 0 : gutter}>
          <CouponSummaryCard dense={dense} summary={summary} width={summaryWidth} />
        </Box>
        <CouponListCard
          compactRows={compactRows}
          dense={dense}
          emptyLabel={emptyLabel}
          rows={couponRows}
          width={listWidth}
        />
      </Box>
    </Panel>
  );
}

interface CouponSummaryCardProps {
  summary: TuiCouponSummaryCard;
  width: number;
  dense: boolean;
}

function CouponSummaryCard({summary, width, dense}: CouponSummaryCardProps): ReactElement {
  const contentWidth = Math.max(width - 4, 1);

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      width={width}
    >
      <Text bold color={theme.text}>
        Summary
      </Text>
      <SummaryMetric
        dense={dense}
        label="Available coupons"
        value={summary.availableCoupons}
        valueColor={theme.accent}
        strong
      />
      <SummaryMetric
        dense={dense}
        label="Earned this period"
        value={summary.earnedThisPeriod}
        valueColor={theme.accent}
        strong
      />
      <SummaryMetric
        dense={dense}
        label="Next expiration"
        value={truncateText(summary.nextExpiration, contentWidth)}
      />
      <SummaryMetric
        dense={dense}
        label="Time left"
        value={truncateText(summary.timeLeft, contentWidth)}
      />
    </Box>
  );
}

interface SummaryMetricProps {
  label: string;
  value: string;
  valueColor?: string;
  strong?: boolean;
  dense: boolean;
}

function SummaryMetric({
  label,
  value,
  valueColor = theme.text,
  strong = false,
  dense,
}: SummaryMetricProps): ReactElement {
  return (
    <Box flexDirection="column" marginTop={dense ? 0 : 1}>
      <Text color={theme.muted}>{label}</Text>
      <Text bold={strong} color={valueColor}>
        {value}
      </Text>
    </Box>
  );
}

interface CouponListCardProps {
  rows: TuiCouponRow[];
  emptyLabel: string;
  width: number;
  dense: boolean;
  compactRows: boolean;
}

function CouponListCard({
  rows,
  emptyLabel,
  width,
  dense,
  compactRows,
}: CouponListCardProps): ReactElement {
  const contentWidth = Math.max(width - 4, 1);

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      width={width}
    >
      <Text bold color={theme.text}>
        Coupons
      </Text>
      <Box flexDirection="column" marginTop={dense ? 0 : 1}>
        {rows.length === 0 ? (
          <Text color={theme.muted}>{truncateText(emptyLabel, contentWidth)}</Text>
        ) : (
          rows.map((row) => (
            <CouponRow compact={compactRows} key={row.index} row={row} width={contentWidth} />
          ))
        )}
      </Box>
    </Box>
  );
}

interface CouponRowProps {
  row: TuiCouponRow;
  width: number;
  compact: boolean;
}

function CouponRow({row, width, compact}: CouponRowProps): ReactElement {
  if (compact || width < 50) {
    const prefix = `${row.index} • `;
    const separator = " • ";
    const dateWidth = Math.max(width - prefix.length - separator.length - row.status.length, 1);

    return (
      <Box>
        <Text color={theme.text}>{prefix}</Text>
        <Text color={row.available ? theme.green : theme.gray}>{row.status}</Text>
        <Text color={theme.text}>{separator}</Text>
        <Text color={theme.text}>{truncateText(row.expiresOn, dateWidth)}</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={0}>
      <Box width={3}>
        <Text color={theme.muted}>{row.index}</Text>
      </Box>
      <Box width={2}>
        <Text color={row.available ? theme.green : theme.gray}>●</Text>
      </Box>
      <Box width={12}>
        <Text color={row.available ? theme.green : theme.text}>{truncateText(row.status, 12)}</Text>
      </Box>
      <Box width={26}>
        <Text color={theme.muted}>{truncateText(row.expires, 26)}</Text>
      </Box>
      <Text color={theme.text}>{truncateText(row.expiresOn, Math.max(width - 43, 1))}</Text>
    </Box>
  );
}
