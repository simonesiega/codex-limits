import {createServer, type RequestListener} from "node:http";

/** Runs a test against an ephemeral loopback HTTP server and always closes it. */
export async function withLoopbackServer<T>(
  listener: RequestListener,
  run: (origin: string) => Promise<T>
): Promise<T> {
  const server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Expected a TCP address.");
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
