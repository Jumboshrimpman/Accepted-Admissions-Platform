import { sessionLocalDateKey } from "./session-schedule.ts";
import type { SatPracticeSection } from "./sat-set-difficulty.ts";

export type MichelleHardSetKind = "prework" | "in-session" | "reserve";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Nov 17" from a YYYY-MM-DD session date key. */
export function formatMichelleHardDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (!year || monthIndex < 0 || monthIndex > 11 || !Number.isFinite(dayNumber)) {
    return dateKey;
  }
  return `${SHORT_MONTHS[monthIndex]} ${dayNumber}`;
}

export function michelleTutorShortName(input: {
  tutorName?: string | null;
  tutorEmail?: string | null;
  sessionTitle?: string | null;
}): string {
  const name = (input.tutorName ?? "").trim();
  const email = (input.tutorEmail ?? "").trim().toLowerCase();
  const title = (input.sessionTitle ?? "").trim();
  const blob = `${name} ${email} ${title}`;
  if (/xavier/i.test(blob) || /with Xavier/i.test(title)) return "Xavier";
  if (/lamas/i.test(blob) || /with Sophia\b/i.test(title) || /sophia/i.test(name)) return "Sophia L";
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]![0]}`;
    return parts[0]!;
  }
  return "Tutor";
}

export function michelleHardSubjectLabel(
  sections?: readonly SatPracticeSection[] | null,
): "SAT Math (Hard)" | "SAT English (Hard)" | "SAT (Hard)" {
  if (sections?.length === 1 && sections[0] === "math") return "SAT Math (Hard)";
  if (sections?.length === 1 && sections[0] === "rw") return "SAT English (Hard)";
  if (sections && sections.includes("math") && sections.includes("rw")) return "SAT (Hard)";
  return "SAT English (Hard)";
}

export function formatMichelleHardAssignmentTitle(input: {
  dateTime: Date;
  timezone?: string | null;
  kind: MichelleHardSetKind;
  tutorName?: string | null;
  tutorEmail?: string | null;
  sessionTitle?: string | null;
  sections?: readonly SatPracticeSection[] | null;
}): string {
  const dateLabel = formatMichelleHardDateLabel(
    sessionLocalDateKey(input.dateTime, input.timezone || "UTC"),
  );
  const subject = michelleHardSubjectLabel(input.sections);
  const phase =
    input.kind === "prework"
      ? `Pre-work ${subject}`
      : input.kind === "in-session"
        ? `In-session ${subject}`
        : `In-session ${subject.replace(" (Hard)", " Reserve (Hard)")}`;
  const tutor = michelleTutorShortName(input);
  return `${dateLabel} ${phase} — Michelle x ${tutor}`;
}
