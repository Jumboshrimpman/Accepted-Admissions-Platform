import { adminCurriculumHref } from "./admin-curriculum-location.ts";

/**
 * Admin view of a session's quizzes: one compact row per assigned quiz with
 * links to open it, instead of listing every question inline.
 */
export type AdminSessionQuizKind = "prework" | "in_session" | "reserve" | "other";

export type AdminSessionQuizLink = {
  id: string;
  kind: AdminSessionQuizKind;
  kindLabel: string;
  title: string;
  questionCount: number;
  status: string;
  openLabel: string;
  openHref: string;
  adminHref: string;
};

type SessionAssignmentLike = {
  id: string;
  title?: string | null;
  deliveryPhase?: string | null;
  status?: string | null;
  questionCount?: number | null;
};

const HARD_CHALLENGE_TITLE_PREFIX = "hard challenge set (";

export function isReserveQuizTitle(title?: string | null): boolean {
  return (title ?? "").trim().toLowerCase().startsWith(HARD_CHALLENGE_TITLE_PREFIX);
}

function kindFor(assignment: SessionAssignmentLike): AdminSessionQuizKind {
  if (isReserveQuizTitle(assignment.title)) return "reserve";
  if (assignment.deliveryPhase === "during_session") return "in_session";
  if (assignment.deliveryPhase === "before_session") return "prework";
  return "other";
}

const KIND_ORDER: Record<AdminSessionQuizKind, number> = {
  prework: 0,
  in_session: 1,
  reserve: 2,
  other: 3,
};

const KIND_LABEL: Record<AdminSessionQuizKind, string> = {
  prework: "Pre-work",
  in_session: "In-session",
  reserve: "Reserve",
  other: "Quiz",
};

const OPEN_LABEL: Record<AdminSessionQuizKind, string> = {
  prework: "Open pre-work",
  in_session: "Open in-session practice",
  reserve: "Open reserve set",
  other: "Open quiz",
};

export function adminSessionQuizLinks(
  assignments: readonly SessionAssignmentLike[] | null | undefined,
): AdminSessionQuizLink[] {
  return (assignments ?? [])
    .filter((assignment) => assignment?.id && assignment.status !== "archived")
    .map((assignment, index) => {
      const kind = kindFor(assignment);
      return {
        index,
        link: {
          id: assignment.id,
          kind,
          kindLabel: KIND_LABEL[kind],
          title: (assignment.title ?? "").trim() || "Untitled quiz",
          questionCount: Math.max(0, Number(assignment.questionCount ?? 0) || 0),
          status: (assignment.status ?? "draft").trim() || "draft",
          openLabel: OPEN_LABEL[kind],
          openHref: `/portal/assignments/${assignment.id}`,
          adminHref: adminCurriculumHref({
            section: "curriculum",
            tab: "quizzes",
            quiz: assignment.id,
          }),
        },
      };
    })
    .sort(
      (left, right) =>
        KIND_ORDER[left.link.kind] - KIND_ORDER[right.link.kind] || left.index - right.index,
    )
    .map(({ link }) => link);
}
