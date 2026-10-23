const NEEL_TUTOR_ORDER = ["nika", "victoria", "xavier", "eunice"] as const;

export type NamedCreditHours = {
  tutorKey?: string | null;
  name: string;
  hours: number;
};

function clampHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 100) / 100;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function joinAnd(parts: readonly string[]): string {
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

function firstName(name: string): string {
  const trimmed = name.trim();
  if (/^nika\b/i.test(trimmed)) return "Nika";
  if (/^victoria\b/i.test(trimmed)) return "Victoria";
  return trimmed.split(/\s+/)[0] || trimmed;
}

function tutorKeyFor(tutor: NamedCreditHours): string {
  const key = tutor.tutorKey?.trim().toLowerCase();
  if (key) return key;
  return firstName(tutor.name).toLowerCase();
}

export function neelCreditsRemainingLabel(
  tutors: readonly NamedCreditHours[] | null | undefined,
  remainingHours = 0,
): string {
  if (!tutors) return singlePoolCreditsLabel(remainingHours);
  const ordered = [...tutors].sort((left, right) => {
    const leftIndex = NEEL_TUTOR_ORDER.indexOf(tutorKeyFor(left) as (typeof NEEL_TUTOR_ORDER)[number]);
    const rightIndex = NEEL_TUTOR_ORDER.indexOf(tutorKeyFor(right) as (typeof NEEL_TUTOR_ORDER)[number]);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
  const parts = ordered
    .filter((tutor) => clampHours(tutor.hours) > 0)
    .map((tutor) => hourPhrase(tutor.hours, firstName(tutor.name)));
  if (parts.length === 0) return "0 credits remaining";
  return `${joinAnd(parts)} credits remaining`;
}

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
