/**
 * Direct booking checkout. The server picks the catalog row for the tutor and
 * length. Client-sent prices are ignored. Michelle Makarem's Xavier SAT rate
 * is applied by displayedSatPriceCents, not by a price from the browser.
 */

export const BOOKING_CHECKOUT_SLOT_TAKEN =
  "That time was taken while checkout finished. Your hours are on your account. Choose another time.";

export const BOOKING_CHECKOUT_PAYMENT_PENDING =
  "Stripe has not confirmed this payment yet. Your time was not booked.";

const SAT_TUTOR_KEYS = ["eunice", "victoria", "xavier", "nika"] as const;
export type SatBookingTutorKey = (typeof SAT_TUTOR_KEYS)[number];
export type ConsultingBookingTutorKey = "nika" | "victoria" | "xavier" | "eunice";

export type CheckoutCatalogProduct = {
  id: string;
  slug: string;
  durationHours: number;
  totalPriceCents: number;
  active: boolean;
};

export type BookingCheckoutIntent = {
  tutorProfileId: string;
  startTime: string;
  durationMinutes: 60 | 90 | 120;
  /** Set only when the browser asked for College Consulting. Callers still decide who may use it. */
  service?: "college-consulting";
};

const CLIENT_PRICE_KEYS = [
  "amountCents",
  "priceCents",
  "unitAmountCents",
  "totalPriceCents",
] as const;

export function authoritativeCheckoutAmountCents(product: {
  totalPriceCents: number;
}): number {
  return Number(product.totalPriceCents);
}

export function consultingCheckoutSlug(
  tutorKey: ConsultingBookingTutorKey,
  durationMinutes: number,
): string | null {
  if (durationMinutes === 60) return `college-consulting-${tutorKey}-hour`;
  if (durationMinutes === 90) return `college-consulting-${tutorKey}-90`;
  if (durationMinutes === 120) return `college-consulting-${tutorKey}-120`;
  return null;
}

export function sharedSatSlugForDuration(durationMinutes: number): string | null {
  if (durationMinutes === 60) return "single-sat-session";
  if (durationMinutes === 90) return "sat-session-90";
  if (durationMinutes === 120) return "sat-session-120";
  return null;
}

/**
 * Per-tutor SAT slugs win when those rows exist. Shared duration rows are the
 * fallback for Eunice, Victoria, and Xavier. Nika never falls back to that
 * shared pool, so a missing sat-nika row cannot sell untagged hours.
 */
export function satCheckoutSlugCandidates(
  tutorKey: SatBookingTutorKey,
  durationMinutes: number,
): string[] {
  const specific =
    durationMinutes === 60 || durationMinutes === 90 || durationMinutes === 120
      ? `sat-${tutorKey}-${durationMinutes}`
      : null;
  if (tutorKey === "nika") return specific ? [specific] : [];
  const shared = sharedSatSlugForDuration(durationMinutes);
  return [specific, shared].filter((slug): slug is string => Boolean(slug));
}

export function isPerTutorSatSlug(slug: string): boolean {
  return /^sat-(eunice|victoria|xavier|nika)-(60|90|120)$/.test(slug);
}

export function selectBookingCheckoutProduct(args: {
  audience: "sat" | "consulting";
  tutorKey: string;
  durationMinutes: number;
  products: readonly CheckoutCatalogProduct[];
}): CheckoutCatalogProduct | null {
  const slugs =
    args.audience === "consulting"
      ? [
          consultingCheckoutSlug(
            args.tutorKey as ConsultingBookingTutorKey,
            args.durationMinutes,
          ),
        ].filter((slug): slug is string => Boolean(slug))
      : SAT_TUTOR_KEYS.includes(args.tutorKey as SatBookingTutorKey)
        ? satCheckoutSlugCandidates(
            args.tutorKey as SatBookingTutorKey,
            args.durationMinutes,
          )
        : [];
  const active = args.products.filter((product) => product.active);
  for (const slug of slugs) {
    const match = active.find((product) => product.slug === slug);
    if (match) return match;
  }
  return null;
}

export function bookingIntentFromBody(
  body: Record<string, unknown>,
):
  | { present: false }
  | { present: true; intent: BookingCheckoutIntent }
  | { present: true; error: string } {
  const hasAny = ["tutorProfileId", "startTime", "durationMinutes"].some((key) => {
    const value = body[key];
    return value !== undefined && value !== null && value !== "";
  });
  if (!hasAny) return { present: false };
  const tutorProfileId =
    typeof body.tutorProfileId === "string" ? body.tutorProfileId.trim() : "";
  const startRaw = typeof body.startTime === "string" ? body.startTime.trim() : "";
  const duration = Number(body.durationMinutes);
  if (!tutorProfileId || !startRaw || ![60, 90, 120].includes(duration)) {
    return { present: true, error: "Choose a tutor, a length, and an open time." };
  }
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) {
    return { present: true, error: "Choose a tutor, a length, and an open time." };
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().toLowerCase() : "";
  const serviceName = typeof body.service === "string" ? body.service.trim().toLowerCase() : "";
  const consulting =
    subject === "college consulting" || serviceName === "college-consulting";
  return {
    present: true,
    intent: {
      tutorProfileId,
      startTime: start.toISOString(),
      durationMinutes: duration as 60 | 90 | 120,
      ...(consulting ? { service: "college-consulting" as const } : {}),
    },
  };
}

export function bookingIntentFromMetadata(
  metadata: unknown,
): BookingCheckoutIntent | null {
  if (!metadata || typeof metadata !== "object") return null;
  const intent = (metadata as { bookingIntent?: unknown }).bookingIntent;
  if (!intent || typeof intent !== "object") return null;
  const parsed = bookingIntentFromBody(intent as Record<string, unknown>);
  return parsed.present && "intent" in parsed ? parsed.intent : null;
}

export function bookedSessionIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as { bookedSessionId?: unknown }).bookedSessionId;
  return typeof id === "string" && id.trim() ? id : null;
}

/** True when the browser sent a price. Callers must not read those fields. */
export function clientSentCheckoutPrice(body: Record<string, unknown>): boolean {
  return CLIENT_PRICE_KEYS.some((key) => body[key] != null && body[key] !== "");
}
