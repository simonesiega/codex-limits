import {expect, test} from "bun:test";
import {render} from "ink-testing-library";
import {App} from "../../../src/package/tui/app";
import {buildProgressBar} from "../../../src/package/tui/components/primitives/progress-bar";
import {createFakeLimitsResult} from "../fixtures/fake-results";

test("App renders available data without footer actions", () => {
  const result = createFakeLimitsResult();
  const instance = render(
    <App
      result={result}
      terminalColumns={132}
      terminalRows={40}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";

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

  instance.unmount();
});

test("App renders missing data fallbacks without secrets", () => {
  const result = {
    ...createFakeLimitsResult(),
    windows: {fiveHour: null, weekly: null},
    coupons: null,
    warnings: ["Bearer fake-secret-token"],
  };
  const instance = render(
    <App
      result={result}
      terminalColumns={72}
      terminalRows={40}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";

  expect(frame).toContain("Unknown remaining");
  expect(frame).toContain("Summary");
  expect(frame).toContain("Coupons");
  expect(frame).toContain("Coupon data unavailable.");
  expect(frame).not.toContain("fake-secret-token");

  instance.unmount();
});

test("Reset Coupons panel strips seconds from TUI durations", () => {
  const result = createFakeLimitsResult();
  result.coupons!.nextExpirationIn = "7d 4h 38m 40s";
  result.coupons!.items[0]!.expiresIn = "7d 4h 38m 40s";
  const instance = render(
    <App
      result={result}
      terminalColumns={132}
      terminalRows={40}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";

  expect(frame).toContain("7d 4h 38m");
  expect(frame).not.toContain("40s");

  instance.unmount();
});

test("App uses a compact stacked layout for narrow terminals", () => {
  const result = createFakeLimitsResult();
  const instance = render(
    <App
      result={result}
      terminalColumns={80}
      terminalRows={40}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";
  const plainFrame = stripAnsi(frame);

  expect(frame).toContain("██████╗");
  expect(frame).toContain("██╗     ██╗███╗");
  expect(frame).toContain("5-hour usage limit");
  expect(frame).toContain("Weekly usage limit");
  expect(plainFrame).toContain("1 • Available • Sat 11 Jul");

  instance.unmount();
});

test("App uses a text summary when the terminal is too short for boxes", () => {
  const result = createFakeLimitsResult();
  const instance = render(
    <App
      result={result}
      terminalColumns={50}
      terminalRows={14}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";

  expect(frame).toContain("CODEX LIMITS");
  expect(frame).toContain("Codex usage windows and reset credits");
  expect(frame).toContain("5-hour: 93% remaining");
  expect(frame).toContain("Weekly: 11% remaining");
  expect(frame).toContain("Available coupons: 2");
  expect(frame).toContain("Earned this period: 4");
  expect(frame).toContain("1. Available");
  expect(frame).not.toContain("USAGE LIMITS");
  expect(frame).not.toContain("RESET COUPONS");

  instance.unmount();
});

test("App keeps boxed panels at the short-height cutoff", () => {
  const result = createFakeLimitsResult();
  const instance = render(
    <App
      result={result}
      terminalColumns={50}
      terminalRows={40}
      now={new Date("2026-07-05T10:00:30.000Z")}
    />
  );
  const frame = instance.lastFrame() ?? "";

  expect(frame).toContain("CODEX LIMITS");
  expect(frame).toContain("USAGE LIMITS");
  expect(frame).toContain("RESET COUPONS");
  expect(frame).not.toContain("5-hour: 93% remaining");

  instance.unmount();
});

test("buildProgressBar renders percentages predictably", () => {
  expect(buildProgressBar(50, 10)).toBe("█████░░░░░");
  expect(buildProgressBar(null, 8)).toBe("░░░░░░░░");
});

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}
