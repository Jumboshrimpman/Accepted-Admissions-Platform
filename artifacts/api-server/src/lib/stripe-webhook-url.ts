// @ts-expect-error Native Node test execution requires the source extension.
import { CANONICAL_APP_ORIGIN } from "./public-origin.ts";

/** Public production webhook path mounted on the Express API. */
export const PRODUCTION_STRIPE_WEBHOOK_PATH = "/api/stripe/webhook";

/**
 * Stripe Dashboard endpoint URL for live mode.
 * Vercel rewrites `/api/*` to Railway, so this public origin reaches the API.
 * Do not point Stripe at Replit.
 */
export const PRODUCTION_STRIPE_WEBHOOK_URL = `${CANONICAL_APP_ORIGIN}${PRODUCTION_STRIPE_WEBHOOK_PATH}`;

/** Retired host that dropped every Stripe delivery (100% errors). */
export const RETIRED_REPLIT_STRIPE_WEBHOOK_HOST = "accepted-admissions-platform.replit.app";

export function isRetiredReplitStripeWebhookUrl(url: string): boolean {
  const trimmed = url.trim();
  try {
    const hostname = new URL(trimmed).hostname.toLowerCase();
    return hostname === RETIRED_REPLIT_STRIPE_WEBHOOK_HOST || hostname.endsWith(".replit.app");
  } catch {
    return /replit\.app/i.test(trimmed);
  }
}
