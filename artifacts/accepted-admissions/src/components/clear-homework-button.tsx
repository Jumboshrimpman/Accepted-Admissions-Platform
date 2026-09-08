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
};

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || "Could not clear the homework attempt.";
}

export function ClearHomeworkButton({
  sessionId,
  onCleared,
  testId,
}: {
  sessionId: string;
  onCleared?: (result: ClearHomeworkResult) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");

  const clear = () => {
    setClearing(true);
    setMessage("");
    customFetch<ClearHomeworkResult>(`/api/sessions/${sessionId}/clear-prework`, {
      method: "POST",
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
              This removes the student’s current attempt — answers, timer, and result. The same
              assignment and questions stay attached so they can redo it. The question bank is not
              deleted.
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
