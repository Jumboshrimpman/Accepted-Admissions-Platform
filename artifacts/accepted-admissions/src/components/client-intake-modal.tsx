import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLIENT_INTAKE_FOCUS_OPTIONS,
  INTAKE_STEPS,
  intakeStepErrors,
  validateClientIntake,
  type ClientIntakeDraft,
  type ClientIntakeErrors,
  type IntakeStep,
} from "@/lib/client-intake";

type IntakeStatus = { assigned: boolean; completed: boolean };

type IntakeContextValue = {
  status: IntakeStatus | null;
  openIntake: () => void;
};

export const ClientIntakeContext = createContext<IntakeContextValue | null>(null);

export function useClientIntake(): IntakeContextValue | null {
  return useContext(ClientIntakeContext);
}

const FIELD_CLASS = "h-11 w-full text-base";

function Field({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric" | "decimal" | "text" | "tel" | "email";
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={FIELD_CLASS}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ClientIntakeModal({
  open,
  draft,
  onDraft,
  onClose,
  onSubmit,
}: {
  open: boolean;
  draft: ClientIntakeDraft;
  onDraft: (draft: ClientIntakeDraft) => void;
  onClose: () => void;
  onSubmit: (draft: ClientIntakeDraft) => Promise<void>;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<ClientIntakeErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const step: IntakeStep = INTAKE_STEPS[stepIndex] ?? "contact";

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setErrors({});
      setFormError("");
    }
  }, [open]);

  if (!open) return null;

  const set = (patch: Partial<ClientIntakeDraft>) => onDraft({ ...draft, ...patch });

  const goNext = () => {
    const nextErrors = intakeStepErrors(step, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStepIndex((index) => Math.min(index + 1, INTAKE_STEPS.length - 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateClientIntake(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await onSubmit(draft);
    } catch {
      setFormError("We couldn't save that. Check the answers and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-intake-title"
        data-testid="client-intake-modal"
        onSubmit={submit}
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-background sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step {stepIndex + 1} of {INTAKE_STEPS.length}
            </p>
            <h2 id="client-intake-title" className="text-lg font-semibold">
              Client intake
            </h2>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {step === "contact" ? (
            <>
              <Field id="intake-name" label="Name" value={draft.name} error={errors.name} onChange={(name) => set({ name })} />
              <Field id="intake-email" label="Email" type="email" value={draft.email} error={errors.email} onChange={(email) => set({ email })} />
              <Field id="intake-phone" label="Phone" type="tel" value={draft.phone} error={errors.phone} onChange={(phone) => set({ phone })} />
            </>
          ) : null}
          {step === "scores" ? (
            <>
              <Field id="intake-sat" label="Latest SAT score" inputMode="numeric" value={draft.latestSatScore} error={errors.latestSatScore} onChange={(latestSatScore) => set({ latestSatScore })} />
              <Field id="intake-gpa" label="Latest GPA" inputMode="decimal" value={draft.latestGpa} error={errors.latestGpa} onChange={(latestGpa) => set({ latestGpa })} />
              <Field id="intake-school" label="School" value={draft.school} error={errors.school} onChange={(school) => set({ school })} />
            </>
          ) : null}
          {step === "dreams" ? (
            <>
              <Field id="intake-dream-1" label="Dream university 1" value={draft.dreamUniversity1} error={errors.dreamUniversity1} onChange={(dreamUniversity1) => set({ dreamUniversity1 })} />
              <Field id="intake-dream-2" label="Dream university 2" value={draft.dreamUniversity2} error={errors.dreamUniversity2} onChange={(dreamUniversity2) => set({ dreamUniversity2 })} />
              <Field id="intake-dream-3" label="Dream university 3" value={draft.dreamUniversity3} error={errors.dreamUniversity3} onChange={(dreamUniversity3) => set({ dreamUniversity3 })} />
            </>
          ) : null}
          {step === "safety" ? (
            <Field
              id="intake-safety"
              label="One target or safety school (optional)"
              value={draft.targetSafetySchool}
              error={errors.targetSafetySchool}
              onChange={(targetSafetySchool) => set({ targetSafetySchool })}
            />
          ) : null}
          {step === "focus" ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Main focus</legend>
              {CLIENT_INTAKE_FOCUS_OPTIONS.map((option) => (
                <label key={option.value} className="flex min-h-11 items-center gap-3 text-base">
                  <input
                    type="radio"
                    name="intake-focus"
                    value={option.value}
                    checked={draft.mainFocus === option.value}
                    onChange={() => set({ mainFocus: option.value })}
                  />
                  {option.label}
                </label>
              ))}
              {errors.mainFocus ? <p className="text-sm text-destructive">{errors.mainFocus}</p> : null}
              {draft.mainFocus === "sat_tutoring" ? (
                <Field
                  id="intake-sat-date"
                  label="Next target SAT date"
                  type="date"
                  value={draft.targetSatDate}
                  error={errors.targetSatDate}
                  onChange={(targetSatDate) => set({ targetSatDate })}
                />
              ) : null}
            </fieldset>
          ) : null}
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <div className="flex gap-2 border-t px-4 py-4 sm:px-6">
          {stepIndex > 0 ? (
            <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => setStepIndex((index) => index - 1)}>
              Back
            </Button>
          ) : null}
          {stepIndex === INTAKE_STEPS.length - 1 ? (
            <Button type="submit" className="min-h-11 flex-1" disabled={submitting}>
              Submit intake
            </Button>
          ) : (
            <Button type="button" className="min-h-11 flex-1" onClick={goNext}>
              Next
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export function ClientIntakeAction() {
  const intake = useClientIntake();
  if (!intake?.status?.assigned || intake.status.completed) return null;
  return (
    <section
      data-testid="client-intake-action"
      className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="font-semibold">Complete your intake</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your school, scores, and the universities you want to aim for.
        </p>
      </div>
      <Button type="button" className="min-h-11" onClick={intake.openIntake}>
        Start intake
      </Button>
    </section>
  );
}
