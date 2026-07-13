import {warningDiagnostic, type Diagnostic} from "@/package/core/diagnostics";
import type {JsonGetFailure} from "@/package/core/types";

/** Maps transport failures to stable diagnostics without carrying endpoint or exception details. */
export function diagnosticForJsonFailure(
  failure: JsonGetFailure,
  subject: "Live reset coupon" | "Live usage"
): Diagnostic {
  switch (failure.code) {
    case "aborted":
      return warningDiagnostic(
        "network.request.aborted",
        "network",
        `${subject} lookup was cancelled.`
      );
    case "http-error":
      return warningDiagnostic(
        "network.response.http",
        "network",
        failure.status === null
          ? `${subject} endpoint returned an invalid HTTP status.`
          : `${subject} endpoint returned HTTP ${failure.status}.`
      );
    case "invalid-json":
      return warningDiagnostic(
        "network.response.invalid-json",
        "network",
        `${subject} endpoint returned malformed JSON.`
      );
    case "invalid-url":
      return warningDiagnostic(
        "network.endpoint.invalid",
        "network",
        `${subject} endpoint URL is invalid.`
      );
    case "response-too-large":
      return warningDiagnostic(
        "network.response.too-large",
        "network",
        `${subject} endpoint response was too large.`
      );
    case "timeout":
      return warningDiagnostic(
        "network.request.timeout",
        "network",
        `${subject} lookup timed out.`
      );
    case "unsupported-protocol":
      return warningDiagnostic(
        "network.endpoint.protocol",
        "network",
        `${subject} endpoint must use HTTPS or loopback HTTP.`
      );
    case "network-error":
      return warningDiagnostic("network.request.failed", "network", `${subject} lookup failed.`);
  }
}
