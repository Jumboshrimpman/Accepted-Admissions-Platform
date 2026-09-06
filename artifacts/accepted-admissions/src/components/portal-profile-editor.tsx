import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readProfilePhotoFile } from "@/lib/profile-photo";
import { portalAvatarUrl, portalDisplayName } from "@/lib/portal-profile";

export type PortalProfileValues = {
  displayName: string;
  title: string | null;
  avatarUrl: string | null;
};

export function PortalProfileEditor({
  open,
  onOpenChange,
  profile,
  clerkName,
  clerkImageUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: PortalProfileValues;
  clerkName?: string | null;
  clerkImageUrl?: string | null;
  onSaved: (next: PortalProfileValues) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(portalDisplayName(profile.displayName, clerkName));
  const [title, setTitle] = useState(profile.title ?? "");
  const [avatarUrl, setAvatarUrl] = useState(portalAvatarUrl(profile.avatarUrl, clerkImageUrl));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDisplayName(portalDisplayName(profile.displayName, clerkName));
    setTitle(profile.title ?? "");
    setAvatarUrl(portalAvatarUrl(profile.avatarUrl, clerkImageUrl));
    setError("");
  }, [open, profile.displayName, profile.title, profile.avatarUrl, clerkName, clerkImageUrl]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setAvatarUrl(await readProfilePhotoFile(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!displayName.trim()) {
      setError("Enter the name that should appear in the portal.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await customFetch<PortalProfileValues>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          title: title.trim() || null,
          avatarUrl,
        }),
      });
      onSaved({
        displayName: saved.displayName,
        title: saved.title ?? null,
        avatarUrl: saved.avatarUrl ?? null,
      });
      onOpenChange(false);
    } catch (saveError) {
      const detail = (saveError as { data?: { error?: string } } | null)?.data?.error;
      setError(detail || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="portal-profile-editor">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update the name, title, and picture shown in the portal header.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-20 w-20 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-muted">
                <Camera className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                data-testid="portal-profile-photo-file"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                data-testid="portal-profile-photo-upload"
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Preparing…" : avatarUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {avatarUrl ? (
                <Button type="button" variant="ghost" onClick={() => setAvatarUrl(null)}>
                  Remove photo
                </Button>
              ) : null}
            </div>
          </div>
          <label className="block space-y-2">
            <Label htmlFor="portal-profile-name">Name</Label>
            <Input
              id="portal-profile-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              data-testid="portal-profile-name"
            />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="portal-profile-title">Title</Label>
            <Input
              id="portal-profile-title"
              value={title}
              placeholder="Role or title shown in the header"
              onChange={(event) => setTitle(event.target.value)}
              data-testid="portal-profile-title"
            />
          </label>
          <label className="block space-y-2">
            <Label htmlFor="portal-profile-photo">Photo URL</Label>
            <Input
              id="portal-profile-photo"
              type="url"
              value={avatarUrl?.startsWith("data:") ? "" : avatarUrl ?? ""}
              placeholder="https://"
              onChange={(event) => setAvatarUrl(event.target.value || null)}
              data-testid="portal-profile-photo"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || !displayName.trim()}
            data-testid="portal-profile-save"
          >
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
