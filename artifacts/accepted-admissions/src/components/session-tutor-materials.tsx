import { useState } from "react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { FileDown } from "lucide-react";
import { describeAssignmentCompletion } from "@/lib/assignment-completion";
import { isPostSessionFollowUpQuiz } from "@/lib/student-quiz-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const PDF_OBJECT_URL_REVOKE_DELAY_MS = 1000;

export function viewerMayDownloadSessionPdfs(input: {
  role?: string | null;
  viewerUserId?: string | null;
  sessionTutor?: { id?: string | null } | null;
}): boolean {
  if (input.role === "administrator") return true;
  if (input.role !== "tutor") return false;
  const tutorId = input.sessionTutor?.id;
  return Boolean(tutorId) && Boolean(input.viewerUserId) && input.viewerUserId === tutorId;
}

export function sessionOffersQuestionPdfs(
  assignments: readonly {
    sessionId?: string | null;
    status?: string | null;
    questionCount?: number | null;
  }[],
  sessionId: string,
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.sessionId === sessionId &&
      assignment.status !== "archived" &&
      (assignment.questionCount ?? 0) > 0,
  );
}

function downloadErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

type HomeworkRow = {
  assignmentId: string;
  title: string;
  attemptStatus?: string | null;
  score?: number | null;
  submittedAt?: string | Date | null;
  attemptId?: string | null;
};

type AssignmentRow = {
  id: string;
  deliveryPhase?: string | null;
  title?: string | null;
  questionCount?: number | null;
  status?: string | null;
};

async function downloadSessionQuestionPdf(sessionId: string, answers: boolean) {
  const blob = await customFetch<Blob>(
    `/api/sessions/${encodeURIComponent(sessionId)}/question-pdf${answers ? "?answers=1" : ""}`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = answers ? "session-answer-key.pdf" : "session-questions.pdf";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), PDF_OBJECT_URL_REVOKE_DELAY_MS);
}

function PdfDownloadButton({
  sessionId,
  answers,
  label,
  testId,
}: {
  sessionId: string;
  answers: boolean;
  label: string;
  testId: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid={testId}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void downloadSessionQuestionPdf(sessionId, answers)
          .catch((error: unknown) => {
            const status = downloadErrorStatus(error);
            toast({
              variant: "destructive",
              title: status === 403 ? "Download not allowed" : "Could not download the PDF",
              description:
                status === 403
                  ? "This account cannot download that PDF."
                  : status === 404
                    ? "No questions are attached to this session."
                    : "Try again in a moment.",
            });
          })
          .finally(() => setPending(false));
      }}
    >
      <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
      {pending ? "Preparing PDF…" : label}
    </Button>
  );
}

export function SessionQuestionDownloads({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="session-question-downloads">
      <PdfDownloadButton
        sessionId={sessionId}
        answers={false}
        label="Download questions (PDF)"
        testId="download-session-questions"
      />
      <PdfDownloadButton
        sessionId={sessionId}
        answers
        label="Download answer key (PDF)"
        testId="download-session-answer-key"
      />
    </div>
  );
}

function CompletionRow({
  kind,
  timezone,
  row,
}: {
  kind: "Pre-work" | "Homework";
  timezone?: string | null;
  row: HomeworkRow;
}) {
  const badge = describeAssignmentCompletion({
    attemptStatus: row.attemptStatus,
    score: row.score,
    submittedAt: row.submittedAt,
    timezone,
  });
  return (
    <div className="rounded-lg border bg-background p-3" data-testid={`tutor-completion-${row.assignmentId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kind}</p>
          <p className="mt-1 font-medium">{row.title}</p>
        </div>
        <Badge data-testid={`tutor-completion-badge-${row.assignmentId}`}>{badge.label}</Badge>
      </div>
      {row.attemptId ? (
        <div className="mt-3">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/tutor/attempts/${row.attemptId}`}>Review attempt</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No attempt to review yet.</p>
      )}
    </div>
  );
}

export function SessionTutorMaterials({
  sessionId,
  timezone,
  assignments,
  homework,
  beforeAssignmentId,
  duringAssignmentId,
  duringTitle,
  duringQuestionCount,
  canDownloadPdfs = false,
}: {
  sessionId: string;
  timezone?: string | null;
  assignments: AssignmentRow[];
  homework: HomeworkRow[];
  beforeAssignmentId?: string | null;
  duringAssignmentId?: string | null;
  duringTitle?: string | null;
  duringQuestionCount?: number | null;
  canDownloadPdfs?: boolean;
}) {
  const phaseFor = (assignmentId: string) =>
    assignments.find((assignment) => assignment.id === assignmentId)?.deliveryPhase ?? "before_session";
  const prework = homework.filter(
    (item) => phaseFor(item.assignmentId) === "before_session" && !isPostSessionFollowUpQuiz(item),
  );
  const homeworkRows = homework.filter(
    (item) => phaseFor(item.assignmentId) === "during_session" || isPostSessionFollowUpQuiz(item),
  );
  if (
    duringAssignmentId &&
    !homeworkRows.some((item) => item.assignmentId === duringAssignmentId) &&
    (duringQuestionCount ?? 0) > 0
  ) {
    homeworkRows.push({
      assignmentId: duringAssignmentId,
      title: duringTitle?.trim() || "In-session homework",
      attemptStatus: null,
      score: null,
      submittedAt: null,
      attemptId: null,
    });
  }
  const hasQuestionSets =
    Boolean(beforeAssignmentId) ||
    (Boolean(duringAssignmentId) && (duringQuestionCount ?? 0) > 0) ||
    assignments.some(
      (assignment) => assignment.status !== "archived" && (assignment.questionCount ?? 0) > 0,
    ) ||
    homework.some((item) => isPostSessionFollowUpQuiz(item));
  if (prework.length === 0 && homeworkRows.length === 0 && !hasQuestionSets) {
    return null;
  }
  return (
    <div className="rounded-xl border bg-background p-4" data-testid="tutor-session-materials">
      <p className="font-semibold">Pre-work and homework</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Completion for this session, plus one questions PDF and one answer key when a quiz is attached.
      </p>
      <div className="mt-3 space-y-3">
        {prework.map((row) => (
          <CompletionRow key={row.assignmentId} kind="Pre-work" timezone={timezone} row={row} />
        ))}
        {homeworkRows.map((row) => (
          <CompletionRow key={row.assignmentId} kind="Homework" timezone={timezone} row={row} />
        ))}
      </div>
      {canDownloadPdfs && hasQuestionSets ? (
        <div className="mt-4">
          <SessionQuestionDownloads sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}
