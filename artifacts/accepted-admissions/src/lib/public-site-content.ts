export const DEFAULT_CONTACT_EMAIL = "admin@acceptedadmissions.org";

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPublicContactEmail(value: unknown): value is string {
  return typeof value === "string" && CONTACT_EMAIL_PATTERN.test(value.trim());
}

export function contactEmailFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return DEFAULT_CONTACT_EMAIL;
  }
  const email = (body as Record<string, unknown>).contactEmail;
  return isPublicContactEmail(email) ? email.trim() : DEFAULT_CONTACT_EMAIL;
}

export type HomeContent = {
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: {
    heroEyebrow?: string;
    heroTitle?: string;
    heroLead?: string;
    satPathTitle?: string;
    satPathBlurb?: string;
    guidancePathTitle?: string;
    guidancePathBlurb?: string;
    satServiceTitle?: string;
    satServiceBlurb?: string;
    guidanceServiceTitle?: string;
    guidanceServiceBlurb?: string;
  };
};

export type SatContent = {
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: {
    heroLead?: string;
    offersIntro?: string;
    sections?: string[];
  };
};

export const DEFAULT_HOME_CONTENT: HomeContent = {
  title: "A clear next step for your college goals.",
  seoTitle: "Accepted Admissions | Your next step, made clear",
  seoDescription:
    "Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance.",
  body: {
    heroEyebrow: "For students and families planning what comes next",
    heroTitle: "A clear next step for your college goals.",
    heroLead:
      "Harvard students and recent graduates provide focused one-on-one SAT tutoring, with thoughtful guidance for families whose needs go beyond a single session.",
    satPathTitle: "Need SAT tutoring now?",
    satPathBlurb:
      "Purchase one hour or a ten-hour package at $130 per credit, then book open times with our SAT tutors.",
    guidancePathTitle: "Need a broader conversation?",
    guidancePathBlurb:
      "Admissions guidance, IELTS support, or another request starts with a private inquiry—not checkout.",
    satServiceTitle: "SAT tutoring",
    satServiceBlurb:
      "Explore the current one-session offer, review what happens after checkout, and meet the team to learn about our tutors.",
    guidanceServiceTitle: "Broader guidance",
    guidanceServiceBlurb:
      "If you are exploring admissions planning, IELTS support, or a different need, share the context privately. We will review it before discussing fit.",
  },
};

export const DEFAULT_SAT_CONTENT: SatContent = {
  title: "Prepaid SAT session credits.",
  seoTitle: "SAT tutoring | Accepted Admissions",
  seoDescription: "Explore prepaid SAT session credits, see approved prices, and continue to secure checkout.",
  body: {
    heroLead:
      "Purchase a single hour or a ten-hour package at $130 per credit. Funds settle with Accepted Admissions; credits unlock after a verified Stripe payment and can be booked with our SAT tutors.",
    offersIntro:
      "Book hourly ($130 for one credit) or buy ten hours at once ($1,300). Use credits anytime on our SAT tutors’ available calendar.",
    sections: [
      "Review the current single-hour and ten-hour SAT tutoring credits available online.",
      "Sign in to purchase, then use verified prepaid credits to schedule with our SAT tutors in the client portal.",
    ],
  },
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function recordBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeHomeContent(value: unknown): HomeContent {
  const candidate = recordBody(value);
  if (!candidate) return DEFAULT_HOME_CONTENT;
  const body = recordBody(candidate.body) ?? {};
  const title =
    optionalString(candidate.title) ??
    optionalString(body.heroTitle) ??
    DEFAULT_HOME_CONTENT.title;
  return {
    title,
    seoTitle: optionalString(candidate.seoTitle) ?? DEFAULT_HOME_CONTENT.seoTitle,
    seoDescription: optionalString(candidate.seoDescription) ?? DEFAULT_HOME_CONTENT.seoDescription,
    body: {
      heroEyebrow: optionalString(body.heroEyebrow) ?? DEFAULT_HOME_CONTENT.body.heroEyebrow,
      heroTitle: optionalString(body.heroTitle) ?? title,
      heroLead: optionalString(body.heroLead) ?? DEFAULT_HOME_CONTENT.body.heroLead,
      satPathTitle: optionalString(body.satPathTitle) ?? DEFAULT_HOME_CONTENT.body.satPathTitle,
      satPathBlurb: optionalString(body.satPathBlurb) ?? DEFAULT_HOME_CONTENT.body.satPathBlurb,
      guidancePathTitle: optionalString(body.guidancePathTitle) ?? DEFAULT_HOME_CONTENT.body.guidancePathTitle,
      guidancePathBlurb: optionalString(body.guidancePathBlurb) ?? DEFAULT_HOME_CONTENT.body.guidancePathBlurb,
      satServiceTitle: optionalString(body.satServiceTitle) ?? DEFAULT_HOME_CONTENT.body.satServiceTitle,
      satServiceBlurb: optionalString(body.satServiceBlurb) ?? DEFAULT_HOME_CONTENT.body.satServiceBlurb,
      guidanceServiceTitle:
        optionalString(body.guidanceServiceTitle) ?? DEFAULT_HOME_CONTENT.body.guidanceServiceTitle,
      guidanceServiceBlurb:
        optionalString(body.guidanceServiceBlurb) ?? DEFAULT_HOME_CONTENT.body.guidanceServiceBlurb,
    },
  };
}

export function normalizeSatContent(value: unknown): SatContent {
  const candidate = recordBody(value);
  if (!candidate) return DEFAULT_SAT_CONTENT;
  const body = recordBody(candidate.body) ?? {};
  const sections = Array.isArray(body.sections)
    ? body.sections.filter((section): section is string => typeof section === "string" && Boolean(section.trim()))
    : DEFAULT_SAT_CONTENT.body.sections;
  return {
    title: optionalString(candidate.title) ?? DEFAULT_SAT_CONTENT.title,
    seoTitle: optionalString(candidate.seoTitle) ?? DEFAULT_SAT_CONTENT.seoTitle,
    seoDescription: optionalString(candidate.seoDescription) ?? DEFAULT_SAT_CONTENT.seoDescription,
    body: {
      heroLead: optionalString(body.heroLead) ?? sections?.[0] ?? DEFAULT_SAT_CONTENT.body.heroLead,
      offersIntro: optionalString(body.offersIntro) ?? sections?.[1] ?? DEFAULT_SAT_CONTENT.body.offersIntro,
      sections,
    },
  };
}

export function accentHeading(text: string): { before: string; accent: string; after: string } {
  const marker = "college goals";
  const index = text.toLowerCase().lastIndexOf(marker);
  if (index === -1) return { before: text, accent: "", after: "" };
  return {
    before: text.slice(0, index),
    accent: text.slice(index, index + marker.length),
    after: text.slice(index + marker.length),
  };
}
