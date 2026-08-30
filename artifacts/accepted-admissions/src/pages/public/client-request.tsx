import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublicSiteShell, publicApiPath } from "@/components/public-site-shell";

type RequestForm = Record<string, string | boolean>;

const fields = [
  ["guardianName", "Parent / guardian or client full name", "text"],
  ["studentName", "Student full name", "text"],
  ["email", "Email address", "email"],
  ["phone", "Phone number", "tel"],
  ["gradeOrGraduationYear", "Student grade or graduation year", "text"],
  ["currentSchool", "Current school", "text"],
  ["serviceRequested", "Service requested", "text"],
  ["currentSatTotal", "Current SAT total score (optional)", "text"],
  ["currentReadingWriting", "Current Reading/Writing score (optional)", "text"],
  ["currentMath", "Current Math score (optional)", "text"],
  ["targetSatScore", "Target SAT score (optional)", "text"],
  ["plannedTestDate", "Planned test date (optional)", "text"],
  ["referralSource", "How did you hear about Accepted Admissions?", "text"],
] as const;

export default function ClientRequest() {
  const [form, setForm] = useState<RequestForm>({ consentToContact: false, privacyAcknowledged: false });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch(publicApiPath("/api/public/client-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sourcePage: "/client-request" }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to send request");
      setStatus("success");
      setMessage(data.message || "Thanks — your request has been received.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to send request");
    }
  }

  return (
    <PublicSiteShell eyebrow="A thoughtful first step">
      <main className="container mx-auto px-6 py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div className="lg:sticky lg:top-32">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Client request</p>
            <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Tell us what would make the next step useful.</h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">Share a little context and the Accepted Admissions team can follow up with the right questions. Your submission is private and is only visible to the administrator team.</p>
            <div className="mt-8 space-y-4 text-sm text-muted-foreground">
              <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-accent" /><span>We validate contact details before saving a request.</span></div>
              <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-accent" /><span>Your information is not published or shared from this page.</span></div>
              <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-accent" /><span>There is no obligation to purchase or enroll.</span></div>
            </div>
          </div>
          <Card className="rounded-3xl border-primary/10 shadow-xl shadow-primary/5">
            <CardHeader className="p-7 pb-2 md:p-9 md:pb-3"><CardTitle className="text-2xl">Request information</CardTitle></CardHeader>
            <CardContent className="p-7 pt-5 md:p-9 md:pt-6">
              {status === "success" ? (
                <div className="rounded-2xl bg-accent/10 p-8 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-accent" />
                  <h2 className="mt-4 text-2xl font-bold">Request received</h2>
                  <p className="mt-2 text-muted-foreground">{message}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {fields.map(([key, label, type]) => (
                      <div key={key} className={key === "referralSource" ? "sm:col-span-2" : ""}>
                        <Label htmlFor={key}>{label}</Label>
                        <Input id={key} type={type} required={!["currentSatTotal", "currentReadingWriting", "currentMath", "targetSatScore", "plannedTestDate"].includes(key)} value={String(form[key] || "")} onChange={(event) => update(key, event.target.value)} className="mt-2 h-11 rounded-xl" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label htmlFor="goals">Goals and explanation of requested help</Label>
                    <Textarea id="goals" required value={String(form.goals || "")} onChange={(event) => update("goals", event.target.value)} className="mt-2 min-h-28 rounded-xl" />
                  </div>
                  <div>
                    <Label htmlFor="schedulingAvailability">General scheduling availability</Label>
                    <Textarea id="schedulingAvailability" required value={String(form.schedulingAvailability || "")} onChange={(event) => update("schedulingAvailability", event.target.value)} className="mt-2 min-h-24 rounded-xl" />
                  </div>
                  <div className="space-y-3 rounded-2xl bg-muted/60 p-5 text-sm">
                    <label className="flex items-start gap-3"><input type="checkbox" required checked={Boolean(form.consentToContact)} onChange={(event) => update("consentToContact", event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span>I consent to being contacted about this request.</span></label>
                    <label className="flex items-start gap-3"><input type="checkbox" required checked={Boolean(form.privacyAcknowledged)} onChange={(event) => update("privacyAcknowledged", event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span>I acknowledge the privacy notice and understand this request is stored privately for follow-up.</span></label>
                  </div>
                  {status === "error" && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
                  <Button type="submit" disabled={status === "sending"} className="h-12 w-full rounded-full bg-gradient-brand text-white">
                    {status === "sending" ? "Sending request…" : "Send private request"} <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </PublicSiteShell>
  );
}