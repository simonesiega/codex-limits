import {Box, Text, render} from "ink";
import type {ReactElement} from "react";
import type {CodexLimitsResult} from "@/package/core/types";
import {CouponsPanel} from "@/package/tui/components/panels/coupons-panel";
import {UsagePanel} from "@/package/tui/components/panels/usage-panel";
import {Title} from "@/package/tui/components/primitives/title";
import {createTuiLayout} from "@/package/tui/layout";
import {theme} from "@/package/tui/theme";
import {truncateText} from "@/package/tui/text";
import {createTuiViewModel, type TuiViewModel} from "@/package/tui/view-model";

export interface AppProps {
  result: CodexLimitsResult;
  terminalColumns?: number;
  terminalRows?: number;
  width?: number;
  now?: Date;
}

/** Maps normalized core data into the responsive Ink dashboard. */
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
          emptyLabel={view.usageEmptyLabel}
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

function renderTextSummary(
  view: TuiViewModel,
  terminalWidth: number,
  terminalRows: number
): ReactElement {
  const width = Math.max(Math.min(terminalWidth - 2, 96), 1);
  const usageLineCount = Math.max(view.usageCards.length, 1);
  const visibleRows = view.couponRows.slice(0, Math.max(terminalRows - 6 - usageLineCount, 0));
  const hiddenRows = view.couponRows.length - visibleRows.length;

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={theme.title}>
        {truncateText("CODEX LIMITS", width)}
      </Text>
      <Text color={theme.muted}>
        {truncateText("Codex usage windows and reset credits", width)}
      </Text>
      {view.usageCards.length === 0 ? (
        <Text>{truncateText(view.usageEmptyLabel, width)}</Text>
      ) : (
        view.usageCards.map((card) => (
          <Text key={card.title}>
            {truncateText(`${formatUsageTitle(card.title)}: ${formatUsageLine(card)}`, width)}
          </Text>
        ))
      )}
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

function formatUsageLine(card: TuiViewModel["usageCards"][number]): string {
  return `${card.remainingLabel}, ${card.resetLabel}`;
}

function formatUsageTitle(title: string): string {
  return title.replace(/ usage limit$/i, "");
}

/** Renders the dashboard and waits until Ink exits. */
export async function renderApp(result: CodexLimitsResult): Promise<void> {
  const terminalColumns = process.stdout.columns ?? 80;
  const terminalRows = process.stdout.rows ?? 24;
  const instance = render(
    <App result={result} terminalColumns={terminalColumns} terminalRows={terminalRows} />
  );
  await instance.waitUntilExit();
}
