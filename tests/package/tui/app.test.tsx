import {expect, test} from "bun:test";
import {render} from "ink-testing-library";
import type {CodexLimitsResult} from "@/package/core/types";
import {App} from "@/package/tui/app";
import {buildProgressBar} from "@/package/tui/components/primitives/progress-bar";
import {createTuiLayout} from "@/package/tui/layout";
import {createTuiViewModel} from "@/package/tui/view-model";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

const NOW = new Date("2026-07-05T10:00:30.000Z");

function renderFrame(result: CodexLimitsResult, columns: number, rows: number): string {
  const instance = render(
    <App result={result} terminalColumns={columns} terminalRows={rows} now={NOW} />
  );
  try {
    return instance.lastFrame() ?? "";
  } finally {
    instance.unmount();
  }
}

test("App renders available data without footer actions", () => {
  const frame = renderFrame(createFakeLimitsResult(), 132, 40);

  expect(frame).toContain("█████");
  expect(frame).toContain("Codex usage windows and reset credits");
  expect(frame).not.toContain("Overview");
  expect(frame).toContain("5-hour usage limit");
  expect(frame).not.toContain("Data source:");
  expect(frame).toContain("93% remaining");
  expect(frame).toContain("Weekly usage limit");
  expect(frame).toContain("11% remaining");
  expect(frame).toContain("RESET COUPONS");
  expect(frame).toContain("Summary");
  expect(frame).toContain("Coupons");
  expect(frame).toContain("Available coupons");
  expect(frame).toContain("Earned this period");
  expect(frame).toContain("Next expiration");
  expect(frame).toContain("Time left");
  expect(frame).not.toContain("Last local snapshot");
  expect(frame).toContain("Available");
  expect(frame).toContain("expires in 7d 4h 38m");
  expect(frame).toContain("7d 4h 38m");
  expect(frame).not.toContain("Press");
  expect(frame).not.toContain("Quit");
  expect(frame).not.toContain("40s");
});

test("App renders one merged weekly card when the API omits the 5-hour window", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour = null;
  const boxedFrame = renderFrame(result, 132, 40);
  const summaryFrame = renderFrame(result, 50, 14);

  expect(createTuiViewModel(result, 120, NOW).usageCards).toHaveLength(1);
  expect(boxedFrame).toContain("Weekly usage limit");
  expect(boxedFrame).toContain("11% remaining");
  expect(boxedFrame).not.toContain("5-hour usage limit");
  expect(summaryFrame).toContain("Weekly: 11% remaining");
  expect(summaryFrame).not.toContain("5-hour:");
});

test("App renders missing data fallbacks without secrets", () => {
  const frame = renderFrame(
    {
      ...createFakeLimitsResult(),
      windows: {fiveHour: null, weekly: null},
      coupons: null,
      warnings: ["Bearer fake-secret-token"],
    },
    72,
    40
  );

  expect(frame).toContain("Usage data unavailable.");
  expect(frame).not.toContain("5-hour usage limit");
  expect(frame).toContain("Summary");
  expect(frame).toContain("Coupons");
  expect(frame).toContain("Coupon data unavailable.");
  expect(frame).not.toContain("fake-secret-token");
});

test("Reset Coupons panel strips seconds from TUI durations", () => {
  const result = createFakeLimitsResult();
  result.coupons!.nextExpirationIn = "7d 4h 38m 40s";
  result.coupons!.items[0]!.expiresIn = "7d 4h 38m 40s";
  const frame = renderFrame(result, 132, 40);

  expect(frame).toContain("7d 4h 38m");
  expect(frame).not.toContain("40s");
});

test("App uses a compact stacked layout for narrow terminals", () => {
  const frame = renderFrame(createFakeLimitsResult(), 80, 40);
  const plainFrame = stripAnsi(frame);

  expect(frame).toContain("██████╗");
  expect(frame).toContain("██╗     ██╗███╗");
  expect(frame).toContain("5-hour usage limit");
  expect(frame).toContain("Weekly usage limit");
  expect(plainFrame).toContain("1 • Available • Sat 11 Jul");
});

test("App uses a text summary when the terminal is too short for boxes", () => {
  const frame = renderFrame(createFakeLimitsResult(), 50, 14);

  expect(frame).toContain("CODEX LIMITS");
  expect(frame).toContain("Codex usage windows and reset credits");
  expect(frame).toContain("5-hour: 93% remaining");
  expect(frame).toContain("Weekly: 11% remaining");
  expect(frame).toContain("Available coupons: 2");
  expect(frame).toContain("Earned this period: 4");
  expect(frame).toContain("1. Available");
  expect(frame).not.toContain("USAGE LIMITS");
  expect(frame).not.toContain("RESET COUPONS");
});

test("App keeps boxed panels at the short-height cutoff", () => {
  const frame = renderFrame(createFakeLimitsResult(), 50, 40);

  expect(frame).toContain("CODEX LIMITS");
  expect(frame).toContain("USAGE LIMITS");
  expect(frame).toContain("RESET COUPONS");
  expect(frame).not.toContain("5-hour: 93% remaining");
});

test("App remains readable in very small terminals and truncates extra coupons", () => {
  const result = createFakeLimitsResult();
  result.coupons!.items = Array.from({length: 6}, (_, index) => ({
    ...result.coupons!.items[0]!,
    index: index + 1,
  }));
  const plainFrame = stripAnsi(renderFrame(result, 20, 9));

  expect(plainFrame).toContain("CODEX LIMITS");
  expect(plainFrame).toContain("more coupons");
  for (const line of plainFrame.split("\n")) {
    expect(line.length).toBeLessThanOrEqual(18);
  }
});

test("layout boundaries are deterministic from startup dimensions", () => {
  expect(createTuiLayout(132, 40)).toMatchObject({mode: "wide", textSummary: false});
  expect(createTuiLayout(100, 40)).toMatchObject({mode: "standard", textSummary: false});
  expect(createTuiLayout(80, 40)).toMatchObject({mode: "compact", textSummary: false});
  expect(createTuiLayout(50, 14)).toMatchObject({mode: "ultra", textSummary: true});
  expect(createTuiLayout(20, 40)).toMatchObject({mode: "ultra", textSummary: true});
});

test("buildProgressBar renders percentages predictably", () => {
  expect(buildProgressBar(50, 10)).toBe("█████░░░░░");
  expect(buildProgressBar(null, 8)).toBe("░░░░░░░░");
  expect(buildProgressBar(50, -1)).toBe("");
  expect(buildProgressBar(50, Number.NaN)).toBe("");
});

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}
