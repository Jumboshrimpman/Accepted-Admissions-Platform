import { useState } from "react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { FileDown } from "lucide-react";
import { describeAssignmentCompletion } from "@/lib/assignment-completion";
import { isPostSessionFollowUpQuiz } from "@/lib/student-quiz-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
};

async function downloadSessionQuestionPdf(
  sessionId: string,
  phase: "before_session" | "during_session",
  answers: boolean,
) {
  const blob = await customFetch<Blob>(
    `/api/sessions/${encodeURIComponent(sessionId)}/question-pdf?phase=${phase}${answers ? "&answers=1" : ""}`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const part = phase === "before_session" ? "pre-work" : "in-session";
  link.download = `${part}-${answers ? "answer-key" : "questions"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function PdfDownloadButton({
  sessionId,
  phase,
  answers,
  label,
  testId,
}: {
  sessionId: string;
  phase: "before_session" | "during_session";
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
        void downloadSessionQuestionPdf(sessionId, phase, answers).finally(() => setPending(false));
      }}
    >
      <FileDown className="mr-2 h-4 w-4" />
      {pending ? "Preparing PDF…" : label}
    </Button>
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
}: {
  sessionId: string;
  timezone?: string | null;
  assignments: AssignmentRow[];
  homework: HomeworkRow[];
  beforeAssignmentId?: string | null;
  duringAssignmentId?: string | null;
  duringTitle?: string | null;
  duringQuestionCount?: number | null;
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
  const showPreworkPdf = Boolean(beforeAssignmentId);
  const showInSessionPdf = Boolean(duringAssignmentId) && (duringQuestionCount ?? 0) > 0;
  if (prework.length === 0 && homeworkRows.length === 0 && !showPreworkPdf && !showInSessionPdf) {
    return null;
  }
  return (
    <div className="rounded-xl border bg-background p-4" data-testid="tutor-session-materials">
      <p className="font-semibold">Pre-work and homework</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Completion for this session, plus question PDFs when a quiz is attached.
      </p>
      <div className="mt-3 space-y-3">
        {prework.map((row) => (
          <CompletionRow key={row.assignmentId} kind="Pre-work" timezone={timezone} row={row} />
        ))}
        {homeworkRows.map((row) => (
          <CompletionRow key={row.assignmentId} kind="Homework" timezone={timezone} row={row} />
        ))}
      </div>
      {showPreworkPdf || showInSessionPdf ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {showPreworkPdf ? (
            <>
              <PdfDownloadButton
                sessionId={sessionId}
                phase="before_session"
                answers={false}
                label="Download pre-work questions (PDF)"
                testId="download-prework-questions"
              />
              <PdfDownloadButton
                sessionId={sessionId}
                phase="before_session"
                answers
                label="Download pre-work answer key (PDF)"
                testId="download-prework-answer-key"
              />
            </>
          ) : null}
          {showInSessionPdf ? (
            <>
              <PdfDownloadButton
                sessionId={sessionId}
                phase="during_session"
                answers={false}
                label="Download in-session questions (PDF)"
                testId="download-in-session-questions"
              />
              <PdfDownloadButton
                sessionId={sessionId}
                phase="during_session"
                answers
                label="Download in-session answer key (PDF)"
                testId="download-in-session-answer-key"
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
