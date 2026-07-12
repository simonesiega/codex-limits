import {Box, Text, render} from "ink";
import type {ReactElement} from "react";
import type {CodexLimitsResult} from "../core/types";
import {CouponsPanel} from "./components/panels/coupons-panel";
import {UsagePanel} from "./components/panels/usage-panel";
import {Title} from "./components/primitives/title";
import {createTuiLayout} from "./layout";
import {theme} from "./theme";
import {truncateText} from "./text";
import {createTuiViewModel, type TuiViewModel} from "./view-model";

/** Props for the root Ink app. */
export interface AppProps {
  /** Normalized Codex limits result to render. */
  result: CodexLimitsResult;
  /** Initial terminal column count. */
  terminalColumns?: number;
  /** Initial terminal row count. */
  terminalRows?: number;
  /** Optional width override used by older tests. */
  width?: number;
  /** Optional clock override used by tests. */
  now?: Date;
}

/**
 * Renders the root Ink app with the specified props.
 * @param param0 - App props including result, terminal dimensions, and optional overrides.
 * @returns - Ink app element.
 */
export function App({result, terminalColumns, terminalRows, width, now}: AppProps): ReactElement {
  const columns = terminalColumns ?? width ?? process.stdout.columns ?? 80;
  const rows = terminalRows ?? process.stdout.rows ?? 24;
  const layout = createTuiLayout(columns, rows);
  const view = createTuiViewModel(result, layout.contentWidth, now);
  const stacked = layout.dense || view.stacked;

  if (layout.textSummary) {
    return renderTextSummary(view, layout.terminalWidth, rows);
  }

  return (
    <Box justifyContent="center" width={layout.terminalWidth}>
      <Box flexDirection="column" width={view.width}>
        <Title
          showLarge={layout.showLargeLogo}
          showStyled={layout.showStyledLogo}
          width={view.width}
        />
        <UsagePanel
          cards={view.usageCards}
          dense={layout.dense}
          stacked={stacked}
          width={view.width}
        />
        <CouponsPanel
          compactRows={layout.mode !== "wide"}
          couponRows={view.couponRows}
          dense={layout.dense}
          emptyLabel={view.couponEmptyLabel}
          stacked={layout.dense || view.couponsStacked}
          summary={view.couponSummary}
          width={view.width}
        />
      </Box>
    </Box>
  );
}

/**
 * Renders a text-only summary of the Codex limits result for narrow terminals.
 * @param view - TUI view model containing usage and coupon data.
 * @param terminalWidth - Terminal width used to truncate text.
 * @param terminalRows - Terminal row count used to limit visible coupon rows.
 * @returns - Ink text summary element.
 */
function renderTextSummary(
  view: TuiViewModel,
  terminalWidth: number,
  terminalRows: number
): ReactElement {
  const width = Math.max(Math.min(terminalWidth - 2, 96), 1);
  const visibleRows = view.couponRows.slice(0, Math.max(terminalRows - 8, 0));
  const hiddenRows = view.couponRows.length - visibleRows.length;

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={theme.title}>
        {truncateText("CODEX LIMITS", width)}
      </Text>
      <Text color={theme.muted}>
        {truncateText("Codex usage windows and reset credits", width)}
      </Text>
      <Text>{truncateText(`5-hour: ${formatUsageLine(view.usageCards[0])}`, width)}</Text>
      <Text>{truncateText(`Weekly: ${formatUsageLine(view.usageCards[1])}`, width)}</Text>
      <Text>
        {truncateText(`Available coupons: ${view.couponSummary.availableCoupons}`, width)}
      </Text>
      <Text>
        {truncateText(`Earned this period: ${view.couponSummary.earnedThisPeriod}`, width)}
      </Text>
      <Text>{truncateText(`Next expiration: ${view.couponSummary.nextExpiration}`, width)}</Text>
      <Text>{truncateText(`Time left: ${view.couponSummary.timeLeft}`, width)}</Text>
      {view.couponRows.length === 0 ? (
        <Text>{truncateText(view.couponEmptyLabel, width)}</Text>
      ) : (
        visibleRows.map((row) => (
          <Text key={row.index}>
            {truncateText(`${row.index}. ${row.status} - ${row.expires} - ${row.expiresOn}`, width)}
          </Text>
        ))
      )}
      {hiddenRows > 0 ? <Text>{truncateText(`… ${hiddenRows} more coupons`, width)}</Text> : null}
    </Box>
  );
}

/**
 * Formats a usage card into a single line of text for the text summary.
 * @param card - Usage card data or undefined if not available.
 * @returns - Formatted usage line string.
 */
function formatUsageLine(card: TuiViewModel["usageCards"][number] | undefined): string {
  return card ? `${card.remainingLabel}, ${card.resetLabel}` : "Unknown";
}

/**
 * Renders the Ink app with the specified Codex limits result and waits for exit.
 * @param result - Normalized Codex limits result to render.
 * @returns - Promise that resolves when the Ink app exits.
 */
export async function renderApp(result: CodexLimitsResult): Promise<void> {
  const terminalColumns = process.stdout.columns ?? 80;
  const terminalRows = process.stdout.rows ?? 24;
  const instance = render(
    <App result={result} terminalColumns={terminalColumns} terminalRows={terminalRows} />
  );
  await instance.waitUntilExit();
}
