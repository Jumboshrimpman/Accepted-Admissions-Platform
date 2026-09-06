import { useState } from "react";
import type {
  AdminCurriculum,
  AdminRelationship,
  AdminTutorAssignmentInput,
} from "@workspace/api-client-react";
import { GraduationCap, Link2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { assignmentSubjectOptions, personOptionLabel } from "@/lib/session-people";
import { sessionSubjectLabel } from "@/lib/session-display";

type Client = AdminCurriculum["clients"][number];
type Tutor = AdminCurriculum["tutors"][number];
type Program = AdminCurriculum["programs"][number];

function relationshipKey(link: Pick<AdminRelationship, "id" | "courseId" | "subject">): string {
  return `${link.id}:${link.courseId}:${link.subject.trim().toLowerCase()}`;
}

function AssignRow({
  counterpartLabel,
  counterpartAriaLabel,
  counterparts,
  programs,
  defaultCourseId,
  defaultSubject,
  subjectSource,
  alreadyAssigned,
  disabled,
  onAssign,
  testIdPrefix,
}: {
  counterpartLabel: string;
  counterpartAriaLabel: string;
  counterparts: Array<{ id: string; name: string; email?: string | null; subjects?: string[] }>;
  programs: Program[];
  defaultCourseId: string;
  defaultSubject: string;
  subjectSource?: string[];
  alreadyAssigned: Set<string>;
  disabled: boolean;
  onAssign: (counterpartId: string, courseId: string, subject: string) => void;
  testIdPrefix: string;
}) {
  const [counterpartId, setCounterpartId] = useState(counterparts[0]?.id ?? "");
  const selected = counterparts.find((person) => person.id === counterpartId);
  const subjects = assignmentSubjectOptions(subjectSource ?? selected?.subjects ?? []);
  const [subject, setSubject] = useState(defaultSubject || subjects[0] || "SAT");
  const [courseId, setCourseId] = useState(defaultCourseId);
  const duplicate = Boolean(
    counterpartId &&
      courseId &&
      subject &&
      alreadyAssigned.has(`${counterpartId}:${courseId}:${subject.trim().toLowerCase()}`),
  );
  const canSubmit = Boolean(counterpartId && courseId && subject) && !duplicate && !disabled;

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{counterpartLabel}</Label>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={counterpartId}
          onChange={(event) => {
            const nextId = event.target.value;
            setCounterpartId(nextId);
            const next = counterparts.find((person) => person.id === nextId);
            const nextSubjects = assignmentSubjectOptions(subjectSource ?? next?.subjects ?? []);
            if (nextSubjects.length > 0 && !nextSubjects.includes(subject)) {
              setSubject(nextSubjects[0]!);
            }
          }}
          aria-label={counterpartAriaLabel}
          data-testid={`${testIdPrefix}-person`}
        >
          {counterparts.length === 0 ? (
            <option value="">None available</option>
          ) : (
            counterparts.map((person) => (
              <option key={person.id} value={person.id}>
                {personOptionLabel(person)}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Subject</Label>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={subjects.includes(subject) ? subject : (subjects[0] ?? "SAT")}
          onChange={(event) => setSubject(event.target.value)}
          aria-label={`${counterpartAriaLabel} subject`}
          data-testid={`${testIdPrefix}-subject`}
        >
          {subjects.map((option) => (
            <option key={option} value={option}>
              {sessionSubjectLabel(option)}
            </option>
          ))}
        </select>
      </div>
      {programs.length > 1 ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Program</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            aria-label={`${counterpartAriaLabel} program`}
            data-testid={`${testIdPrefix}-program`}
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Button
        size="sm"
        disabled={!canSubmit}
        onClick={() => onAssign(counterpartId, courseId, subject)}
        data-testid={`${testIdPrefix}-submit`}
      >
        <Link2 className="mr-1.5 h-3.5 w-3.5" /> Assign
      </Button>
      {duplicate ? (
        <p className="text-xs text-muted-foreground sm:col-span-3">
          That link already exists for this program and subject.
        </p>
      ) : null}
    </div>
  );
}

function RelationshipBadges({
  links,
  emptyText,
  onUnassign,
  unassignPending,
}: {
  links: AdminRelationship[];
  emptyText: string;
  onUnassign: (assignmentId: string) => void;
  unassignPending: boolean;
}) {
  if (links.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((link) => (
        <span
          key={link.assignmentId}
          className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 py-0.5 pl-2.5 pr-1 text-xs font-medium"
        >
          {link.name} · {sessionSubjectLabel(link.subject)}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full"
            disabled={unassignPending}
            onClick={() => onUnassign(link.assignmentId)}
            aria-label={`Unassign ${link.name} · ${sessionSubjectLabel(link.subject)}`}
            data-testid={`button-unassign-${link.assignmentId}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </span>
      ))}
    </div>
  );
}

export function PeopleRelationshipLists({
  clients,
  tutors,
  programs,
  onAssign,
  onUnassign,
  assignPending,
  unassignPending,
}: {
  clients: Client[];
  tutors: Tutor[];
  programs: Program[];
  onAssign: (input: AdminTutorAssignmentInput) => void;
  onUnassign: (assignmentId: string) => void;
  assignPending: boolean;
  unassignPending: boolean;
}) {
  const defaultCourseId = programs[0]?.id ?? "";
  const canAssign = programs.length > 0 && tutors.length > 0 && clients.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Clients / students
          </CardTitle>
          <CardDescription>
            Current tutor links and assign/unassign. Client preview is read-only and shows these live links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {clients.map((client) => (
            <div key={client.id} className="rounded-xl border p-3" data-testid={`people-student-${client.id}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                </div>
                <Badge variant="outline">Student</Badge>
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned tutors
                </p>
                <RelationshipBadges
                  links={client.assignedTutors}
                  emptyText="No tutor is assigned yet. Use Assign below."
                  onUnassign={onUnassign}
                  unassignPending={unassignPending}
                />
                {canAssign ? (
                  <AssignRow
                    counterpartLabel="Tutor"
                    counterpartAriaLabel={`Tutor for ${client.name}`}
                    counterparts={tutors}
                    programs={programs}
                    defaultCourseId={defaultCourseId}
                    defaultSubject={assignmentSubjectOptions(tutors[0]?.subjects)[0] ?? "SAT"}
                    alreadyAssigned={new Set(client.assignedTutors.map(relationshipKey))}
                    disabled={assignPending}
                    onAssign={(tutorUserId, courseId, subject) =>
                      onAssign({ tutorUserId, studentUserId: client.id, courseId, subject })
                    }
                    testIdPrefix={`assign-tutor-${client.id}`}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching clients.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Tutors
          </CardTitle>
          <CardDescription>
            Subject access, assigned clients, and activity. Compensation is never returned by this operational view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tutors.map((tutor) => (
            <div key={tutor.id} className="rounded-xl border p-3" data-testid={`people-tutor-${tutor.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{tutor.name}</p>
                  <p className="text-sm text-muted-foreground">{tutor.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tutor.subjects.map((subject) => (
                      <Badge key={subject} variant="secondary">
                        {sessionSubjectLabel(subject)}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tutor.sessionCount} total sessions · {tutor.upcomingSessionCount} upcoming
                  </p>
                </div>
                <Badge variant={tutor.active ? "default" : "outline"}>
                  {tutor.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned clients
                </p>
                <RelationshipBadges
                  links={tutor.assignedStudents}
                  emptyText="No student is assigned yet. Use Assign below."
                  onUnassign={onUnassign}
                  unassignPending={unassignPending}
                />
                {canAssign ? (
                  <AssignRow
                    counterpartLabel="Student"
                    counterpartAriaLabel={`Student for ${tutor.name}`}
                    counterparts={clients}
                    programs={programs}
                    defaultCourseId={defaultCourseId}
                    defaultSubject={assignmentSubjectOptions(tutor.subjects)[0] ?? "SAT"}
                    subjectSource={tutor.subjects}
                    alreadyAssigned={new Set(tutor.assignedStudents.map(relationshipKey))}
                    disabled={assignPending}
                    onAssign={(studentUserId, courseId, subject) =>
                      onAssign({ tutorUserId: tutor.id, studentUserId, courseId, subject })
                    }
                    testIdPrefix={`assign-student-${tutor.id}`}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {tutors.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching tutors.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
