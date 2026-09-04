import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Camera, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function TutorProfilePage() {
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    customFetch<TutorProfile>("/api/tutor/profile")
      .then((next) => setProfile(next))
      .catch(() => setError("Your profile could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const updateField = <K extends keyof TutorProfile>(key: K, value: TutorProfile[K]) => {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const saved = await customFetch<TutorProfile>("/api/tutor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name,
          title: profile.title,
          photoUrl: profile.photoUrl,
          photoAltText: profile.photoAltText,
          biography: profile.biography,
          subjects: profile.subjects,
          linkedinUrl: profile.linkedinUrl,
        }),
      });
      setProfile(saved);
      setMessage("Your name and photo on file were saved.");
    } catch (saveError) {
      const detail = (saveError as { data?: { error?: string } } | null)?.data?.error;
      setError(detail || "Could not save your profile. Check the name and photo fields.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">
        <h2 className="text-xl font-semibold">Profile unavailable</h2>
        <p className="mt-2 text-sm">{error || "Please try again in a moment."}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-brand-ink px-6 py-8 text-white sm:px-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">
          Your profile
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Name and photo on file</h1>
        <p className="mt-2 max-w-2xl text-white/75">
          Update the name students and administrators see, and add a photo for your public profile.
        </p>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-primary" />
                Profile details
              </CardTitle>
              <CardDescription className="mt-1">{profile.email}</CardDescription>
            </div>
            <Badge variant={profile.publicApproved ? "default" : "outline"}>
              {profile.publicApproved ? "Public" : "Draft"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.photoAltText || profile.name}
                className="h-24 w-24 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <p className="max-w-sm text-sm text-muted-foreground">
              Paste an https image URL below. Use clear alt text so the photo remains accessible.
            </p>
          </div>

          <Field label="Name on file">
            <Input
              value={profile.name}
              onChange={(event) => updateField("name", event.target.value)}
              data-testid="tutor-profile-name"
            />
          </Field>
          <Field label="Title">
            <Input
              value={profile.title}
              onChange={(event) => updateField("title", event.target.value)}
            />
          </Field>
          <Field label="Photo URL">
            <Input
              type="url"
              value={profile.photoUrl ?? ""}
              onChange={(event) => updateField("photoUrl", event.target.value || null)}
              placeholder="https://"
              data-testid="tutor-profile-photo"
            />
          </Field>
          <Field label="Photo alt text">
            <Input
              value={profile.photoAltText ?? ""}
              onChange={(event) => updateField("photoAltText", event.target.value || null)}
              data-testid="tutor-profile-photo-alt"
            />
          </Field>
          <Field label="Biography">
            <Textarea
              rows={6}
              value={profile.biography ?? ""}
              onChange={(event) => updateField("biography", event.target.value || null)}
            />
          </Field>
          <Field label="Subjects and services">
            <Input
              value={profile.subjects.join(", ")}
              onChange={(event) =>
                updateField(
                  "subjects",
                  event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="LinkedIn URL">
            <Input
              type="url"
              value={profile.linkedinUrl ?? ""}
              onChange={(event) => updateField("linkedinUrl", event.target.value || null)}
            />
          </Field>

          {message ? (
            <p role="status" className="text-sm font-medium text-primary">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            onClick={() => void saveProfile()}
            disabled={saving || !profile.name.trim()}
            data-testid="tutor-profile-save"
          >
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
