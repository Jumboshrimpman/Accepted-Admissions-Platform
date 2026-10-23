import { consultingCreditsTutorLabel, portalTutorFirstName } from "./consulting-tutor-display.ts";
import { NEEL_DHARNI_USER_ID, SOPHIA_SLEIMAN_SAT_USER_ID } from "./portal-sat.ts";
import { isMichelleClientEmail } from "./stacked-math-notation.ts";

const NEEL_TUTOR_ORDER = ["nika", "victoria", "xavier", "eunice"] as const;

export type NamedCreditHours = {
  tutorKey?: string | null;
  name: string;
  hours: number;
};

export function isPriorityCreditsDashboard(input: {
  userId?: string | null;
  email?: string | null;
  viewingAs?: { id?: string | null; email?: string | null } | null;
}): boolean {
  const ids = [input.userId, input.viewingAs?.id];
  if (ids.includes(NEEL_DHARNI_USER_ID) || ids.includes(SOPHIA_SLEIMAN_SAT_USER_ID)) return true;
  return isMichelleClientEmail(input.email) || isMichelleClientEmail(input.viewingAs?.email);
}

function clampHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 100) / 100;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function hourPhrase(hours: number, name?: string): string {
  const count = clampHours(hours);
  const unit = count === 1 ? "hour" : "hours";
  return name ? `${formatHours(count)} ${name} ${unit}` : `${formatHours(count)} ${unit}`;
}

export function singlePoolCreditsLabel(hours: number): string {
  const count = clampHours(hours);
  if (count === 0) return "0 credits remaining";
  return `${hourPhrase(count)} credits remaining`;
}

function tutorFirstName(name: string): string {
  return portalTutorFirstName(consultingCreditsTutorLabel(name));
}

function tutorKeyFor(tutor: NamedCreditHours): string {
  const key = tutor.tutorKey?.trim().toLowerCase();
  if (key) return key;
  const first = tutorFirstName(tutor.name).toLowerCase();
  return NEEL_TUTOR_ORDER.find((item) => item === first) ?? first;
}

/** Neel lists only tutors who still have hours, in roster order. */
export function neelCreditsRemainingLabel(
  tutors: readonly NamedCreditHours[] | null | undefined,
  remainingHours = 0,
): string {
  if (!tutors) return singlePoolCreditsLabel(remainingHours);
  const ordered = [...tutors].sort(
    (left, right) => {
      const leftIndex = NEEL_TUTOR_ORDER.indexOf(tutorKeyFor(left) as (typeof NEEL_TUTOR_ORDER)[number]);
      const rightIndex = NEEL_TUTOR_ORDER.indexOf(tutorKeyFor(right) as (typeof NEEL_TUTOR_ORDER)[number]);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    },
  );
  const parts = ordered
    .filter((tutor) => clampHours(tutor.hours) > 0)
    .map((tutor) => hourPhrase(tutor.hours, tutorFirstName(tutor.name)));
  if (parts.length === 0) return "0 credits remaining";
  return `${joinAnd(parts)} credits remaining`;
}

/**
 * Sophia's package hours and Xavier hours are not interchangeable.
 * When any hour remains, both pools are named, even if Xavier is 0.
 */
export function sophiaCreditsRemainingLabel(input: {
  legacyHours: number;
  xavierHours: number;
  euniceHours?: number;
  victoriaHours?: number;
  nikaHours?: number;
}): string {
  const extras = [
    ["Eunice", input.euniceHours ?? 0],
    ["Victoria", input.victoriaHours ?? 0],
    ["Nika", input.nikaHours ?? 0],
  ].filter((entry) => clampHours(entry[1] as number) > 0);
  if (
    clampHours(input.legacyHours) === 0 &&
    clampHours(input.xavierHours) === 0 &&
    extras.length === 0
  ) {
    return "0 credits remaining";
  }
  const parts = [
    hourPhrase(input.legacyHours, "package"),
    hourPhrase(input.xavierHours, "Xavier"),
    ...extras.map(([name, hours]) => hourPhrase(hours as number, name as string)),
  ];
  return `${joinAnd(parts)} credits remaining`;
}

/**
 * Michelle's untagged $130 pool can book Xavier, so a legacy-only balance stays unnamed.
 * Tagged hours are named. A mix says "shared" for the legacy pool.
 */
export function michelleCreditsRemainingLabel(input: {
  legacyHours: number;
  tagged: readonly { name: string; hours: number }[];
}): string {
  const tagged = input.tagged.filter((tutor) => clampHours(tutor.hours) > 0);
  const legacy = clampHours(input.legacyHours);
  if (legacy === 0 && tagged.length === 0) return "0 credits remaining";
  if (tagged.length === 0) return singlePoolCreditsLabel(legacy);
  const parts = [
    ...(legacy > 0 ? [hourPhrase(legacy, "shared")] : []),
    ...tagged.map((tutor) => hourPhrase(tutor.hours, tutor.name)),
  ];
  return `${joinAnd(parts)} credits remaining`;
}

export function collapsedCreditsHeader(input: {
  priority: boolean;
  collegeConsulting: boolean;
  purchasedHours: number;
  remainingHours: number;
  creditsRemainingLabel?: string | null;
  tutors?: readonly { tutorKey?: string | null; name: string; prepaidHours: number }[] | null;
}): string {
  if (!input.priority) {
    const title = input.collegeConsulting ? "College Consulting credits" : "SAT session credits";
    const count = input.purchasedHours;
    return `${title} · ${count} prepaid hour${count === 1 ? "" : "s"} total`;
  }
  const provided = input.creditsRemainingLabel?.trim();
  if (provided) return provided;
  if (input.collegeConsulting || input.tutors) {
    return neelCreditsRemainingLabel(
      input.tutors?.map((tutor) => ({
        tutorKey: tutor.tutorKey,
        name: tutor.name,
        hours: tutor.prepaidHours,
      })),
      input.remainingHours,
    );
  }
  return singlePoolCreditsLabel(input.remainingHours);
}
