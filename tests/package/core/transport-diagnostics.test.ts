import {expect, test} from "bun:test";
import {diagnosticForJsonFailure} from "@/package/core/network/transport-diagnostics";
import type {JsonGetFailure} from "@/package/core/types";

test("transport failures map to stable endpoint-free diagnostics", () => {
  const cases: Array<{
    failure: JsonGetFailure;
    subject: "Live reset coupon" | "Live usage";
    code: string;
    message: string;
  }> = [
    {
      failure: {ok: false, code: "aborted", status: null},
      subject: "Live usage",
      code: "network.request.aborted",
      message: "Live usage lookup was cancelled.",
    },
    {
      failure: {ok: false, code: "http-error", status: 503},
      subject: "Live reset coupon",
      code: "network.response.http",
      message: "Live reset coupon endpoint returned HTTP 503.",
    },
    {
      failure: {ok: false, code: "http-error", status: null},
      subject: "Live usage",
      code: "network.response.http",
      message: "Live usage endpoint returned an invalid HTTP status.",
    },
    {
      failure: {ok: false, code: "invalid-json", status: null},
      subject: "Live usage",
      code: "network.response.invalid-json",
      message: "Live usage endpoint returned malformed JSON.",
    },
    {
      failure: {ok: false, code: "invalid-url", status: null},
      subject: "Live usage",
      code: "network.endpoint.invalid",
      message: "Live usage endpoint URL is invalid.",
    },
    {
      failure: {ok: false, code: "response-too-large", status: null},
      subject: "Live usage",
      code: "network.response.too-large",
      message: "Live usage endpoint response was too large.",
    },
    {
      failure: {ok: false, code: "timeout", status: null},
      subject: "Live usage",
      code: "network.request.timeout",
      message: "Live usage lookup timed out.",
    },
    {
      failure: {ok: false, code: "unsupported-protocol", status: null},
      subject: "Live usage",
      code: "network.endpoint.protocol",
      message: "Live usage endpoint must use HTTPS or loopback HTTP.",
    },
    {
      failure: {ok: false, code: "network-error", status: null},
      subject: "Live usage",
      code: "network.request.failed",
      message: "Live usage lookup failed.",
    },
  ];

  for (const item of cases) {
    expect(diagnosticForJsonFailure(item.failure, item.subject), item.failure.code).toEqual({
      code: item.code,
      source: "network",
      severity: "warning",
      message: item.message,
    });
  }
});
