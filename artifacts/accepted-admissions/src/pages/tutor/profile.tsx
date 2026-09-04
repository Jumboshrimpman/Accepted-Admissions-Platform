import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { UserRound } from "lucide-react";
import { ProfilePhotoFields } from "@/components/profile-photo-fields";
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
import { defaultPhotoAltText } from "@/lib/profile-photo";

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
    const photoAltText =
      profile.photoAltText?.trim() ||
      (profile.photoUrl ? defaultPhotoAltText(profile.name, profile.title) : null);
    try {
      const saved = await customFetch<TutorProfile>("/api/tutor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name,
          title: profile.title,
          photoUrl: profile.photoUrl,
          photoAltText,
          biography: profile.biography,
          subjects: profile.subjects,
          linkedinUrl: profile.linkedinUrl,
        }),
      });
      setProfile(saved);
      setMessage("Your name, title, and photo on file were saved.");
    } catch (saveError) {
      const detail = (saveError as { data?: { error?: string } } | null)?.data?.error;
      setError(detail || "Could not save your profile. Check the name, title, and photo fields.");
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
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Name, title, and photo on file
        </h1>
        <p className="mt-2 max-w-2xl text-white/75">
          Match the Our Team format: edit your public name and title, then upload a headshot.
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
              placeholder="Admissions Tutor"
              data-testid="tutor-profile-title"
            />
          </Field>
          <ProfilePhotoFields
            name={profile.name}
            title={profile.title}
            photoUrl={profile.photoUrl}
            photoAltText={profile.photoAltText}
            photoTestId="tutor-profile-photo"
            altTestId="tutor-profile-photo-alt"
            onPhotoUrlChange={(value) => updateField("photoUrl", value)}
            onPhotoAltTextChange={(value) => updateField("photoAltText", value)}
          />
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
