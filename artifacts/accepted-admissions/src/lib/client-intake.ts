export const CLIENT_INTAKE_FOCUSES = [
  "college_consulting",
  "essay_help",
  "sat_tutoring",
] as const;

export type ClientIntakeFocus = (typeof CLIENT_INTAKE_FOCUSES)[number];

export const CLIENT_INTAKE_FOCUS_OPTIONS: ReadonlyArray<{
  value: ClientIntakeFocus;
  label: string;
}> = [
  { value: "college_consulting", label: "College consulting" },
  { value: "essay_help", label: "Essay help" },
  { value: "sat_tutoring", label: "SAT tutoring" },
];

export const RECORDING_CONSENT_LABEL =
  "I consent to the recording and AI-assisted transcription of my session.";

export const RECORDING_CONSENT_EXPLANATION =
  "You'll receive a copy of the notes afterward. The recording and transcript are used solely for your own tutoring purposes.";

export const INTAKE_STEPS = [
  "contact",
  "scores",
  "dreams",
  "safety",
  "focus",
  "consent",
] as const;

export type IntakeStep = (typeof INTAKE_STEPS)[number];

export type ClientIntakeDraft = {
  name: string;
  email: string;
  phone: string;
  latestSatScore: string;
  latestGpa: string;
  school: string;
  dreamUniversity1: string;
  dreamUniversity2: string;
  dreamUniversity3: string;
  targetSafetySchool: string;
  mainFocus: string;
  targetSatDate: string;
  recordingConsent: boolean;
};

export type ClientIntakeErrors = Record<string, string>;

const STEP_FIELDS: Record<IntakeStep, readonly string[]> = {
  contact: ["name", "email", "phone"],
  scores: ["latestSatScore", "latestGpa", "school"],
  dreams: ["dreamUniversity1", "dreamUniversity2", "dreamUniversity3"],
  safety: ["targetSafetySchool"],
  focus: ["mainFocus", "targetSatDate"],
  consent: ["recordingConsent"],
};

export function emptyIntakeDraft(seed?: { name?: string; email?: string }): ClientIntakeDraft {
  return {
    name: seed?.name ?? "",
    email: seed?.email ?? "",
    phone: "",
    latestSatScore: "",
    latestGpa: "",
    school: "",
    dreamUniversity1: "",
    dreamUniversity2: "",
    dreamUniversity3: "",
    targetSafetySchool: "",
    mainFocus: "",
    targetSatDate: "",
    recordingConsent: false,
  };
}

function text(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value : "";
}

function requiredText(value: unknown, max: number): string | null {
  const trimmed = text(value).trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function utcIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function realIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function validateClientIntake(
  input: Partial<ClientIntakeDraft>,
  today = new Date(),
): { ok: true } | { ok: false; errors: ClientIntakeErrors } {
  const errors: ClientIntakeErrors = {};
  const email = text(input.email).trim().toLowerCase();
  const phone = text(input.phone).trim();
  const safetyRaw = text(input.targetSafetySchool).trim().replace(/\s+/g, " ");
  const satRaw = text(input.latestSatScore).trim();
  const gpaRaw = text(input.latestGpa).trim();
  const focus = text(input.mainFocus).trim();
  const satDate = text(input.targetSatDate).trim();

  if (!requiredText(input.name, 120)) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    errors.email = "Enter a valid email.";
  }
  if ((phone.match(/\d/g)?.length ?? 0) < 7 || phone.length > 40) {
    errors.phone = "Enter a phone number.";
  }
  if (!/^\d{3,4}$/.test(satRaw) || Number(satRaw) < 400 || Number(satRaw) > 1600) {
    errors.latestSatScore = "Enter your latest SAT score from 400 to 1600.";
  }
  if (!/^(?:[0-4](?:\.\d{1,2})?|5(?:\.0{1,2})?)$/.test(gpaRaw)) {
    errors.latestGpa = "Enter a GPA from 0 to 5.00.";
  }
  if (!requiredText(input.school, 160)) errors.school = "Enter your school.";
  if (!requiredText(input.dreamUniversity1, 160)) errors.dreamUniversity1 = "Enter your first dream university.";
  if (!requiredText(input.dreamUniversity2, 160)) errors.dreamUniversity2 = "Enter your second dream university.";
  if (!requiredText(input.dreamUniversity3, 160)) errors.dreamUniversity3 = "Enter your third dream university.";
  if (safetyRaw.length > 160) errors.targetSafetySchool = "Use 160 characters or fewer.";
  if (!(CLIENT_INTAKE_FOCUSES as readonly string[]).includes(focus)) {
    errors.mainFocus = "Choose a main focus.";
  }
  if (focus === "sat_tutoring") {
    if (!realIsoDate(satDate) || satDate < utcIsoDate(today)) {
      errors.targetSatDate = "Enter your next SAT date.";
    }
  }
  if (input.recordingConsent !== true) {
    errors.recordingConsent = "Consent is required before you can submit.";
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}

export function intakeStepErrors(
  step: IntakeStep,
  draft: Partial<ClientIntakeDraft>,
  today = new Date(),
): ClientIntakeErrors {
  const result = validateClientIntake(
    { ...emptyIntakeDraft(), ...draft, recordingConsent: draft.recordingConsent === true },
    today,
  );
  if (result.ok) return {};
  const fields = new Set(STEP_FIELDS[step]);
  return Object.fromEntries(Object.entries(result.errors).filter(([key]) => fields.has(key)));
}
