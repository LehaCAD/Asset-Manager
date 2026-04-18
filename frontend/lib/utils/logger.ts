/**
 * Tiny logging facade that fans out to `console` + Sentry (when available).
 *
 * Use this instead of bare `console.error`/silent `catch(e) {}`. The signature
 * mirrors `logger.error("thing broke", { context, fields })` so error messages
 * stay human and context stays structured.
 */
import * as Sentry from "@sentry/nextjs";

type Ctx = Record<string, unknown> | undefined;

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
}

/** Drop undefined/null entries so empty contexts don't render as noise. */
function compact(ctx?: Ctx): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sentryWithCtx(fn: () => void, context?: Ctx) {
  const clean = compact(context);
  if (!clean) {
    fn();
    return;
  }
  try {
    Sentry.withScope((scope) => {
      scope.setContext("logger", clean);
      fn();
    });
  } catch {
    fn();
  }
}

export const logger = {
  error(message: string, context?: Ctx, cause?: unknown) {
    const clean = compact(context);
    const err = cause !== undefined ? toError(cause) : new Error(message);
    if (cause !== undefined && err.message === String(cause)) {
      err.message = `${message}: ${err.message}`;
    }
    // eslint-disable-next-line no-console
    console.error(`[${message}] ${err.message}`, clean ?? "", cause ?? "");
    sentryWithCtx(() => {
      Sentry.captureException(err);
    }, context);
  },

  warn(message: string, context?: Ctx) {
    const clean = compact(context);
    // eslint-disable-next-line no-console
    console.warn(`[${message}]`, clean ?? "");
    sentryWithCtx(() => {
      Sentry.captureMessage(message, "warning");
    }, context);
  },

  info(message: string, context?: Ctx) {
    const clean = compact(context);
    // eslint-disable-next-line no-console
    console.info(`[${message}]`, clean ?? "");
  },
};
