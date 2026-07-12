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
} from "../types";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/**
 * Sanitizes an endpoint URL by removing sensitive information such as username, password, query parameters, and fragments.
 * @param endpoint - The endpoint URL to sanitize.
 * @returns - The sanitized endpoint URL, or "[invalid endpoint]" if the input is not a valid URL.
 */
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

/**
 * Performs one bounded authenticated JSON GET with a native Node fallback.
 * @param request - The request object containing endpoint and headers.
 * @returns - A promise resolving to the result of the request.
 */
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
    (!shouldUseNativeFallback(fetched, request.fallbackOnHttpError ?? false) &&
      fetched.code !== "network-error")
  ) {
    return fetched;
  }

  const native = await requestWithNode(endpoint.url, request);
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

/**
 * Validates the provided endpoint URL, ensuring it is a valid URL with an acceptable protocol (HTTPS or HTTP for loopback hosts).
 * @param endpoint - The endpoint URL to validate.
 * @returns - An object indicating whether the validation was successful and, if so, the parsed URL; otherwise, a failure object with an appropriate error code.
 */
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

/**
 * Performs an authenticated JSON GET request using the Fetch API.
 * @param url - The URL to fetch.
 * @param request - The request object containing headers and other options.
 * @param fetchImplementation - The Fetch API implementation to use.
 * @returns - A promise resolving to the result of the request.
 */
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

/**
 * Reads the JSON payload from a Fetch response, ensuring it does not exceed the maximum allowed size.
 * @param response - The Fetch response to read.
 * @param maxBytes - The maximum number of bytes allowed for the response.
 * @returns - A promise resolving to the parsed JSON object.
 */
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

/**
 * Cancels the body of a Fetch response, if it exists.
 * @param response - The Fetch response whose body should be canceled.
 * @returns - A promise resolving when the cancellation is complete.
 */
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

/**
 * Returns a promise that resolves to the result of an authenticated JSON GET request using Node's HTTP/HTTPS modules.
 * @param url - The URL to request.
 * @param request - The request object containing headers and other options.
 * @returns - A promise resolving to the result of the request.
 */
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

/**
 * Reads the JSON payload from a Node.js HTTP response, ensuring it does not exceed the maximum allowed size.
 * @param response - The Node.js HTTP response to read.
 * @param maxBytes - The maximum number of bytes allowed for the response.
 * @param finish - The function to call with the result of the operation.
 * @returns - A promise resolving when the operation is complete.
 */
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

/**
 * Creates an abort signal for the request, with a timeout and optional caller signal.
 * @param timeoutMs - The timeout in milliseconds for the request.
 * @param callerSignal - An optional AbortSignal provided by the caller to allow external cancellation of the request.
 * @returns - An object containing the abort signal, a function to check if the request timed out, and a dispose function to clean up resources.
 */
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

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

/**
 * Determines whether to use the native Node fallback based on the result of a JSON GET request and the fallbackOnHttpError flag.
 * @param result - The result of the JSON GET request.
 * @param fallbackOnHttpError - A boolean indicating whether to fallback on HTTP errors.
 * @returns - A boolean indicating whether to use the native Node fallback.
 */
function shouldUseNativeFallback(result: JsonGetFailure, fallbackOnHttpError: boolean): boolean {
  return (
    result.code === "timeout" ||
    result.code === "invalid-json" ||
    (fallbackOnHttpError && result.code === "http-error")
  );
}

/**
 * Parses a JSON string into an object.
 * @param body - The JSON string to parse.
 * @returns - The parsed object.
 */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidJsonError();
  }
}

/**
 * Normalizes the status code to ensure it is a non-negative integer or null.
 * @param status - The status code to normalize.
 * @returns - The normalized status code, or null if it is not a valid non-negative integer.
 */
function normalizeStatus(status: number | undefined): number | null {
  return typeof status === "number" && Number.isInteger(status) && status >= 0 ? status : null;
}

/**
 * Creates a failure object with the specified code and status.
 * @param code - The failure code.
 * @param status - The status code, or null if not applicable.
 * @returns - The failure object.
 */
function failure(code: JsonGetFailureCode, status: number | null = null): JsonGetFailure {
  return {ok: false, code, status};
}

/**
 * Error class representing a response that exceeds the maximum allowed size.
 */
class ResponseTooLargeError extends Error {}

/**
 * Error class representing an invalid JSON response.
 */
class InvalidJsonError extends Error {}
