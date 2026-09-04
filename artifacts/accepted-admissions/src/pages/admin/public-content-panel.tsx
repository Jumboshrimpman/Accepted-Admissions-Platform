import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Eye } from "lucide-react";
import { ProfilePhotoFields } from "@/components/profile-photo-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { OurTeamContent, orderTeam, type TeamContent, type Tutor } from "@/pages/public/our-team";
import { PastSuccessContent, type SchoolLogo, type SuccessContent } from "@/pages/public/past-success";
import { defaultPhotoAltText } from "@/lib/profile-photo";

type TutorProfile = Tutor & {
  id: string;
  email: string;
  publicApproved: boolean;
  active: boolean;
  bookingEligible: boolean;
};

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

const emptyCreateDraft = {
  name: "",
  email: "",
  title: "Tutor",
  photoUrl: "",
  photoAltText: "",
};

export function PublicContentPanel() {
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [content, setContent] = useState<PublicContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<"team" | "success" | null>(null);
  const [createDraft, setCreateDraft] = useState(emptyCreateDraft);

  useEffect(() => {
    Promise.all([
      customFetch<TutorProfile[]>("/api/admin/tutors"),
      customFetch<PublicContent[]>("/api/admin/public-content"),
    ])
      .then(([nextTutors, nextContent]) => {
        setTutors(orderTeam(nextTutors) as TutorProfile[]);
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

  const createTutor = async () => {
    setSaving("create");
    setMessage("");
    try {
      const created = await customFetch<TutorProfile>("/api/admin/tutors", {
        method: "POST",
        body: JSON.stringify({
          name: createDraft.name.trim(),
          email: createDraft.email.trim().toLowerCase(),
          title: createDraft.title.trim() || "Tutor",
          photoUrl: createDraft.photoUrl.trim() || null,
          photoAltText:
            createDraft.photoAltText.trim() ||
            (createDraft.photoUrl.trim()
              ? defaultPhotoAltText(createDraft.name, createDraft.title)
              : null),
          publicApproved: false,
          active: true,
          bookingEligible: false,
        }),
      });
      setTutors((items) => orderTeam([...items, created]) as TutorProfile[]);
      setCreateDraft(emptyCreateDraft);
      setMessage(`${created.name} was created on file.`);
    } catch (error) {
      const detail = (error as { data?: { error?: string } } | null)?.data?.error;
      setMessage(detail || "Could not create that profile. Check the name, email, and photo fields.");
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

  const previewTutors: Tutor[] = tutors
    .filter((tutor) => tutor.active && tutor.publicApproved)
    .map(({ id, name, title, photoUrl, photoAltText, biography, subjects, linkedinUrl }) => ({
      id,
      name,
      title,
      photoUrl,
      photoAltText,
      biography,
      subjects,
      linkedinUrl,
    }));
  const teamPreview: TeamContent | null = team
    ? {
        title: team.title,
        seoTitle: team.seoTitle,
        seoDescription: team.seoDescription,
        body: { intro: team.body.intro },
      }
    : null;
  const successPreview: SuccessContent | null = success
    ? {
        title: success.title,
        seoTitle: success.seoTitle,
        seoDescription: success.seoDescription,
        body: {
          intro: success.body.intro,
          testimonial: success.body.testimonial,
          schoolLogos: success.body.schoolLogos,
        },
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Public team and student-story content</h2>
          <p className="text-sm text-muted-foreground">Edit source-approved copy and control what appears publicly. Only published records are shown on the public site.</p>
        </div>
        {message && <p role="status" className="text-sm font-medium text-primary">{message}</p>}
      </div>

      <Card className="min-w-0 border-primary/20" data-testid="create-tutor-profile">
        <CardHeader>
          <CardTitle>Create a team profile template</CardTitle>
          <CardDescription>
            Same fields as acceptedadmissions.org/our-team: name, title, and photo. Keep public approval off until the final copy is ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name on file">
              <Input
                value={createDraft.name}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="Full name"
                data-testid="create-tutor-name"
              />
            </Field>
            <Field label="Title">
              <Input
                value={createDraft.title}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, title: event.target.value }))}
                placeholder="Admissions Tutor"
                data-testid="create-tutor-title"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={createDraft.email}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, email: event.target.value }))}
                placeholder="tutor@example.com"
                data-testid="create-tutor-email"
              />
            </Field>
          </div>
          <ProfilePhotoFields
            name={createDraft.name}
            title={createDraft.title}
            photoUrl={createDraft.photoUrl || null}
            photoAltText={createDraft.photoAltText || null}
            photoTestId="create-tutor-photo"
            onPhotoUrlChange={(value) => setCreateDraft((draft) => ({ ...draft, photoUrl: value ?? "" }))}
            onPhotoAltTextChange={(value) =>
              setCreateDraft((draft) => ({ ...draft, photoAltText: value ?? "" }))
            }
          />
          <Button
            onClick={() => void createTutor()}
            disabled={saving === "create" || !createDraft.name.trim() || !createDraft.email.trim()}
            data-testid="create-tutor-submit"
          >
            {saving === "create" ? "Creating…" : "Create profile"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {tutors.map((tutor) => (
          <Card key={tutor.id} className="min-w-0">
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="break-words">{tutor.name || "Untitled profile"}</CardTitle>
                  <CardDescription>{tutor.email}</CardDescription>
                </div>
                <Badge className="shrink-0" variant={tutor.publicApproved ? "default" : "outline"}>
                  {tutor.publicApproved ? "Public" : "Draft"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <Field label="Name on file">
                <Input
                  value={tutor.name}
                  onChange={(event) => updateTutor(tutor.id, { name: event.target.value })}
                />
              </Field>
              <Field label="Title">
                <Input
                  value={tutor.title}
                  onChange={(event) => updateTutor(tutor.id, { title: event.target.value })}
                  placeholder="Admissions Tutor"
                />
              </Field>
              <ProfilePhotoFields
                name={tutor.name}
                title={tutor.title}
                photoUrl={tutor.photoUrl}
                photoAltText={tutor.photoAltText}
                onPhotoUrlChange={(value) => updateTutor(tutor.id, { photoUrl: value })}
                onPhotoAltTextChange={(value) => updateTutor(tutor.id, { photoAltText: value })}
              />
              <Field label="Biography">
                <Textarea
                  rows={6}
                  value={tutor.biography ?? ""}
                  onChange={(event) => updateTutor(tutor.id, { biography: event.target.value })}
                />
              </Field>
              <Field label="Subjects and services">
                <Input
                  value={tutor.subjects.join(", ")}
                  onChange={(event) =>
                    updateTutor(tutor.id, {
                      subjects: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="LinkedIn URL">
                <Input
                  type="url"
                  value={tutor.linkedinUrl ?? ""}
                  onChange={(event) => updateTutor(tutor.id, { linkedinUrl: event.target.value || null })}
                />
              </Field>
              <div className="flex flex-wrap gap-6 pt-2">
                <Toggle
                  label="Approved for public display"
                  checked={tutor.publicApproved}
                  onChange={(checked) => updateTutor(tutor.id, { publicApproved: checked })}
                />
                <Toggle
                  label="Active"
                  checked={tutor.active}
                  onChange={(checked) => updateTutor(tutor.id, { active: checked })}
                />
              </div>
              <Button
                onClick={() => {
                  if (tutor.photoUrl && !tutor.photoAltText?.trim()) {
                    updateTutor(tutor.id, {
                      photoAltText: defaultPhotoAltText(tutor.name, tutor.title),
                    });
                  }
                  void saveTutor({
                    ...tutor,
                    photoAltText:
                      tutor.photoAltText?.trim() ||
                      (tutor.photoUrl ? defaultPhotoAltText(tutor.name, tutor.title) : null),
                  });
                }}
                disabled={saving === tutor.id}
              >
                {saving === tutor.id ? "Saving…" : "Save team profile"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {team && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="break-words">Our Team page</CardTitle>
                <CardDescription className="break-words">These fields control the public page heading, introduction, and search preview.</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge variant={team.status === "published" ? "default" : "outline"} className="capitalize">{team.status}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreview("team")} data-testid="button-preview-our-team">
                  <Eye className="mr-2 h-4 w-4" /> Preview
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 grid gap-5 lg:grid-cols-2">
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
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="break-words">Student Stories page</CardTitle>
                <CardDescription className="break-words">Preserve the approved testimonial attribution and destination image descriptions when editing. Published examples should not be framed as guarantees.</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge variant={success.status === "published" ? "default" : "outline"} className="capitalize">{success.status}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreview("success")} data-testid="button-preview-student-stories">
                  <Eye className="mr-2 h-4 w-4" /> Preview
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 grid gap-5 lg:grid-cols-2">
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
                      type="text"
                      inputMode="url"
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
                {saving === success.slug ? "Saving…" : "Save Student Stories"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-6xl gap-0 overflow-hidden p-0">
          <DialogHeader className="min-w-0 border-b bg-card px-6 py-5 pr-12">
            <DialogTitle className="break-words">{preview === "team" ? "Our Team preview" : "Student Stories preview"}</DialogTitle>
            <DialogDescription className="break-words">
              Preview only — this uses the current editor values and does not publish or change the live page.
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 max-h-[calc(85vh-7rem)] min-w-0 overflow-x-hidden overflow-y-auto bg-background"
            data-testid="preview-scroll-area"
            aria-label="Preview content"
          >
            <div className="border-b border-dashed bg-amber-50 px-6 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              Review this administrator-only view before publishing. Images and optional content are shown exactly as the public layout will render them.
            </div>
            {preview === "team" && teamPreview && (
              <OurTeamContent tutors={previewTutors} content={teamPreview} />
            )}
            {preview === "success" && successPreview && (
              <PastSuccessContent content={successPreview} />
            )}
          </div>
        </DialogContent>
      </Dialog>
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