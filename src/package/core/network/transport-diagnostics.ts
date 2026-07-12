import {warningDiagnostic, type Diagnostic} from "../diagnostics";
import type {JsonGetFailure} from "../types";

/**
 * Determines the appropriate diagnostic for a JSON GET failure, based on the failure code and the subject of the request.
 * @param failure - The JSON GET failure object containing the failure code and status.
 * @param subject - A string indicating the subject of the request, either "Live reset coupon" or "Live usage".
 * @returns - A Diagnostic object representing the appropriate warning for the failure.
 */
export function diagnosticForJsonFailure(
  failure: JsonGetFailure,
  subject: "Live reset coupon" | "Live usage"
): Diagnostic {
  // Map the failure code to a corresponding warning diagnostic.
  switch (failure.code) {
    // Aborted case - The request was cancelled, possibly due to an external signal or user action.
    case "aborted":
      return warningDiagnostic(
        "network.request.aborted",
        "network",
        `${subject} lookup was cancelled.`
      );

    // HTTP error case - The request received an invalid or unexpected HTTP status code.
    case "http-error":
      return warningDiagnostic(
        "network.response.http",
        "network",
        failure.status === null
          ? `${subject} endpoint returned an invalid HTTP status.`
          : `${subject} endpoint returned HTTP ${failure.status}.`
      );

    // Invalid JSON case - The response body could not be parsed as valid JSON.
    case "invalid-json":
      return warningDiagnostic(
        "network.response.invalid-json",
        "network",
        `${subject} endpoint returned malformed JSON.`
      );

    // Invalid URL case - The endpoint URL provided for the request is not valid.
    case "invalid-url":
      return warningDiagnostic(
        "network.endpoint.invalid",
        "network",
        `${subject} endpoint URL is invalid.`
      );

    // Response too large case - The response body exceeded the maximum allowed size.
    case "response-too-large":
      return warningDiagnostic(
        "network.response.too-large",
        "network",
        `${subject} endpoint response was too large.`
      );

    // Timeout case - The request took longer than the specified timeout duration.
    case "timeout":
      return warningDiagnostic(
        "network.request.timeout",
        "network",
        `${subject} lookup timed out.`
      );

    // Unsupported protocol case - The endpoint URL uses an unsupported protocol (not HTTPS or loopback HTTP).
    case "unsupported-protocol":
      return warningDiagnostic(
        "network.endpoint.protocol",
        "network",
        `${subject} endpoint must use HTTPS or loopback HTTP.`
      );

    // Network error case - A general network error occurred during the request.
    case "network-error":
      return warningDiagnostic("network.request.failed", "network", `${subject} lookup failed.`);
  }
}
