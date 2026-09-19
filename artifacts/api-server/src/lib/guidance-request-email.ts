import {
  ADMIN_INBOX_EMAIL,
  isAdminInboxEmail,
  sendTransactionalEmail,
  type TransactionalEmail,
  type TransactionalEmailResult,
} from "./transactional-email.ts";

export type GuidanceRequestEmailFields = {
  guardianName: string;
  studentName: string;
  email: string;
  phone: string;
  gradeOrGraduationYear: string;
  currentSchool: string;
  serviceRequested: string;
  currentSatTotal?: string | null;
  currentReadingWriting?: string | null;
  currentMath?: string | null;
  targetSatScore?: string | null;
  plannedTestDate?: string | null;
  goals: string;
  schedulingAvailability: string;
  referralSource: string;
  consentToContact: boolean;
  privacyAcknowledged: boolean;
  sourcePage: string;
};

export function guidanceRequestAdminInbox(candidate = ADMIN_INBOX_EMAIL): string {
  if (!isAdminInboxEmail(candidate)) {
    throw new Error(`Guidance request email must go to ${ADMIN_INBOX_EMAIL}`);
  }
  return ADMIN_INBOX_EMAIL;
}

export function guidanceRequestEmailSubject(fields: GuidanceRequestEmailFields): string {
  return `New guidance request: ${fields.studentName} — ${fields.serviceRequested}`;
}

function optionalLine(label: string, value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function guidanceRequestEmailText(fields: GuidanceRequestEmailFields): string {
  return [
    "A public Get guidance / client-request form was submitted.",
    "",
    `Parent / guardian or client: ${fields.guardianName}`,
    `Student: ${fields.studentName}`,
    `Contact email: ${fields.email}`,
    `Phone: ${fields.phone}`,
    `Grade or graduation year: ${fields.gradeOrGraduationYear}`,
    `Current school: ${fields.currentSchool}`,
    `Service requested: ${fields.serviceRequested}`,
    optionalLine("Current SAT total", fields.currentSatTotal),
    optionalLine("Current Reading/Writing", fields.currentReadingWriting),
    optionalLine("Current Math", fields.currentMath),
    optionalLine("Target SAT score", fields.targetSatScore),
    optionalLine("Planned test date", fields.plannedTestDate),
    `Goals: ${fields.goals}`,
    `Scheduling availability: ${fields.schedulingAvailability}`,
    `Referral source: ${fields.referralSource}`,
    `Consent to contact: ${fields.consentToContact ? "yes" : "no"}`,
    `Privacy acknowledged: ${fields.privacyAcknowledged ? "yes" : "no"}`,
    `Source page: ${fields.sourcePage}`,
    "",
    "Reply to this email to reach the person who submitted the form.",
    "This notice is for admin@acceptedadmissions.org only.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top;">${escapeHtml(label)}</th><td>${escapeHtml(trimmed)}</td></tr>`;
}

export function guidanceRequestEmailHtml(fields: GuidanceRequestEmailFields): string {
  return `<p>A public Get guidance / client-request form was submitted.</p>
<table>
${row("Parent / guardian or client", fields.guardianName)}
${row("Student", fields.studentName)}
${row("Contact email", fields.email)}
${row("Phone", fields.phone)}
${row("Grade or graduation year", fields.gradeOrGraduationYear)}
${row("Current school", fields.currentSchool)}
${row("Service requested", fields.serviceRequested)}
${row("Current SAT total", fields.currentSatTotal)}
${row("Current Reading/Writing", fields.currentReadingWriting)}
${row("Current Math", fields.currentMath)}
${row("Target SAT score", fields.targetSatScore)}
${row("Planned test date", fields.plannedTestDate)}
${row("Goals", fields.goals)}
${row("Scheduling availability", fields.schedulingAvailability)}
${row("Referral source", fields.referralSource)}
${row("Consent to contact", fields.consentToContact ? "yes" : "no")}
${row("Privacy acknowledged", fields.privacyAcknowledged ? "yes" : "no")}
${row("Source page", fields.sourcePage)}
</table>
<p>Reply to this email to reach the person who submitted the form. This notice is for admin@acceptedadmissions.org only.</p>`;
}

export async function sendGuidanceRequestAdminEmail(
  fields: GuidanceRequestEmailFields,
  sendEmail: typeof sendTransactionalEmail = sendTransactionalEmail,
): Promise<TransactionalEmailResult> {
  const to = guidanceRequestAdminInbox();
  const message: TransactionalEmail = {
    to,
    replyTo: fields.email,
    subject: guidanceRequestEmailSubject(fields),
    text: guidanceRequestEmailText(fields),
    html: guidanceRequestEmailHtml(fields),
    required: false,
  };
  const result = await sendEmail(message);
  if (result.status !== "sent") {
    const reason = result.status === "skipped" ? result.reason : result.error;
    console.error({
      event: "guidance_request.email_failed",
      reason,
      status: result.status,
      msg: "Guidance request email was not sent; the request remains saved for the admin portal",
    });
    return result;
  }
  console.info({
    event: "guidance_request.email_sent",
    id: result.id,
    msg: "Guidance request emailed to admin inbox",
  });
  return result;
}
