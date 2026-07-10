import {Box, Text, render} from "ink";
import type {ReactElement} from "react";
import type {CodexLimitsResult} from "../core/types";
import {CouponsPanel} from "./components/panels/coupons-panel";
import {UsagePanel} from "./components/panels/usage-panel";
import {Title} from "./components/primitives/title";
import {theme} from "./theme";
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

type LayoutMode = "wide" | "standard" | "compact" | "ultra";

/**
 * Renders the read-only codex-limits terminal dashboard.
 *
 * @param props - Normalized core result and optional layout overrides.
 * @returns Ink app element.
 */
export function App({result, terminalColumns, terminalRows, width, now}: AppProps): ReactElement {
  const columns = terminalColumns ?? width ?? process.stdout.columns ?? 80;
  const rows = terminalRows ?? process.stdout.rows ?? 24;
  const terminalWidth = Math.max(columns, 1);
  const mode = getLayoutMode(terminalWidth, rows);
  const contentWidth = getContentWidth(terminalWidth, mode);
  const view = createTuiViewModel(result, contentWidth, now);
  const dense = mode === "compact" || mode === "ultra";
  const stacked = dense || view.stacked;

  if (shouldUseTextSummary(rows)) {
    return renderTextSummary(view, terminalWidth);
  }

  return (
    <Box justifyContent="center" width={terminalWidth}>
      <Box flexDirection="column" width={view.width}>
        <Title
          showLarge={shouldShowLargeLogo(terminalWidth, rows)}
          showStyled={shouldShowStyledLogo(terminalWidth, rows)}
          width={view.width}
        />
        <UsagePanel cards={view.usageCards} dense={dense} stacked={stacked} width={view.width} />
        <CouponsPanel
          compactRows={mode !== "wide"}
          couponRows={view.couponRows}
          dense={dense}
          emptyLabel={view.couponEmptyLabel}
          stacked={dense || view.couponsStacked}
          summary={view.couponSummary}
          width={view.width}
        />
      </Box>
    </Box>
  );
}

function getLayoutMode(columns: number, rows: number): LayoutMode {
  if (columns < 70 || rows < 18) {
    return "ultra";
  }

  if (columns < 100 || rows < 28) {
    return "compact";
  }

  if (columns < 130) {
    return "standard";
  }

  return "wide";
}

function getContentWidth(columns: number, mode: LayoutMode): number {
  const maxWidth = mode === "wide" ? 120 : mode === "standard" ? 104 : 96;
  return Math.max(Math.min(columns - 2, maxWidth), 1);
}

function shouldShowLargeLogo(columns: number, rows: number): boolean {
  return columns >= 130 && rows >= 28;
}

function shouldShowStyledLogo(columns: number, rows: number): boolean {
  return columns >= 72 && rows >= 40;
}

function shouldUseTextSummary(rows: number): boolean {
  return rows < 40;
}

function renderTextSummary(view: TuiViewModel, terminalWidth: number): ReactElement {
  const width = Math.max(Math.min(terminalWidth - 2, 96), 1);

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
        view.couponRows.map((row) => (
          <Text key={row.index}>
            {truncateText(`${row.index}. ${row.status} - ${row.expires} - ${row.expiresOn}`, width)}
          </Text>
        ))
      )}
    </Box>
  );
}

function formatUsageLine(card: TuiViewModel["usageCards"][number] | undefined): string {
  if (!card) {
    return "Unknown";
  }

  return `${card.remainingLabel}, ${card.resetLabel}`;
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

/**
 * Renders the Ink app and waits until it exits.
 *
 * @param result - Normalized Codex limits result to render.
 * @returns A promise that resolves after Ink exits.
 */
export async function renderApp(result: CodexLimitsResult): Promise<void> {
  const terminalColumns = process.stdout.columns ?? 80;
  const terminalRows = process.stdout.rows ?? 24;
  const instance = render(
    <App result={result} terminalColumns={terminalColumns} terminalRows={terminalRows} />
  );
  await instance.waitUntilExit();
}
