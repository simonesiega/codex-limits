import {
  hasOption,
  type OptionDefinition,
  type RemoteMutationCommandDefinition,
} from "@/package/commands/command";
import {formatResetOutcome, formatResetRecap} from "@/package/commands/reset/format";
import type {CliIo, Prompt, ResetServices} from "@/package/commands/runtime";
import {selectResetCoupon, type ResetCouponSelection} from "@/package/core/coupons/selection";

const SOONEST_OPTION_KEY = "reset.soonest";

const SOONEST_OPTION: OptionDefinition = {
  key: SOONEST_OPTION_KEY,
  long: "--soonest",
  description: "Select the available coupon that expires first",
  kind: "boolean",
};

interface ResetCommandDependencies {
  io: CliIo;
  reset: ResetServices;
}

/** Creates the confirmed remote command for consuming one reset coupon. */
export function createResetCommand(
  dependencies: ResetCommandDependencies
): RemoteMutationCommandDefinition {
  return {
    id: "reset",
    path: ["reset"],
    description: "Consume one coupon to reset current Codex usage limits",
    usage: ["codex-limits reset --soonest", "codex-limits reset <coupon-index>"],
    options: [SOONEST_OPTION],
    positionals: [
      {
        name: "coupon-index",
        description: "Displayed reset-coupon number to consume",
      },
    ],
    safety: "remote-mutation",
    safetyNote:
      "Consumes one remote reset coupon only after an exact selection, a recap, and interactive confirmation.",
    failureMessage: "Could not use the reset coupon.",
    confirmation: {kind: "interactive"},
    validate(values) {
      const couponIndex = values.positionals[0];
      const useSoonest = hasOption(values, SOONEST_OPTION_KEY);
      if (!couponIndex && !useSoonest) {
        return {
          code: "invalid-positional",
          message: "Provide a coupon index or use --soonest.",
        };
      }
      if (couponIndex && useSoonest) {
        return {
          code: "conflicting-options",
          message: "A coupon index cannot be combined with --soonest.",
        };
      }
      return couponIndex && parseCouponIndex(couponIndex) === null
        ? {
            code: "invalid-positional",
            message: "Coupon index must be a positive whole number.",
          }
        : null;
    },
    async execute(values) {
      if (!dependencies.io.interactive) {
        dependencies.io.stderr(
          "codex-limits reset requires an interactive terminal for the final confirmation.\n"
        );
        return 1;
      }

      const couponIndex = values.positionals[0];
      const selection: ResetCouponSelection = couponIndex
        ? {kind: "index", couponIndex: parseCouponIndex(couponIndex)!}
        : {kind: "soonest"};
      const coupons = await dependencies.reset.loadCoupons();
      if (coupons.status === "unavailable") {
        dependencies.io.stderr(
          "Reset coupon data is unavailable. Run `codex-limits coupons` for details.\n"
        );
        return 1;
      }

      const selected = selectResetCoupon(coupons, selection);
      switch (selected.kind) {
        case "not-found":
          dependencies.io.stderr(
            "The coupon index was not found in the current reset coupon list.\n"
          );
          return 1;
        case "not-available":
          dependencies.io.stdout(
            "The selected reset coupon is not available. No coupon was used.\n"
          );
          return 0;
        case "none-available":
          dependencies.io.stdout("No reset coupons are available. No coupon was used.\n");
          return 0;
        case "details-unavailable":
          dependencies.io.stderr(
            "Available reset coupon details could not be verified. No coupon was used.\n"
          );
          return 1;
        case "selected":
          break;
      }

      if (!selected.coupon.id) {
        dependencies.io.stderr(
          "Available reset coupon details could not be verified. No coupon was used.\n"
        );
        return 1;
      }

      dependencies.io.stdout(formatResetRecap(selected.coupon, selection.kind, coupons.available));
      const confirmed = await promptForConfirmation(dependencies.io);
      if (confirmed === null) {
        return 1;
      }
      if (!confirmed) {
        dependencies.io.stdout("Reset cancelled. No coupon was used.\n");
        return 0;
      }

      const result = await dependencies.reset.consumeCoupon(selected.coupon.id);
      const output = formatResetOutcome(result);
      if (result.outcome === "unconfirmed") {
        dependencies.io.stderr(output);
        return 1;
      }
      dependencies.io.stdout(output);
      return 0;
    },
  };
}

function parseCouponIndex(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const index = Number(value);
  return Number.isSafeInteger(index) && index > 0 ? index : null;
}

async function promptForConfirmation(io: CliIo): Promise<boolean | null> {
  let prompt: Prompt;
  try {
    prompt = io.createPrompt();
  } catch {
    io.stderr("codex-limits reset: Interactive confirmation failed. No coupon was used.\n");
    return null;
  }

  try {
    const answer = await prompt("Use this reset coupon? Type y to confirm [y/N] ");
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } catch {
    io.stderr("codex-limits reset: Interactive confirmation failed. No coupon was used.\n");
    return null;
  } finally {
    try {
      await prompt.close?.();
    } catch {
      // Closing a completed prompt cannot change whether the user confirmed.
    }
  }
}
