import {expect, test} from "bun:test";
import {createServer} from "node:http";
import {authenticatedJsonGet} from "../../../src/package/core/network/authenticated-json-get";
import type {
  AuthenticatedJsonRequest,
  FetchLike,
  JsonGetFailureCode,
} from "../../../src/package/core/types";

const HEADERS = {
  Authorization: "Bearer fake-secret-token",
  "ChatGPT-Account-ID": "fake-account-id",
};

function request(
  fetch: FetchLike,
  overrides: Partial<AuthenticatedJsonRequest> = {}
): AuthenticatedJsonRequest {
  return {
    endpoint: "http://127.0.0.1:1/usage",
    headers: HEADERS,
    timeoutMs: 20,
    maxResponseBytes: 1_024,
    fetch,
    ...overrides,
  };
}

test("authenticatedJsonGet validates endpoints before sending credentials", async () => {
  let calls = 0;
  const fetch: FetchLike = async () => {
    calls += 1;
    return {ok: true, status: 200, json: async () => ({})};
  };

  const cases = [
    ["not a url", "invalid-url"],
    ["ftp://example.test/usage", "unsupported-protocol"],
    ["http://example.test/usage", "unsupported-protocol"],
    ["https://user:password@example.test/usage", "invalid-url"],
  ] as const;

  for (const [endpoint, code] of cases) {
    const result = await authenticatedJsonGet(request(fetch, {endpoint}));
    expect(result).toEqual({ok: false, code, status: null});
  }
  expect(calls).toBe(0);
});

test("authenticatedJsonGet returns bounded fetch JSON without exposing headers", async () => {
  const result = await authenticatedJsonGet(
    request(async (_url, init) => {
      expect(init.redirect).toBe("error");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({value: 42}),
        json: async () => ({value: 42}),
      };
    })
  );

  expect(result).toEqual({ok: true, status: 200, payload: {value: 42}, transport: "fetch"});
  expect(JSON.stringify(result)).not.toContain("fake-secret-token");
  expect(JSON.stringify(result)).not.toContain("fake-account-id");
});

test("authenticatedJsonGet rejects a fetch response without a readable bounded body", async () => {
  const result = await authenticatedJsonGet(request(async () => ({ok: true, status: 200})));

  expect(result).toEqual({ok: false, code: "invalid-json", status: null});
});

test("authenticatedJsonGet classifies HTTP, malformed, oversized, timeout, and abort failures", async () => {
  const controller = new AbortController();
  controller.abort();

  const cases: Array<{
    name: string;
    request: AuthenticatedJsonRequest;
    code: JsonGetFailureCode;
    status?: number | null;
  }> = [
    {
      name: "http",
      request: request(async () => ({ok: false, status: 503, json: async () => ({})})),
      code: "http-error",
      status: 503,
    },
    {
      name: "malformed JSON",
      request: request(async () => ({
        ok: true,
        status: 200,
        text: async () => "not-json",
        json: async () => {
          throw new Error("not-json");
        },
      })),
      code: "invalid-json",
    },
    {
      name: "oversized response",
      request: request(
        async () => ({
          ok: true,
          status: 200,
          headers: {get: () => "2048"},
          json: async () => ({}),
        }),
        {maxResponseBytes: 16}
      ),
      code: "response-too-large",
    },
    {
      name: "timeout",
      request: request(
        async (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("secret timeout")), {
              once: true,
            });
          }),
        {timeoutMs: 5}
      ),
      code: "timeout",
    },
    {
      name: "abort",
      request: request(async () => ({ok: true, status: 200, json: async () => ({})}), {
        signal: controller.signal,
      }),
      code: "aborted",
    },
  ];

  for (const item of cases) {
    const result = await authenticatedJsonGet(item.request);
    expect(result.ok, item.name).toBe(false);
    if (!result.ok) {
      expect(result.code, item.name).toBe(item.code);
      expect(result.status, item.name).toBe(item.status ?? null);
    }
  }
});

test("authenticatedJsonGet honors caller aborts while fetch is in flight", async () => {
  const controller = new AbortController();
  const pending = authenticatedJsonGet(
    request(
      async (_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
        }),
      {signal: controller.signal, timeoutMs: 1_000}
    )
  );

  controller.abort();

  expect(await pending).toEqual({ok: false, code: "aborted", status: null});
});

test("authenticatedJsonGet falls back from fetch to the bounded native transport", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({native: true}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address.");
    }

    const result = await authenticatedJsonGet(
      request(
        async () => {
          throw new Error("fetch failed with fake-secret-token");
        },
        {endpoint: `http://127.0.0.1:${address.port}/usage`}
      )
    );

    expect(result).toEqual({
      ok: true,
      status: 200,
      payload: {native: true},
      transport: "node",
    });
    expect(JSON.stringify(result)).not.toContain("fake-secret-token");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
