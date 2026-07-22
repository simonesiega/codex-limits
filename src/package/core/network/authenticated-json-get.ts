import {request as httpRequest} from "node:http";
import type {ClientRequest, IncomingMessage} from "node:http";
import {request as httpsRequest} from "node:https";
import type {
  AuthenticatedJsonRequest,
  FetchLike,
  FetchResponseLike,
  JsonGetFailure,
  JsonGetFailureCode,
  JsonGetResult,
} from "@/package/core/types";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** Removes credentials, query parameters, and fragments from a public endpoint label. */
export function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "[invalid endpoint]";
  }
}

/** Performs one bounded authenticated JSON GET with a native Node fallback. */
export async function authenticatedJsonGet(
  request: AuthenticatedJsonRequest
): Promise<JsonGetResult> {
  const endpoint = validateEndpoint(request.endpoint);
  if (!endpoint.ok) {
    return endpoint;
  }

  if (request.signal?.aborted) {
    return failure("aborted");
  }

  const fetchImplementation = request.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    return requestWithNode(endpoint.url, request);
  }

  const fetched = await requestWithFetch(endpoint.url, request, fetchImplementation as FetchLike);
  if (
    fetched.ok ||
    fetched.code === "aborted" ||
    !shouldUseNativeFallback(fetched, request.fallbackOnHttpError ?? false)
  ) {
    return fetched;
  }

  const native = await requestWithNode(endpoint.url, request);
  // Prefer a definitive native response, but preserve the original fetch diagnostic otherwise.
  if (
    native.ok ||
    native.code === "http-error" ||
    native.code === "invalid-json" ||
    native.code === "response-too-large"
  ) {
    return native;
  }
  return fetched;
}

function validateEndpoint(endpoint: string): {ok: true; url: URL} | JsonGetFailure {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return failure("invalid-url");
  }

  if (url.username || url.password) {
    return failure("invalid-url");
  }

  if (url.protocol === "https:") {
    return {ok: true, url};
  }

  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    return {ok: true, url};
  }

  return failure("unsupported-protocol");
}

async function requestWithFetch(
  url: URL,
  request: AuthenticatedJsonRequest,
  fetchImplementation: FetchLike
): Promise<JsonGetResult> {
  const timeout = createRequestSignal(request.timeoutMs, request.signal);

  try {
    const response = await fetchImplementation(url.href, {
      method: "GET",
      headers: request.headers,
      redirect: "error",
      signal: timeout.signal,
    });

    if (!response.ok) {
      await cancelFetchBody(response);
      return failure("http-error", normalizeStatus(response.status));
    }

    const payload = await readFetchJson(response, request.maxResponseBytes);
    return {ok: true, status: normalizeStatus(response.status) ?? 200, payload, transport: "fetch"};
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return failure("response-too-large");
    }
    if (error instanceof InvalidJsonError) {
      return failure("invalid-json");
    }
    if (request.signal?.aborted) {
      return failure("aborted");
    }
    if (timeout.didTimeout()) {
      return failure("timeout");
    }
    return failure("network-error");
  } finally {
    timeout.dispose();
  }
}

async function readFetchJson(response: FetchResponseLike, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers?.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelFetchBody(response);
    throw new ResponseTooLargeError();
  }

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      if (!chunk.value) {
        continue;
      }

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel?.();
        throw new ResponseTooLargeError();
      }
      chunks.push(chunk.value);
    }

    const body = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      totalBytes
    ).toString("utf8");
    return parseJson(body);
  }

  if (response.text) {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new ResponseTooLargeError();
    }
    return parseJson(body);
  }

  // A response without a readable body cannot be size-bounded safely.
  throw new InvalidJsonError();
}

async function cancelFetchBody(response: FetchResponseLike): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await response.body.getReader().cancel?.();
  } catch {
    // Cancellation is best effort and never changes the public diagnostic.
  }
}

function requestWithNode(url: URL, request: AuthenticatedJsonRequest): Promise<JsonGetResult> {
  return new Promise((resolve) => {
    const timeout = createRequestSignal(request.timeoutMs, request.signal);
    let settled = false;
    let clientRequest: ClientRequest | null = null;

    const finish = (result: JsonGetResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      timeout.dispose();
      resolve(result);
    };

    const onAbort = (): void => {
      clientRequest?.destroy();
      finish(failure(request.signal?.aborted ? "aborted" : "timeout"));
    };
    timeout.signal.addEventListener("abort", onAbort, {once: true});

    try {
      const requestFunction = url.protocol === "http:" ? httpRequest : httpsRequest;
      clientRequest = requestFunction(
        url,
        {method: "GET", headers: request.headers, signal: timeout.signal},
        (response) => consumeNodeResponse(response, request.maxResponseBytes, finish)
      );
      clientRequest.on("error", () => {
        if (request.signal?.aborted) {
          finish(failure("aborted"));
        } else if (timeout.didTimeout()) {
          finish(failure("timeout"));
        } else {
          finish(failure("network-error"));
        }
      });
      clientRequest.end();
    } catch {
      finish(failure("network-error"));
    }
  });
}

function consumeNodeResponse(
  response: IncomingMessage,
  maxBytes: number,
  finish: (result: JsonGetResult) => void
): void {
  const status = normalizeStatus(response.statusCode);
  if (status === null || status < 200 || status >= 300) {
    response.resume();
    finish(failure("http-error", status));
    return;
  }

  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    response.destroy();
    finish(failure("response-too-large"));
    return;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  response.on("data", (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      response.destroy();
      finish(failure("response-too-large"));
      return;
    }
    chunks.push(buffer);
  });
  response.on("end", () => {
    try {
      const payload = parseJson(Buffer.concat(chunks, totalBytes).toString("utf8"));
      finish({ok: true, status, payload, transport: "node"});
    } catch {
      finish(failure("invalid-json"));
    }
  });
  response.on("error", () => finish(failure("network-error")));
}

function createRequestSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const safeTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(Math.floor(timeoutMs), 2_147_483_647)
      : 1;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, safeTimeoutMs);
  const abortFromCaller = (): void => controller.abort();
  callerSignal?.addEventListener("abort", abortFromCaller, {once: true});
  // Cover an abort that happened between the caller's initial check and listener registration.
  if (callerSignal?.aborted) {
    abortFromCaller();
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function shouldUseNativeFallback(result: JsonGetFailure, fallbackOnHttpError: boolean): boolean {
  return (
    result.code === "network-error" ||
    result.code === "timeout" ||
    result.code === "invalid-json" ||
    (fallbackOnHttpError && result.code === "http-error")
  );
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidJsonError();
  }
}

function normalizeStatus(status: number | undefined): number | null {
  return typeof status === "number" && Number.isInteger(status) && status >= 0 ? status : null;
}

function failure(code: JsonGetFailureCode, status: number | null = null): JsonGetFailure {
  return {ok: false, code, status};
}

class ResponseTooLargeError extends Error {}

class InvalidJsonError extends Error {}
