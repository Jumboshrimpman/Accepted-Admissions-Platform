export const ADMIN_INBOX_EMAIL = "admin@acceptedadmissions.org";
export const QUESTION_REPORT_ADMIN_EMAIL = ADMIN_INBOX_EMAIL;

export type TransactionalEmail = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  /** When true, a missing transport is `failed` rather than `skipped`. */
  required?: boolean;
};

export type TransactionalEmailResult =
  | { status: "sent"; id?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export type TransactionalEmailTransport = (
  input: TransactionalEmail,
) => Promise<TransactionalEmailResult>;

let testTransport: TransactionalEmailTransport | undefined;

export function setTransactionalEmailTestTransport(
  transport: TransactionalEmailTransport | undefined,
): void {
  testTransport = transport;
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminInboxEmail(email: string): boolean {
  return normalizeEmailAddress(email) === ADMIN_INBOX_EMAIL;
}

export function transactionalFromAddress(override?: string): string {
  return (
    override?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.TRANSACTIONAL_FROM_EMAIL?.trim() ||
    "Accepted Admissions <noreply@acceptedadmissions.org>"
  );
}

export function resendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

export function missingEmailTransportReason(): string {
  return "RESEND_API_KEY is not configured";
}

export async function sendTransactionalEmail(
  input: TransactionalEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<TransactionalEmailResult> {
  if (testTransport) {
    return testTransport(input);
  }

  const apiKey = resendApiKey();
  if (!apiKey) {
    const reason = missingEmailTransportReason();
    return input.required ? { status: "failed", error: reason } : { status: "skipped", reason };
  }

  const to = (Array.isArray(input.to) ? input.to : [input.to]).map(normalizeEmailAddress);
  try {
    const payload: Record<string, unknown> = {
      from: transactionalFromAddress(input.from),
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre>${input.text.replace(/</g, "&lt;")}</pre>`,
    };
    if (input.replyTo?.trim()) {
      payload.reply_to = input.replyTo.trim();
    }
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { status: "failed", error: detail.slice(0, 400) || `Resend HTTP ${response.status}` };
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", id: body.id };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Email delivery failed",
    };
  }
}
