import {
  getOutputFormat,
  JSON_OPTION,
  type ReadOnlyCommandDefinition,
} from "@/package/commands/command";
import {formatCoupons} from "@/package/commands/coupons/format";
import {formatJson} from "@/package/commands/format-json";
import {toCouponSummaryDto} from "@/package/commands/public-dto";
import type {CliIo, CouponServices} from "@/package/commands/runtime";

interface CouponsCommandDependencies {
  io: Pick<CliIo, "stdout">;
  coupons: CouponServices;
}

/** Creates the coupon command with shared text/JSON output handling. */
export function createCouponsCommand(
  dependencies: CouponsCommandDependencies
): ReadOnlyCommandDefinition {
  return {
    id: "coupons",
    path: ["coupons"],
    description: "Print reset-credit coupon information",
    usage: ["codex-limits coupons [--json]"],
    options: [JSON_OPTION],
    safety: "read-only",
    safetyNote: "Reads reset-credit information without redeeming or changing coupons.",
    failureMessage: "Could not load reset coupon data.",
    async execute(values) {
      const result = await dependencies.coupons.loadCoupons();
      const output =
        getOutputFormat(values) === "json"
          ? formatJson(toCouponSummaryDto(result))
          : formatCoupons(result);
      dependencies.io.stdout(output);
      return 0;
    },
  };
}
