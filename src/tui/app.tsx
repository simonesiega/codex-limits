import { Box, render } from "ink";
import type { ReactElement } from "react";
import type { CodexLimitsResult } from "../core/types";
import { CouponsPanel } from "./components/panels/coupons-panel";
import { UsagePanel } from "./components/panels/usage-panel";
import { Title } from "./components/primitives/title";
import { createTuiViewModel } from "./view-model";

/** Props for the root Ink app. */
export interface AppProps {
  /** Normalized Codex limits result to render. */
  result: CodexLimitsResult;
  /** Optional width override used by tests. */
  width?: number;
  /** Optional clock override used by tests. */
  now?: Date;
}

/**
 * Renders the read-only codex-limits terminal dashboard.
 *
 * @param props - Normalized core result and optional layout overrides.
 * @returns Ink app element.
 */
export function App({ result, width, now }: AppProps): ReactElement {
  const columns = width ?? process.stdout.columns ?? 80;
  const contentWidth = Math.min(Math.max(columns - 2, 60), 104);
  const view = createTuiViewModel(result, contentWidth, now);

  return (
    <Box justifyContent="center" width={columns}>
      <Box flexDirection="column" width={view.width}>
        <Title width={view.width} />
        <UsagePanel cards={view.usageCards} stacked={view.stacked} width={view.width} />
        <CouponsPanel couponRows={view.couponRows} emptyLabel={view.couponEmptyLabel} stacked={view.couponsStacked} summary={view.couponSummary} width={view.width} />
      </Box>
    </Box>
  );
}

/**
 * Renders the Ink app and waits until it exits.
 *
 * @param result - Normalized Codex limits result to render.
 * @returns A promise that resolves after Ink exits.
 */
export async function renderApp(result: CodexLimitsResult): Promise<void> {
  const instance = render(<App result={result} />);
  await instance.waitUntilExit();
}
