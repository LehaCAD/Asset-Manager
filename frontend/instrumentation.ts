/**
 * Next.js 14+ instrumentation hook — wires Sentry on server+edge runtimes.
 * Client Sentry init lives in sentry.client.config.ts and loads automatically.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
