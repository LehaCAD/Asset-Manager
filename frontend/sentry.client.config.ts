import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    // Strip obvious token-looking values from breadcrumbs.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        for (const key of Object.keys(breadcrumb.data)) {
          if (/(token|password|secret|authorization)/i.test(key)) {
            breadcrumb.data[key] = "[Filtered]";
          }
        }
      }
      return breadcrumb;
    },
  });
}
