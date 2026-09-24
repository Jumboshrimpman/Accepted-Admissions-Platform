import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ClearHomeworkResult = {
  sessionId: string;
  assignmentIds: string[];
  deletedAttempts: number;
  keptAssignments: number;
  deliveryPhase?: "before_session" | "during_session";
};

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || "Could not clear the homework attempt.";
}

export function ClearHomeworkButton({
  sessionId,
  onCleared,
  testId,
  assignmentId,
  deliveryPhase,
}: {
  sessionId: string;
  onCleared?: (result: ClearHomeworkResult) => void;
  testId?: string;
  assignmentId?: string;
  deliveryPhase?: "before_session" | "during_session";
}) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  const inSession = deliveryPhase === "during_session";

  const clear = () => {
    setClearing(true);
    setMessage("");
    const payload: {
      assignmentId?: string;
      deliveryPhase?: "before_session" | "during_session";
    } = {};
    if (assignmentId) payload.assignmentId = assignmentId;
    if (deliveryPhase) payload.deliveryPhase = deliveryPhase;
    customFetch<ClearHomeworkResult>(`/api/sessions/${sessionId}/clear-prework`, {
      method: "POST",
      ...(Object.keys(payload).length > 0 ? { body: JSON.stringify(payload) } : {}),
    })
      .then((result: ClearHomeworkResult) => {
        setMessage(
          `Cleared ${result.deletedAttempts} attempt(s). The same assignment stays attached so the student can start again.`,
        );
        onCleared?.(result);
        setOpen(false);
      })
      .catch((error: unknown) => setMessage(errorText(error)))
      .finally(() => setClearing(false));
  };

  return (
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={clearing}
            data-testid={testId ?? `clear-homework-${sessionId}`}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {clearing ? "Clearing…" : "Clear & redo"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear homework and let the student start again?</AlertDialogTitle>
            <AlertDialogDescription>
              {inSession
                ? "This removes in-session homework attempts — answers, timer, and consolidated result. The same in-session assignment and questions stay attached. Before-session diagnostics are not changed, and the question bank is not deleted."
                : assignmentId
                  ? "This removes every attempt on this assignment — answers, timer, and consolidated result — so it shows Not started. The assignment and its questions stay attached. Other assignments, other sessions, and the question bank are not changed."
                  : "This removes the student’s current attempt — answers, timer, and result. The same assignment and questions stay attached so they can redo it. The question bank is not deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              data-testid={testId ? `${testId}-confirm` : `clear-homework-${sessionId}-confirm`}
              onClick={(event) => {
                event.preventDefault();
                clear();
              }}
            >
              {clearing ? "Clearing…" : "Clear & redo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
