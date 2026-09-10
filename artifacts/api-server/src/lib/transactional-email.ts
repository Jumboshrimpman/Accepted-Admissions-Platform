export const QUESTION_REPORT_ADMIN_EMAIL = "admin@acceptedadmissions.org";

export type TransactionalEmail = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
};

export type TransactionalEmailResult =
  | { status: "sent"; id?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

function resendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

export async function sendTransactionalEmail(
  input: TransactionalEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<TransactionalEmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    return { status: "skipped", reason: "RESEND_API_KEY is not configured" };
  }
  const to = Array.isArray(input.to) ? input.to : [input.to];
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? "Accepted Admissions <noreply@acceptedadmissions.org>",
        to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? `<pre>${input.text.replace(/</g, "&lt;")}</pre>`,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { status: "failed", error: detail.slice(0, 400) || `Resend HTTP ${response.status}` };
    }
    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", id: payload.id };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Email delivery failed",
    };
  }
}
