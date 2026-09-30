import type {FetchResponseLike} from "@/package/core/types";

/** Creates a streamed fetch response shape without relying on a global Response implementation. */
export function createFetchResponse(
  body: string,
  status = 200,
  responseHeaders: Readonly<Record<string, string>> = {}
): FetchResponseLike {
  const bytes = new TextEncoder().encode(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => responseHeaders[name.toLowerCase()] ?? null,
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) {
              return {done: true};
            }
            read = true;
            return {done: false, value: bytes};
          },
        };
      },
    },
  };
}
