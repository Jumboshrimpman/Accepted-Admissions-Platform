/** Administrator client-preview booking and catalog helpers. */

export const SAT_PREVIEW_BOOKING_TUTOR_NAMES = [
  "Xavier Morales",
  "Eunice Chon",
] as const;

export type PreviewBookingTutorCandidate = {
  id: string;
  userId: string | null;
  name: string;
  title: string;
  calendarStatus: string;
  subjects: string[];
  active: boolean;
};

export type PreviewSatAssignment = {
  tutorUserId: string;
  subject: string;
};

export function assignmentSubjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.startsWith("sat")) return "sat";
  if (normalized.startsWith("ielts") || normalized.startsWith("english")) {
    return "ielts";
  }
  return normalized;
}

export function isSatPreviewTutor(tutor: {
  name: string;
  subjects: string[];
}): boolean {
  if (
    SAT_PREVIEW_BOOKING_TUTOR_NAMES.includes(
      tutor.name as (typeof SAT_PREVIEW_BOOKING_TUTOR_NAMES)[number],
    )
  ) {
    return true;
  }
  return tutor.subjects.some(
    (subject) => assignmentSubjectFamily(subject) === "sat",
  );
}

export function isSatPreviewAssignment(
  assignment: PreviewSatAssignment,
  tutor: { name: string; subjects: string[] },
): boolean {
  const family = assignmentSubjectFamily(assignment.subject);
  if (family === "sat") return true;
  if (family === "all") return isSatPreviewTutor(tutor);
  return false;
}

/**
 * Choose the SAT booking tutor for administrator client preview.
 * Assigned SAT tutors win over the global booking-eligible roster.
 * When several assigned SAT tutors exist, prefer a connected calendar.
 */
export function selectAssignedPreviewBookingTutor<
  T extends PreviewBookingTutorCandidate,
>(assignments: PreviewSatAssignment[], tutors: T[]): T | undefined {
  const assigned = tutors.filter((tutor) => {
    if (!tutor.active || !tutor.userId) return false;
    return assignments.some(
      (assignment) =>
        assignment.tutorUserId === tutor.userId &&
        isSatPreviewAssignment(assignment, tutor),
    );
  });
  if (assigned.length === 0) return undefined;

  const connected = assigned.filter(
    (tutor) => tutor.calendarStatus === "connected",
  );
  const pool = connected.length > 0 ? connected : assigned;
  return [...pool].sort((left, right) => {
    const leftPreferred = SAT_PREVIEW_BOOKING_TUTOR_NAMES.indexOf(
      left.name as (typeof SAT_PREVIEW_BOOKING_TUTOR_NAMES)[number],
    );
    const rightPreferred = SAT_PREVIEW_BOOKING_TUTOR_NAMES.indexOf(
      right.name as (typeof SAT_PREVIEW_BOOKING_TUTOR_NAMES)[number],
    );
    const leftRank = leftPreferred === -1 ? SAT_PREVIEW_BOOKING_TUTOR_NAMES.length : leftPreferred;
    const rightRank = rightPreferred === -1 ? SAT_PREVIEW_BOOKING_TUTOR_NAMES.length : rightPreferred;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name);
  })[0];
}
