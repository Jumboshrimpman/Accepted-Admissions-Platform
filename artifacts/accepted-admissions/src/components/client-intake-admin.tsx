import { useCallback, useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLIENT_INTAKE_FOCUS_OPTIONS } from "@/lib/client-intake";

type IntakeResponse = {
  name: string;
  email: string;
  phone: string;
  latestSatScore: number;
  latestGpa: string;
  school: string;
  dreamUniversities: string[];
  targetSafetySchool: string | null;
  mainFocus: string;
  targetSatDate: string | null;
  submittedAt: string;
};

type IntakeAssignment = {
  id: string;
  clientUserId: string;
  clientDisplayName: string;
  status: string;
  completedAt: string | null;
  response: IntakeResponse | null;
};

export function submittedIntakeCount(rows: readonly IntakeAssignment[]): number {
  return rows.filter((row) => row.status === "completed").length;
}

export function clientIntakeSummary(assigned: number, submitted: number): string {
  if (assigned === 0) return "No intakes assigned yet.";
  return `${assigned} client${assigned === 1 ? "" : "s"} · ${submitted} submitted`;
}

export function useClientIntakes() {
  const [rows, setRows] = useState<IntakeAssignment[]>([]);

  const reload = useCallback(() => {
    if (typeof customFetch !== "function") return Promise.resolve();
    return customFetch<{ assignments?: IntakeAssignment[] }>("/api/admin/client-intakes")
      .then((payload) => setRows(payload.assignments ?? []))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assign = useCallback(async (clientUserId: string) => {
    if (!clientUserId || typeof customFetch !== "function") return;
    await customFetch("/api/admin/client-intakes", {
      method: "POST",
      body: JSON.stringify({ clientUserId }),
    });
    await reload();
  }, [reload]);

  return { rows, assign };
}

function ClientIntakeBody({
  students,
  rows,
  onAssign,
}: {
  students: Array<{ id: string; displayName: string }>;
  rows: IntakeAssignment[];
  onAssign: (clientUserId: string) => Promise<void>;
}) {
  const [clientUserId, setClientUserId] = useState("");
  const [message, setMessage] = useState("");

  const assign = async () => {
    if (!clientUserId) return;
    setMessage("");
    try {
      await onAssign(clientUserId);
      setMessage("Intake assigned.");
    } catch {
      setMessage("That client could not be assigned.");
    }
  };

  return (
    <div className="space-y-4">
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer font-medium">Assign to a client</summary>
          <div className="mt-3 flex flex-col gap-2">
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                className="min-h-11 rounded-lg border px-3 text-left text-base"
                onClick={() => setClientUserId(student.id)}
              >
                {student.displayName}
              </button>
            ))}
            <Button type="button" className="min-h-11" disabled={!clientUserId} onClick={() => void assign()}>
              Assign intake
            </Button>
          </div>
        </details>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No intake assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <details key={row.id} className="rounded-xl border p-3" open={row.status === "completed"}>
                <summary className="cursor-pointer font-medium">
                  {row.clientDisplayName} · {row.status === "completed" ? "Submitted" : "Waiting"}
                </summary>
                {row.response ? (
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Name</dt><dd>{row.response.name}</dd></div>
                    <div><dt className="text-muted-foreground">Email</dt><dd>{row.response.email}</dd></div>
                    <div><dt className="text-muted-foreground">Phone</dt><dd>{row.response.phone}</dd></div>
                    <div><dt className="text-muted-foreground">Latest SAT</dt><dd>{row.response.latestSatScore}</dd></div>
                    <div><dt className="text-muted-foreground">Latest GPA</dt><dd>{row.response.latestGpa}</dd></div>
                    <div><dt className="text-muted-foreground">School</dt><dd>{row.response.school}</dd></div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Dream universities</dt>
                      <dd>{row.response.dreamUniversities.join(", ")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Target or safety</dt>
                      <dd>{row.response.targetSafetySchool || "None"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Main focus</dt>
                      <dd>
                        {CLIENT_INTAKE_FOCUS_OPTIONS.find((option) => option.value === row.response?.mainFocus)?.label ?? row.response.mainFocus}
                        {row.response.targetSatDate ? ` · ${row.response.targetSatDate}` : ""}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Not submitted yet.</p>
                )}
              </details>
            ))}
          </div>
        )}
    </div>
  );
}

function OwnedClientIntakeCard({
  students,
}: {
  students: Array<{ id: string; displayName: string }>;
}) {
  const { rows, assign } = useClientIntakes();
  return (
    <Card data-testid="card-client-intake">
      <CardHeader>
        <CardTitle>Client intake</CardTitle>
        <CardDescription>
          Assign the intake to any client. Neel and Sophia already see it in their portals. Answers stay on this dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ClientIntakeBody students={students} rows={rows} onAssign={assign} />
      </CardContent>
    </Card>
  );
}

export function ClientIntakeAdmin(
  props:
    | {
        contentOnly: true;
        students: Array<{ id: string; displayName: string }>;
        rows: IntakeAssignment[];
        onAssign: (clientUserId: string) => Promise<void>;
      }
    | {
        contentOnly?: false;
        students: Array<{ id: string; displayName: string }>;
      },
) {
  if (props.contentOnly) {
    return <ClientIntakeBody students={props.students} rows={props.rows} onAssign={props.onAssign} />;
  }
  return <OwnedClientIntakeCard students={props.students} />;
}
