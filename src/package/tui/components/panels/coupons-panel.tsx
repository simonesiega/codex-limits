import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { theme } from "../../theme";
import type { TuiCouponRow, TuiCouponSummaryCard } from "../../view-model";
import { Panel } from "../primitives/panel";

/** Props for the reset-coupons panel. */
export interface CouponsPanelProps {
  /** Summary values shown on the left or top. */
  summary: TuiCouponSummaryCard;
  /** Coupon rows shown on the right or bottom. */
  couponRows: TuiCouponRow[];
  /** Empty state when no coupon rows are present. */
  emptyLabel: string;
  /** Whether summary and rows should stack vertically. */
  stacked: boolean;
  /** Terminal width used to size inner cards. */
  width: number;
}

/**
 * Renders reset coupon summary and rows.
 *
 * @param props - Coupon summary, rows, empty state, and layout flag.
 * @returns Ink reset-coupons panel element.
 */
export function CouponsPanel({ summary, couponRows, emptyLabel, stacked, width }: CouponsPanelProps): ReactElement {
  const innerWidth = Math.max(width - 4, 56);
  const gutter = stacked ? 0 : Math.max(Math.round(innerWidth * 0.02), 1);
  const summaryWidth = stacked ? Math.max(width - 6, 28) : Math.max(Math.floor(innerWidth * 0.35) - gutter, 24);
  const listWidth = stacked ? Math.max(width - 6, 28) : Math.max(innerWidth - summaryWidth - gutter * 3, 46);

  return (
    <Panel title="Reset Coupons">
      <Box flexDirection={stacked ? "column" : "row"} marginLeft={gutter} marginRight={gutter}>
        <Box marginBottom={stacked ? 1 : 0} marginRight={stacked ? 0 : gutter}>
          <CouponSummaryCard summary={summary} width={summaryWidth} />
        </Box>
        <CouponListCard emptyLabel={emptyLabel} rows={couponRows} width={listWidth} />
      </Box>
    </Panel>
  );
}

/** Props for the coupon summary card component. */
interface CouponSummaryCardProps {
  /** Summary values to render. */
  summary: TuiCouponSummaryCard;
  /** Card width. */
  width: number;
}

/**
 * Renders the reset-coupon summary card with a strong available count.
 *
 * @param props - Summary values and card width.
 * @returns Ink summary card element.
 */
function CouponSummaryCard({ summary, width }: CouponSummaryCardProps): ReactElement {
  return (
    <Box borderStyle="single" borderColor={theme.border} flexDirection="column" paddingX={1} width={width}>
      <Text bold color={theme.text}>Summary</Text>
      <SummaryMetric label="Available coupons" value={summary.availableCoupons} valueColor={theme.accent} strong />
      <SummaryMetric label="Earned this period" value={summary.earnedThisPeriod} valueColor={theme.accent} strong />
      <SummaryMetric label="Next expiration" value={summary.nextExpiration} />
      <SummaryMetric label="Time left" value={summary.timeLeft} />
    </Box>
  );
}

/** Props for one summary metric. */
interface SummaryMetricProps {
  /** Metric label. */
  label: string;
  /** Metric value. */
  value: string;
  /** Optional value color. */
  valueColor?: string;
  /** Whether to render the value with extra emphasis. */
  strong?: boolean;
}

/**
 * Renders one label/value pair in the coupon summary card.
 *
 * @param props - Metric label, value, and emphasis options.
 * @returns Ink metric element.
 */
function SummaryMetric({ label, value, valueColor = theme.text, strong = false }: SummaryMetricProps): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.muted}>{label}</Text>
      <Text bold={strong} color={valueColor}>{value}</Text>
    </Box>
  );
}

/** Props for the coupon list card component. */
interface CouponListCardProps {
  /** Coupon rows to render. */
  rows: TuiCouponRow[];
  /** Empty state when no rows are present. */
  emptyLabel: string;
  /** Card width. */
  width: number;
}

/**
 * Renders the coupon rows in a bordered list card.
 *
 * @param props - Coupon rows, empty state, and width.
 * @returns Ink coupon list card element.
 */
function CouponListCard({ rows, emptyLabel, width }: CouponListCardProps): ReactElement {
  return (
    <Box borderStyle="single" borderColor={theme.border} flexDirection="column" paddingX={1} width={width}>
      <Text bold color={theme.text}>Coupons</Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? <Text color={theme.muted}>{emptyLabel}</Text> : rows.map((row) => <CouponRow key={row.index} row={row} />)}
      </Box>
    </Box>
  );
}

/** Props for one coupon row component. */
interface CouponRowProps {
  /** Coupon row display model. */
  row: TuiCouponRow;
}

/**
 * Renders one reset-credit coupon row.
 *
 * @param props - Coupon row data.
 * @returns Ink coupon row element.
 */
function CouponRow({ row }: CouponRowProps): ReactElement {
  return (
    <Box marginBottom={0}>
      <Box width={3}><Text color={theme.muted}>{row.index}</Text></Box>
      <Box width={2}><Text color={row.available ? theme.green : theme.gray}>●</Text></Box>
      <Box width={12}><Text color={row.available ? theme.green : theme.text}>{row.status}</Text></Box>
      <Box width={26}><Text color={theme.muted}>{row.expires}</Text></Box>
      <Text color={theme.text}>{row.expiresOn}</Text>
    </Box>
  );
}
