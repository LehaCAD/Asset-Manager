import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/cabinet",
        destination: "/cabinet/analytics",
        permanent: false,
      },
    ];
  },
};

// withSentryConfig is a no-op when SENTRY_DSN is unset — safe to keep wrapped.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps only when auth token is present (CI/CD).
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
  widenClientFileUpload: true,
});
