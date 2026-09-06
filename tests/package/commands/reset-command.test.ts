import {expect, test} from "bun:test";
import {runCli} from "@/package/commands/run-cli";
import type {Prompt} from "@/package/commands/runtime";
import type {CouponResult, ResetCouponResult} from "@/package/core/types";
import {createFakeCouponResult} from "@tests/package/fixtures/fake-results";

interface ResetRunOptions {
  args: string[];
  answer?: string;
  closeFailure?: boolean;
  coupons?: CouponResult;
  interactive?: boolean;
  promptFailure?: "answer" | "creation";
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
      if (options.promptFailure === "answer") {
        throw new Error("Bearer fake-secret-token at C:/private/auth.json");
      }
      return options.answer ?? "y";
    },
    {
      close: () => {
        closed = true;
        if (options.closeFailure) {
          throw new Error("private prompt close failure");
        }
      },
    }
  ) satisfies Prompt;

  const exitCode = await runCli(options.args, {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
      interactive: options.interactive ?? true,
      createPrompt: () => {
        if (options.promptFailure === "creation") {
          throw new Error("Bearer fake-secret-token at C:/private/auth.json");
        }
        return prompt;
      },
    },
    reset: {
      loadCoupons: async () => {
        loads += 1;
        return options.coupons ?? createFakeCouponResult();
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

test("reset rejects unavailable or unverifiable selections without prompting", async () => {
  const unavailable = createFakeCouponResult();
  unavailable.status = "unavailable";
  const noCoupons = createFakeCouponResult();
  noCoupons.available = 0;
  noCoupons.items = [];
  const redeemed = createFakeCouponResult();
  redeemed.items[0]!.status = "redeemed";
  const partial = createFakeCouponResult();
  partial.status = "partial";
  const missingIdentifier = createFakeCouponResult();
  missingIdentifier.items[0]!.id = null;

  const cases: Array<{
    name: string;
    args: string[];
    coupons: CouponResult;
    exitCode: number;
    stdout?: string;
    stderr?: string;
  }> = [
    {
      name: "coupon data unavailable",
      args: ["reset", "--soonest"],
      coupons: unavailable,
      exitCode: 1,
      stderr: "Reset coupon data is unavailable. Run `codex-limits coupons` for details.\n",
    },
    {
      name: "no available coupons",
      args: ["reset", "--soonest"],
      coupons: noCoupons,
      exitCode: 0,
      stdout: "No reset coupons are available. No coupon was used.\n",
    },
    {
      name: "missing index",
      args: ["reset", "6"],
      coupons: createFakeCouponResult(),
      exitCode: 1,
      stderr: "The coupon index was not found in the current reset coupon list.\n",
    },
    {
      name: "redeemed coupon",
      args: ["reset", "1"],
      coupons: redeemed,
      exitCode: 0,
      stdout: "The selected reset coupon is not available. No coupon was used.\n",
    },
    {
      name: "partial coupon details",
      args: ["reset", "--soonest"],
      coupons: partial,
      exitCode: 1,
      stderr: "Available reset coupon details could not be verified. No coupon was used.\n",
    },
    {
      name: "missing coupon identifier",
      args: ["reset", "1"],
      coupons: missingIdentifier,
      exitCode: 1,
      stderr: "Available reset coupon details could not be verified. No coupon was used.\n",
    },
  ];

  for (const item of cases) {
    const run = await runReset({args: item.args, coupons: item.coupons});

    expect(run.exitCode, item.name).toBe(item.exitCode);
    expect(run.output.join(""), item.name).toBe(item.stdout ?? "");
    expect(run.errors.join(""), item.name).toBe(item.stderr ?? "");
    expect(run.questions, item.name).toEqual([]);
    expect(run.consumed, item.name).toEqual([]);
  }
});

test("reset never consumes a coupon when interactive confirmation fails", async () => {
  for (const promptFailure of ["creation", "answer"] as const) {
    const run = await runReset({args: ["reset", "--soonest"], promptFailure});

    expect(run.exitCode, promptFailure).toBe(1);
    expect(run.consumed, promptFailure).toEqual([]);
    expect(run.errors.join(""), promptFailure).toBe(
      "codex-limits reset: Interactive confirmation failed. No coupon was used.\n"
    );
    expect(run.errors.join(""), promptFailure).not.toContain("fake-secret-token");
    expect(run.closed, promptFailure).toBe(promptFailure === "answer");
  }
});

test("reset keeps a confirmed redemption when prompt cleanup fails", async () => {
  const run = await runReset({args: ["reset", "--soonest"], closeFailure: true});

  expect(run.exitCode).toBe(0);
  expect(run.closed).toBe(true);
  expect(run.consumed).toEqual(["RateLimitResetCredit_test-1"]);
  expect(run.errors).toEqual([]);
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
