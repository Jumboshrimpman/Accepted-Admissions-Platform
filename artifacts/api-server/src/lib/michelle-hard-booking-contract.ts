import { ADMIN_CALENDAR_ACCOUNT_EMAIL } from "./admin-calendar-fallback.ts";
import { formatMichelleHardAssignmentTitle, michelleHardSubjectLabel } from "./michelle-hard-assignment-title.ts";
import { shouldAttachMichelleSophiaLamasSatPrep } from "./michelle-sophia-lamas-sat-prep-slides.ts";
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
import {
  HARD_SAT_IN_SESSION_MAX_QUESTIONS,
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  HARD_SAT_PREWORK_QUESTIONS,
  satDifficultyForStudent,
  satSectionsForStudent,
  type SatPracticeSection,
} from "./sat-set-difficulty.ts";
import { MICHELLE_MAKAREM_MEET_URL, pinnedBookingMeetUrl } from "./session-meeting-url.ts";
import { routinePreworkTimeLimitMinutes } from "./sat-bank-timing.ts";
import { sessionInvitesOrganizedByAdmin } from "./admin-calendar-fallback.ts";

export type MichelleHardBookingContract = {
  difficulty: "hard";
  sections: readonly SatPracticeSection[];
  subjectLabel: ReturnType<typeof michelleHardSubjectLabel>;
  prework: { questions: number; minutes: number; title: string; status: "published" };
  inSession: { questions: number; minutes: number; title: string; status: "published" };
  reserve: { questions: number; minutes: number; title: string; status: "draft" };
  officialHardTailFirst: true;
  meetUrl: string;
  calendarOrganizer: string;
  invitesOrganizedByAdmin: true;
  attachNextSatPrepDeck: boolean;
};

/**
 * What a new Michelle SAT booking must have after provisioning, including one
 * made after the server has already finished its startup refresh.
 */
export function michelleHardBookingContract(input: {
  dateTime: Date;
  timezone?: string | null;
  tutorName?: string | null;
  tutorEmail?: string | null;
  sessionTitle?: string | null;
  clientUserId?: string | null;
  clientEmail?: string | null;
}): MichelleHardBookingContract {
  const clientUserId = input.clientUserId ?? MICHELLE_MAKAREM_USER_ID;
  const sessionTitle =
    input.sessionTitle ??
    `Michelle’s SAT Session with ${(input.tutorName ?? "Tutor").split(/\s+/)[0]}`;
  const difficulty = satDifficultyForStudent({
    userId: clientUserId,
    subject: "SAT",
    session: { dateTime: input.dateTime, timezone: input.timezone },
    tutorEmail: input.tutorEmail,
    tutorName: input.tutorName,
    sessionTitle,
  });
  if (difficulty !== "hard") {
    throw new Error("Michelle hard booking contract is only for hard SAT sessions");
  }
  const sections = satSectionsForStudent({
    userId: clientUserId,
    subject: "SAT",
    session: { dateTime: input.dateTime, timezone: input.timezone },
    tutorEmail: input.tutorEmail,
    tutorName: input.tutorName,
    sessionTitle,
  });
  const subjectLabel = michelleHardSubjectLabel(sections);
  const titleFor = (kind: "prework" | "in-session" | "reserve") =>
    formatMichelleHardAssignmentTitle({
      dateTime: input.dateTime,
      timezone: input.timezone,
      kind,
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
      sessionTitle,
      sections,
    });
  const meetUrl =
    pinnedBookingMeetUrl({
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
      clientUserId,
      clientEmail: input.clientEmail,
    }) ?? MICHELLE_MAKAREM_MEET_URL;
  return {
    difficulty: "hard",
    sections,
    subjectLabel,
    prework: {
      questions: HARD_SAT_PREWORK_QUESTIONS,
      minutes: routinePreworkTimeLimitMinutes(HARD_SAT_PREWORK_QUESTIONS),
      title: titleFor("prework"),
      status: "published",
    },
    inSession: {
      questions: HARD_SAT_IN_SESSION_MAX_QUESTIONS,
      minutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
      title: titleFor("in-session"),
      status: "published",
    },
    reserve: {
      questions: 5,
      minutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
      title: titleFor("reserve"),
      status: "draft",
    },
    officialHardTailFirst: true,
    meetUrl,
    calendarOrganizer: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    invitesOrganizedByAdmin: sessionInvitesOrganizedByAdmin() as true,
    attachNextSatPrepDeck: shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: { id: clientUserId, email: input.clientEmail },
      tutor: { name: input.tutorName, email: input.tutorEmail },
    }),
  };
}
