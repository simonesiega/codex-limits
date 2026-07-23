import {expect, test} from "bun:test";
import {runCli} from "@/package/commands/run-cli";
import type {Prompt} from "@/package/commands/runtime";
import type {ResetCouponResult} from "@/package/core/types";
import {createFakeCouponResult} from "@tests/package/fixtures/fake-results";

interface ResetRunOptions {
  args: string[];
  answer?: string;
  interactive?: boolean;
  result?: ResetCouponResult;
}

async function runReset(options: ResetRunOptions) {
  const output: string[] = [];
  const errors: string[] = [];
  const questions: string[] = [];
  const consumed: string[] = [];
  let loads = 0;
  let closed = false;
  const prompt = Object.assign(
    async (question: string) => {
      questions.push(question);
      return options.answer ?? "y";
    },
    {
      close: () => {
        closed = true;
      },
    }
  ) satisfies Prompt;

  const exitCode = await runCli(options.args, {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
      interactive: options.interactive ?? true,
      createPrompt: () => prompt,
    },
    reset: {
      loadCoupons: async () => {
        loads += 1;
        return createFakeCouponResult();
      },
      consumeCoupon: async (couponId) => {
        consumed.push(couponId);
        return options.result ?? {outcome: "reset", windowsReset: 2};
      },
    },
  });

  return {closed, consumed, errors, exitCode, loads, output, questions};
}

test("reset uses the soonest-expiring coupon only after the recap and y confirmation", async () => {
  const run = await runReset({args: ["reset", "--soonest"]});

  expect(run.exitCode).toBe(0);
  expect(run.loads).toBe(1);
  expect(run.consumed).toEqual(["RateLimitResetCredit_test-1"]);
  expect(run.output.join("")).toContain("Selected coupon: #1 (soonest-expiring available coupon)");
  expect(run.output.join("")).toContain("A consumed coupon cannot be restored.");
  expect(run.output.join("")).toContain(
    "Codex usage reset successfully. One coupon was used, and 2 usage windows were reset."
  );
  expect(run.questions).toEqual(["Use this reset coupon? Type y to confirm [y/N] "]);
  expect(run.closed).toBe(true);
  expect(run.errors).toEqual([]);
});

test("reset accepts a displayed coupon index and does not consume it when declined", async () => {
  const run = await runReset({
    args: ["reset", "2"],
    answer: "n",
  });

  expect(run.exitCode).toBe(0);
  expect(run.consumed).toEqual([]);
  expect(run.output.join("")).toContain("Selected coupon: #2 (selected coupon index)");
  expect(run.output.join("")).toContain("Reset cancelled. No coupon was used.");
  expect(run.closed).toBe(true);
});

test("reset requires an interactive terminal", async () => {
  const nonInteractive = await runReset({
    args: ["reset", "--soonest"],
    interactive: false,
  });
  expect(nonInteractive.exitCode).toBe(1);
  expect(nonInteractive.loads).toBe(0);
  expect(nonInteractive.errors.join("")).toContain(
    "Command reset requires an interactive terminal for confirmation."
  );
});

test("reset reports missing and unavailable coupon selections without prompting", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  let prompts = 0;
  let consumes = 0;
  const noCoupons = createFakeCouponResult();
  noCoupons.available = 0;
  noCoupons.items = [];

  const noCouponExit = await runCli(["reset", "--soonest"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
      interactive: true,
      createPrompt: () => {
        prompts += 1;
        return async () => "y";
      },
    },
    reset: {
      loadCoupons: async () => noCoupons,
      consumeCoupon: async () => {
        consumes += 1;
        return {outcome: "reset", windowsReset: 2};
      },
    },
  });
  expect(noCouponExit).toBe(0);
  expect(output.join("")).toBe("No reset coupons are available. No coupon was used.\n");

  output.length = 0;
  const missingIndexExit = await runCli(["reset", "6"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
      interactive: true,
      createPrompt: () => {
        prompts += 1;
        return async () => "y";
      },
    },
    reset: {
      loadCoupons: async () => createFakeCouponResult(),
      consumeCoupon: async () => {
        consumes += 1;
        return {outcome: "reset", windowsReset: 2};
      },
    },
  });
  expect(missingIndexExit).toBe(1);
  expect(errors.join("")).toContain("coupon index was not found");
  expect(prompts).toBe(0);
  expect(consumes).toBe(0);
});

test("reset never consumes a coupon when interactive confirmation fails", async () => {
  const errors: string[] = [];
  let consumes = 0;
  const exitCode = await runCli(["reset", "--soonest"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
      interactive: true,
      createPrompt: () => {
        throw new Error("Bearer fake-secret-token at C:/private/auth.json");
      },
    },
    reset: {
      loadCoupons: async () => createFakeCouponResult(),
      consumeCoupon: async () => {
        consumes += 1;
        return {outcome: "reset", windowsReset: 2};
      },
    },
  });

  expect(exitCode).toBe(1);
  expect(consumes).toBe(0);
  expect(errors.join("")).toBe(
    "codex-limits reset: Interactive confirmation failed. No coupon was used.\n"
  );
  expect(errors.join("")).not.toContain("fake-secret-token");
});

test("reset reports non-consuming service outcomes and ambiguous results honestly", async () => {
  const noCredit = await runReset({
    args: ["reset", "--soonest"],
    result: {outcome: "no-credit", windowsReset: 0},
  });
  expect(noCredit.exitCode).toBe(0);
  expect(noCredit.output.join("")).toContain("no longer available. No coupon was used.");

  const unconfirmed = await runReset({
    args: ["reset", "--soonest"],
    result: {outcome: "unconfirmed", windowsReset: null},
  });
  expect(unconfirmed.exitCode).toBe(1);
  expect(unconfirmed.errors.join("")).toBe(
    "The reset result could not be confirmed. Check your limits before trying again.\n"
  );
});
