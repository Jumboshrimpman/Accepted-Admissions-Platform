import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type QuestionReportRow = {
  id: string;
  assignmentTitle: string;
  questionIndex: number;
  studentName: string;
  studentEmail: string;
  reason: string;
  note: string | null;
  stemSnippet: string;
  status: string;
  createdAt: string;
};

export function QuestionReportsQueue() {
  const [reports, setReports] = useState<QuestionReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const payload = await customFetch<{ reports: QuestionReportRow[] }>("/api/admin/question-reports");
      setReports(payload.reports ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load question reports.");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const updateStatus = async (reportId: string, status: "resolved" | "dismissed") => {
    setPendingId(reportId);
    try {
      await customFetch(`/api/admin/question-reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this report.");
    } finally {
      setPendingId(null);
    }
  };

  const openReports = reports.filter((report) => report.status === "open");

  return (
    <Card data-testid="card-question-reports">
      <CardHeader>
        <CardTitle>Reported questions</CardTitle>
        <CardDescription>
          Students can report a broken or incorrect item and keep going. Open reports also email admin@acceptedadmissions.org.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {openReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open question reports.</p>
        ) : (
          openReports.map((report) => (
            <div key={report.id} className="rounded-lg border p-3 text-sm" data-testid={`question-report-${report.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{report.studentName}</p>
                <Badge variant="outline">{report.reason}</Badge>
                <span className="text-muted-foreground">
                  Q{report.questionIndex + 1} · {report.assignmentTitle}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{report.studentEmail}</p>
              {report.stemSnippet ? <p className="mt-2">{report.stemSnippet}</p> : null}
              {report.note ? <p className="mt-1 text-muted-foreground">Note: {report.note}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pendingId === report.id}
                  onClick={() => updateStatus(report.id, "resolved")}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === report.id}
                  onClick={() => updateStatus(report.id, "dismissed")}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
