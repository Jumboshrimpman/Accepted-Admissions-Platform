/**
 * Complementary Fall 2026 Taito session agendas (original coaching only).
 *
 * These are not College Board, Cambridge, British Council, or IDP items.
 * Tutors find the full outline in Private tutor guidance
 * (`session_artifacts.kind = tutor_notes`).
 */
import {
  TAITO_ENGLISH_DATE_KEYS,
  TAITO_FALL_2026_SESSIONS,
  matchesTaitoScheduledDate,
  normalizedSessionSubject,
} from "./session-schedule.ts";

export const TAITO_FALL_AGENDA_SEED_KIND = "taito-fall-2026-agenda" as const;
export const TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY =
  "taito-fall-2026-agenda-objectives" as const;
export const TAITO_FALL_AGENDA_CALLOUT_SEED_KEY =
  "taito-fall-2026-agenda-callout" as const;

export const SAT_SCORE_DISCLAIMER =
  "This hour uses original practice and estimated ranges. It is not an official SAT score.";
export const ENGLISH_SCORE_DISCLAIMER =
  "This hour uses original IELTS-style practice. It is not an official IELTS band.";

/** Org / product names we must not present as source material. Disclaimers use “not an official … score.” */
const FORBIDDEN_COPYRIGHT_MARKERS = [
  /college\s*board/i,
  /\bbluebook\b/i,
  /cambridge\s+assessment/i,
  /british\s+council/i,
  /\bidp\b/i,
];

export type TaitoFallAgendaFamily = "sat" | "english";

export type TaitoFallSessionAgenda = {
  dateKey: string;
  family: TaitoFallAgendaFamily;
  subject: "SAT" | "IELTS";
  title: string;
  outline: string;
  objectives: string[];
  callout: string;
};

type ScheduledSubject = (typeof TAITO_FALL_2026_SESSIONS)[number]["subject"];

function subjectMatchesSchedule(
  sessionSubject: string,
  scheduledSubject: ScheduledSubject,
): boolean {
  if (scheduledSubject === "SAT") {
    return normalizedSessionSubject(sessionSubject) === "SAT";
  }
  const family = normalizedSessionSubject(sessionSubject);
  return family === "English" || sessionSubject.trim().toUpperCase() === "IELTS";
}

export function isXavierCapabilityTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim().startsWith("SAT capability test — Xavier");
}

export function agendaSeedMarker(dateKey: string): string {
  return `[${TAITO_FALL_AGENDA_SEED_KIND} ${dateKey}]`;
}

export function isSeededTutorNotes(
  content: string | null | undefined,
  dateKey?: string,
): boolean {
  const text = content ?? "";
  if (dateKey) return text.includes(agendaSeedMarker(dateKey));
  return text.includes(`[${TAITO_FALL_AGENDA_SEED_KIND} `);
}

export function formatTutorNotes(agenda: TaitoFallSessionAgenda): string {
  const familyLabel = agenda.family === "sat" ? "SAT" : "English / IELTS-style";
  return [
    agendaSeedMarker(agenda.dateKey),
    `Private tutor guidance — Fall 2026 Taito · ${agenda.dateKey} (${familyLabel})`,
    agenda.callout,
    "",
    "Weekly pattern: (1) pre-work autopsy → (2) skill clinic → (3) timed mini-set → (4) homework cue.",
    "Use original examples and the student's own attempt review only. Do not invent or paste official exam stems.",
    "",
    agenda.outline.trim(),
  ].join("\n");
}

export function shouldReplaceTutorNotes(
  existing: string | null | undefined,
  dateKey: string,
  force = false,
): boolean {
  if (force) return true;
  const text = existing?.trim() ?? "";
  if (!text) return true;
  return isSeededTutorNotes(text, dateKey) || isSeededTutorNotes(text);
}

export function isKnownInitialOct2Objectives(config: Record<string, unknown>): boolean {
  const title = typeof config.title === "string" ? config.title : "";
  const items = Array.isArray(config.items) ? config.items.map(String) : [];
  return (
    title === "Session goals" &&
    items.length === 3 &&
    items[0] === "Review summer progress" &&
    items[1] === "Complete a baseline timed mini-section" &&
    items[2] === "Set measurable Fall goals"
  );
}

export function blockHasSeedKey(
  config: Record<string, unknown> | null | undefined,
  seedKey: string,
): boolean {
  return Boolean(config && config.seedKey === seedKey);
}

export function agendaObjectivesConfig(agenda: TaitoFallSessionAgenda): Record<string, unknown> {
  return {
    seedKey: TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
    title: "Session goals",
    items: [...agenda.objectives],
  };
}

export function agendaCalloutConfig(agenda: TaitoFallSessionAgenda): Record<string, unknown> {
  return {
    seedKey: TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
    text: agenda.callout,
  };
}

export function copyrightMarkerHits(text: string): string[] {
  return FORBIDDEN_COPYRIGHT_MARKERS.filter((pattern) => pattern.test(text)).map(
    (pattern) => String(pattern),
  );
}

const SAT_CALLOUT = SAT_SCORE_DISCLAIMER;
const ENGLISH_CALLOUT = ENGLISH_SCORE_DISCLAIMER;

export const TAITO_FALL_2026_SESSION_AGENDAS: readonly TaitoFallSessionAgenda[] = [
  {
    dateKey: "2026-10-02",
    family: "sat",
    subject: "SAT",
    title: "Diagnostic debrief (first SAT)",
    objectives: [
      "Understand what the estimated range means (not an official SAT score).",
      "Walk the largest miss clusters from the diagnostic.",
      "Leave with one personal error pattern and the Oct 9 routine 40Q assigned.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-10-02 — Diagnostic debrief (first SAT)

Assume ~60 min.

- **Pre-work:** Short clean diagnostic (~108Q). Confirm the title says “N clean questions,” not Full-length.
- **0–5:** Norms + what the estimated range means (not an official adaptive score).
- **5–25:** Top miss clusters from the attempt (RW vs Math). Walk 3–5 wrong items from attempt review — explain the trap choice; do not invent official stems.
- **25–40:** Skill clinic on the largest miss bucket (for example transitions / command of evidence, or linear equations). Whiteboard + original examples only.
- **40–55:** Timed mini-set: 4 RW + 4 Math via the in-session adaptive builder (~12–15 min).
- **55–60:** Assign the Oct 9 routine 40Q. Student notes one personal error pattern.

If Xavier (not Eunice) runs this hour, use this same agenda. Keep the capability-test quiz off Taito’s list.
`.trim(),
  },
  {
    dateKey: "2026-10-09",
    family: "sat",
    subject: "SAT",
    title: "Routine 40Q #1",
    objectives: [
      "Review homework misses and name the main trap type.",
      "Practice pacing and mark-and-move on medium RW.",
      "Complete a short timed mixed set and start the Oct 16 routine.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-10-09 — Routine 40Q #1

- Review homework misses (10–15).
- Clinic: pacing + “mark & move” for medium RW.
- Mini-set: 6 mixed (3 RW / 3 Math) timed.
- Cue Oct 16; prefer a different practice-test collection than Oct 9.
`.trim(),
  },
  {
    dateKey: "2026-10-16",
    family: "sat",
    subject: "SAT",
    title: "Routine #2",
    objectives: [
      "Tag homework misses by skill, not just right/wrong.",
      "Clinic on linear systems / heart-of-algebra with original items.",
      "Timed set on last week’s weakest skill; next SAT hour is Oct 30.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-10-16 — Routine #2

- Miss autopsy with skill tags.
- Clinic: Math heart-of-algebra (systems / linear) with original tutor-made items.
- Mini-set: 8Q on last week’s weakest skill.
- Cue Oct 30 (Oct 23 is English).
`.trim(),
  },
  {
    dateKey: "2026-10-23",
    family: "english",
    subject: "IELTS",
    title: "Reading diagnostic (24Q)",
    objectives: [
      "Remember this is original practice, not an official IELTS band.",
      "Debrief the hardest diagnostic passage (gist vs detail).",
      "Leave with Nov 13 routine 12Q assigned and five vocab words.",
    ],
    callout: ENGLISH_CALLOUT,
    outline: `
## 2026-10-23 — Reading diagnostic (24Q)

- **0–5:** Remind: original practice, not an official IELTS band.
- **5–20:** Passage-level debrief (which of the four diagnostic passages hurt most). Re-read one short paragraph for gist vs detail.
- **20–35:** Skill clinic: supported / contradicted / not stated using the same homework passage (do not copy official true / false / not-given items).
- **35–50:** Writing warm-up from the original bank (rooftop gardens or ferry table) — outline or 10-min paragraph; tutor-review only.
- **50–60:** Assign Nov 13 routine 12Q. Vocab notebook: five words from diagnostic misses.
`.trim(),
  },
  {
    dateKey: "2026-10-30",
    family: "sat",
    subject: "SAT",
    title: "Mid-Fall checkpoint",
    objectives: [
      "Compare miss rates across the October SAT routines.",
      "Clinic the lagging side: advanced RW inference or Math data/problem-solving.",
      "Write a three-bullet fix plan into tutor notes.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-10-30 — Mid-Fall checkpoint

- Compare miss rates across Oct 9 / 16 / 30.
- Clinic: advanced RW inferences or Math problem-solving/data (whichever lags).
- Mini-set: 10Q mixed, slightly harder than homework.
- Student writes a 3-bullet “fix plan” into tutor notes.
`.trim(),
  },
  {
    dateKey: "2026-11-06",
    family: "sat",
    subject: "SAT",
    title: "Routine",
    objectives: [
      "Quick wrong-answer round on at most five items.",
      "Clinic Expression of Ideas / Standard English Conventions with original drills.",
      "RW-heavy mini-set; next SAT hour is Nov 20.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-11-06 — Routine

- Quick wrong-answer round (≤5 items).
- Clinic: Expression of Ideas / Standard English Conventions (original drills).
- Mini-set: 6 RW-heavy.
- Cue Nov 20.
`.trim(),
  },
  {
    dateKey: "2026-11-13",
    family: "english",
    subject: "IELTS",
    title: "Routine Reading (12Q)",
    objectives: [
      "Autopsy misses on the first routine reading set.",
      "Practice inference and writer’s views by paraphrasing stems.",
      "Optional original table summary; next English hour is Dec 4.",
    ],
    callout: ENGLISH_CALLOUT,
    outline: `
## 2026-11-13 — Routine Reading (12Q)

- Miss autopsy on routine-1 passages.
- Clinic: inference + writer’s views (paraphrase stems).
- Mini-set: rework 3 homework misses live, or 6 human-reviewed generated items if Cos uses Generate questions.
- Optional Writing: Task-1-style summary of an original table Nika sketches on the whiteboard.
- Cue Dec 4 routine 12Q.
`.trim(),
  },
  {
    dateKey: "2026-11-20",
    family: "sat",
    subject: "SAT",
    title: "Routine",
    objectives: [
      "Review homework misses before the Math clinic.",
      "Clinic ratios, percentages, and geometry with original figures only.",
      "Math-heavy mini-set; next SAT hour is Nov 27.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-11-20 — Routine

- Miss autopsy.
- Clinic: ratios / percentages / geometry (original; no official exam figures).
- Mini-set: 6 Math-heavy.
- Cue Nov 27.
`.trim(),
  },
  {
    dateKey: "2026-11-27",
    family: "sat",
    subject: "SAT",
    title: "Pre–Dec push",
    objectives: [
      "Review the Fall error log and pick one weak skill.",
      "Run an 8-question mini-set under exam conditions.",
      "Cue the Dec 11 routine.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-11-27 — Pre–Dec push

- Error-log review across Fall.
- Clinic: student-chosen weak skill.
- Mini-set: 8Q exam conditions.
- Cue Dec 11.
`.trim(),
  },
  {
    dateKey: "2026-12-04",
    family: "english",
    subject: "IELTS",
    title: "Routine Reading (12Q) + wrap",
    objectives: [
      "Autopsy the second routine reading set.",
      "Practice a timing and skimming plan for longer future passages.",
      "Finish one original writing prompt with a simple 3-band rubric (not an official score).",
    ],
    callout: ENGLISH_CALLOUT,
    outline: `
## 2026-12-04 — Routine Reading (12Q) + wrap

- Miss autopsy on routine-2 set.
- Clinic: timing (~1.5–2 min/Q) + skimming plan for longer future passages.
- Writing: finish one bank writing prompt under time; mark with a simple 3-band rubric (Task / Coherence / Lexis) — not an official IELTS score claim.
- Close Fall English: strengths, next focus, whether Listening is needed later (no audio in the platform yet).
`.trim(),
  },
  {
    dateKey: "2026-12-11",
    family: "sat",
    subject: "SAT",
    title: "Routine",
    objectives: [
      "Light miss review only — keep energy for endurance work.",
      "Clinic section transitions and pacing stamina.",
      "10-question mini-set; next SAT hour is Dec 18.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-12-11 — Routine

- Light miss review.
- Clinic: endurance + section transitions.
- Mini-set: 10Q.
- Cue Dec 18.
`.trim(),
  },
  {
    dateKey: "2026-12-18",
    family: "sat",
    subject: "SAT",
    title: "Closing SAT session",
    objectives: [
      "Name Fall miss themes without assigning a new long homework.",
      "Choose keep / stop / start habits for winter.",
      "Hand off a winter plan in tutor notes and the session report.",
    ],
    callout: SAT_CALLOUT,
    outline: `
## 2026-12-18 — Closing SAT session

- Full Fall miss themes (no new long homework).
- Keep / stop / start habits.
- Optional short timed set (6Q).
- Hand off the winter plan in tutor notes + the session report artifact.
`.trim(),
  },
];

const agendasByDate = new Map(
  TAITO_FALL_2026_SESSION_AGENDAS.map((agenda) => [agenda.dateKey, agenda]),
);

export function agendaForDateKey(dateKey: string): TaitoFallSessionAgenda | undefined {
  return agendasByDate.get(dateKey);
}

export const TAITO_FALL_AGENDA_DATE_KEYS = TAITO_FALL_2026_SESSION_AGENDAS.map(
  (agenda) => agenda.dateKey,
);

export function expectedAgendaFamily(dateKey: string): TaitoFallAgendaFamily {
  return (TAITO_ENGLISH_DATE_KEYS as readonly string[]).includes(dateKey)
    ? "english"
    : "sat";
}

export type TaitoFallSessionCandidate = {
  id: string;
  dateTime: Date;
  timezone?: string | null;
  subject: string;
  title: string;
  status: string;
  bookingStatus: string;
  hasHomework?: boolean;
  clientUserId?: string | null;
  createdAt?: Date;
};

export function pickTaitoAgendaKeeper<T extends TaitoFallSessionCandidate>(
  candidates: readonly T[],
): T | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => {
    const live = (session: T) =>
      session.status !== "archived" && session.bookingStatus !== "cancelled";
    const liveDelta = Number(live(right)) - Number(live(left));
    if (liveDelta !== 0) return liveDelta;
    const publishedDelta =
      Number(right.status === "published") - Number(left.status === "published");
    if (publishedDelta !== 0) return publishedDelta;
    const homeworkDelta = Number(Boolean(right.hasHomework)) - Number(Boolean(left.hasHomework));
    if (homeworkDelta !== 0) return homeworkDelta;
    return (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
  })[0];
}

export function findTaitoAgendaSession<T extends TaitoFallSessionCandidate>(
  scheduled: { dateKey: string; subject: ScheduledSubject },
  sessions: readonly T[],
  options?: { claimedIds?: Set<string>; taitoUserId?: string | null },
): T | undefined {
  const claimed = options?.claimedIds ?? new Set<string>();
  const candidates = sessions.filter((session) => {
    if (claimed.has(session.id) || isXavierCapabilityTitle(session.title)) {
      return false;
    }
    if (
      options?.taitoUserId &&
      session.clientUserId &&
      session.clientUserId !== options.taitoUserId
    ) {
      return false;
    }
    if (!subjectMatchesSchedule(session.subject, scheduled.subject)) {
      return false;
    }
    return matchesTaitoScheduledDate(session, scheduled.dateKey);
  });
  return pickTaitoAgendaKeeper(candidates);
}

export function planTaitoFallAgendaMatches<T extends TaitoFallSessionCandidate>(
  sessions: readonly T[],
  options?: { taitoUserId?: string | null },
): Array<{
  dateKey: string;
  subject: ScheduledSubject;
  agenda: TaitoFallSessionAgenda;
  session: T | undefined;
}> {
  const claimed = new Set<string>();
  return TAITO_FALL_2026_SESSIONS.map((scheduled) => {
    const session = findTaitoAgendaSession(scheduled, sessions, {
      claimedIds: claimed,
      taitoUserId: options?.taitoUserId,
    });
    if (session) claimed.add(session.id);
    const agenda = agendaForDateKey(scheduled.dateKey);
    if (!agenda) {
      throw new Error(`Missing agenda outline for ${scheduled.dateKey}`);
    }
    return {
      dateKey: scheduled.dateKey,
      subject: scheduled.subject,
      agenda,
      session,
    };
  });
}
