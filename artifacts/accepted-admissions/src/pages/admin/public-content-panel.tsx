import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type TutorProfile = {
  id: string;
  email: string;
  name: string;
  title: string;
  photoUrl: string | null;
  photoAltText: string | null;
  biography: string | null;
  subjects: string[];
  linkedinUrl: string | null;
  publicApproved: boolean;
  active: boolean;
  bookingEligible: boolean;
};

type SchoolLogo = { name: string; src: string; alt: string };

type PublicContent = {
  id: string;
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  status: "draft" | "published" | "archived";
  body: {
    intro?: string;
    testimonial?: {
      quote?: string;
      attribution?: string;
      attributionMode?: "named" | "anonymous";
    };
    schoolLogos?: SchoolLogo[];
  };
};

export function PublicContentPanel() {
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [content, setContent] = useState<PublicContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      customFetch<TutorProfile[]>("/api/admin/tutors"),
      customFetch<PublicContent[]>("/api/admin/public-content"),
    ])
      .then(([nextTutors, nextContent]) => {
        setTutors(nextTutors);
        setContent(nextContent);
      })
      .catch(() => setMessage("Public content could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const updateTutor = (id: string, patch: Partial<TutorProfile>) => {
    setTutors((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const saveTutor = async (tutor: TutorProfile) => {
    setSaving(tutor.id);
    setMessage("");
    try {
      const saved = await customFetch<TutorProfile>(`/api/admin/tutors/${tutor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: tutor.name,
          title: tutor.title,
          photoUrl: tutor.photoUrl,
          photoAltText: tutor.photoAltText,
          biography: tutor.biography,
          subjects: tutor.subjects,
          linkedinUrl: tutor.linkedinUrl,
          publicApproved: tutor.publicApproved,
          active: tutor.active,
          bookingEligible: tutor.bookingEligible,
        }),
      });
      updateTutor(saved.id, saved);
      setMessage(`${saved.name} was saved.`);
    } catch (error) {
      const detail = (error as { data?: { error?: string } } | null)?.data?.error;
      setMessage(detail || `Could not save ${tutor.name}. Check the public profile fields and try again.`);
    } finally {
      setSaving(null);
    }
  };

  const updateContent = (slug: string, patch: Partial<PublicContent>) => {
    setContent((items) => items.map((item) => item.slug === slug ? { ...item, ...patch } : item));
  };

  const saveContent = async (record: PublicContent) => {
    setSaving(record.slug);
    setMessage("");
    try {
      const saved = await customFetch<PublicContent>(`/api/admin/public-content/${record.slug}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: record.title,
          seoTitle: record.seoTitle,
          seoDescription: record.seoDescription,
          body: record.body,
          status: record.status,
        }),
      });
      updateContent(saved.slug, saved);
      setMessage(`${saved.title} was saved.`);
    } catch (error) {
      const detail = (error as { data?: { error?: string } } | null)?.data?.error;
      setMessage(detail || `Could not save ${record.title}. Check the publication fields and try again.`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading public content…</p>;
  }

  const success = content.find((item) => item.slug === "past-success");
  const team = content.find((item) => item.slug === "our-team");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Public team & success content</h2>
          <p className="text-sm text-muted-foreground">Edit source-approved copy and control what appears publicly without changing page code.</p>
        </div>
        {message && <p role="status" className="text-sm font-medium text-primary">{message}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {tutors.map((tutor) => (
          <Card key={tutor.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{tutor.name}</CardTitle>
                  <CardDescription>{tutor.email}</CardDescription>
                </div>
                <Badge variant={tutor.publicApproved ? "default" : "outline"}>
                  {tutor.publicApproved ? "Public" : "Draft"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Public name"><Input value={tutor.name} onChange={(event) => updateTutor(tutor.id, { name: event.target.value })} /></Field>
              <Field label="Title"><Input value={tutor.title} onChange={(event) => updateTutor(tutor.id, { title: event.target.value })} /></Field>
              <Field label="Biography"><Textarea rows={6} value={tutor.biography ?? ""} onChange={(event) => updateTutor(tutor.id, { biography: event.target.value })} /></Field>
              <Field label="Subjects and services"><Input value={tutor.subjects.join(", ")} onChange={(event) => updateTutor(tutor.id, { subjects: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
              <Field label="Headshot URL"><Input type="url" value={tutor.photoUrl ?? ""} onChange={(event) => updateTutor(tutor.id, { photoUrl: event.target.value || null })} /></Field>
              <Field label="Headshot alt text"><Input value={tutor.photoAltText ?? ""} onChange={(event) => updateTutor(tutor.id, { photoAltText: event.target.value || null })} /></Field>
              <Field label="LinkedIn URL"><Input type="url" value={tutor.linkedinUrl ?? ""} onChange={(event) => updateTutor(tutor.id, { linkedinUrl: event.target.value || null })} /></Field>
              <div className="flex flex-wrap gap-6 pt-2">
                <Toggle label="Approved for public display" checked={tutor.publicApproved} onChange={(checked) => updateTutor(tutor.id, { publicApproved: checked })} />
                <Toggle label="Active" checked={tutor.active} onChange={(checked) => updateTutor(tutor.id, { active: checked })} />
              </div>
              <Button onClick={() => void saveTutor(tutor)} disabled={saving === tutor.id}>
                {saving === tutor.id ? "Saving…" : "Save team profile"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {team && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Our Team page</CardTitle>
                <CardDescription>These fields control the public page heading, introduction, and search preview.</CardDescription>
              </div>
              <Badge variant={team.status === "published" ? "default" : "outline"} className="capitalize">{team.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <Field label="Page title"><Input maxLength={120} value={team.title} onChange={(event) => updateContent(team.slug, { title: event.target.value })} /></Field>
            <Field label="SEO title"><Input maxLength={70} value={team.seoTitle ?? ""} onChange={(event) => updateContent(team.slug, { seoTitle: event.target.value })} /></Field>
            <Field label="SEO description"><Textarea maxLength={180} rows={3} value={team.seoDescription ?? ""} onChange={(event) => updateContent(team.slug, { seoDescription: event.target.value })} /></Field>
            <Field label="Introductory copy"><Textarea rows={5} value={team.body.intro ?? ""} onChange={(event) => updateContent(team.slug, { body: { ...team.body, intro: event.target.value } })} /></Field>
            <div className="flex flex-wrap items-center gap-4 lg:col-span-2">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={team.status === "published"} onChange={(event) => updateContent(team.slug, { status: event.target.checked ? "published" : "draft" })} />
                Approved and published
              </label>
              <Button onClick={() => void saveContent(team)} disabled={saving === team.slug}>
                {saving === team.slug ? "Saving…" : "Save Our Team"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Past Success page</CardTitle>
                <CardDescription>Preserve the approved testimonial attribution and school image descriptions when editing.</CardDescription>
              </div>
              <Badge variant={success.status === "published" ? "default" : "outline"} className="capitalize">{success.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Page title"><Input maxLength={120} value={success.title} onChange={(event) => updateContent(success.slug, { title: event.target.value })} /></Field>
              <Field label="SEO title"><Input maxLength={70} value={success.seoTitle ?? ""} onChange={(event) => updateContent(success.slug, { seoTitle: event.target.value })} /></Field>
              <Field label="SEO description"><Textarea maxLength={180} rows={3} value={success.seoDescription ?? ""} onChange={(event) => updateContent(success.slug, { seoDescription: event.target.value })} /></Field>
              <Field label="Introductory copy"><Textarea rows={5} value={success.body.intro ?? ""} onChange={(event) => updateContent(success.slug, { body: { ...success.body, intro: event.target.value } })} /></Field>
            </div>
            <div className="space-y-4">
              <Field label="Testimonial"><Textarea rows={6} value={success.body.testimonial?.quote ?? ""} onChange={(event) => updateContent(success.slug, { body: { ...success.body, testimonial: { ...success.body.testimonial, quote: event.target.value } } })} /></Field>
              <Field label="Attribution"><Input value={success.body.testimonial?.attribution ?? ""} onChange={(event) => updateContent(success.slug, { body: { ...success.body, testimonial: { ...success.body.testimonial, attribution: event.target.value } } })} /></Field>
              <Field label="Attribution display">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={success.body.testimonial?.attributionMode ?? "anonymous"}
                  onChange={(event) => updateContent(success.slug, { body: { ...success.body, testimonial: { ...success.body.testimonial, attributionMode: event.target.value as "named" | "anonymous" } } })}
                >
                  <option value="named">Show approved name</option>
                  <option value="anonymous">Keep attribution anonymous</option>
                </select>
              </Field>
              <div className="space-y-3">
                <Label>School logos and alt text</Label>
                {(success.body.schoolLogos ?? []).map((logo, index) => (
                  <div key={`${logo.name}-${index}`} className="space-y-2 rounded-xl border p-3">
                    <Input
                      aria-label={`School ${index + 1} name`}
                      value={logo.name}
                      onChange={(event) => {
                        const schoolLogos = [...(success.body.schoolLogos ?? [])];
                        schoolLogos[index] = { ...logo, name: event.target.value };
                        updateContent(success.slug, { body: { ...success.body, schoolLogos } });
                      }}
                    />
                    <Input
                      aria-label={`${logo.name} image URL`}
                      type="url"
                      value={logo.src}
                      onChange={(event) => {
                        const schoolLogos = [...(success.body.schoolLogos ?? [])];
                        schoolLogos[index] = { ...logo, src: event.target.value };
                        updateContent(success.slug, { body: { ...success.body, schoolLogos } });
                      }}
                    />
                    <Input
                      aria-label={`${logo.name} alt text`}
                      value={logo.alt}
                      onChange={(event) => {
                        const schoolLogos = [...(success.body.schoolLogos ?? [])];
                        schoolLogos[index] = { ...logo, alt: event.target.value };
                        updateContent(success.slug, { body: { ...success.body, schoolLogos } });
                      }}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={success.status === "published"} onChange={(event) => updateContent(success.slug, { status: event.target.checked ? "published" : "draft" })} />
                Approved and published
              </label>
              <Button onClick={() => void saveContent(success)} disabled={saving === success.slug}>
                {saving === success.slug ? "Saving…" : "Save Past Success"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label>{label}</Label>
    </div>
  );
}