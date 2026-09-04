import { useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultPhotoAltText,
  readProfilePhotoFile,
} from "@/lib/profile-photo";

export function ProfilePhotoFields({
  name,
  title,
  photoUrl,
  photoAltText,
  onPhotoUrlChange,
  onPhotoAltTextChange,
  nameTestId,
  photoTestId,
  altTestId,
}: {
  name: string;
  title: string;
  photoUrl: string | null;
  photoAltText: string | null;
  onPhotoUrlChange: (value: string | null) => void;
  onPhotoAltTextChange: (value: string | null) => void;
  nameTestId?: string;
  photoTestId?: string;
  altTestId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const dataUrl = await readProfilePhotoFile(file);
      onPhotoUrlChange(dataUrl);
      if (!photoAltText?.trim()) {
        onPhotoAltTextChange(defaultPhotoAltText(name, title));
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAltText || name || "Profile photo preview"}
            className="h-24 w-24 rounded-full border object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            data-testid={photoTestId ? `${photoTestId}-file` : undefined}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            data-testid={photoTestId ? `${photoTestId}-upload` : undefined}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Preparing…" : photoUrl ? "Replace photo" : "Upload photo"}
          </Button>
          {photoUrl ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onPhotoUrlChange(null)}
            >
              Remove photo
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Upload a headshot, or paste an https image URL below. Images are compressed for storage.
          </p>
          {uploadError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {uploadError}
            </p>
          ) : null}
        </div>
      </div>

      <label className="block space-y-2">
        <Label>Photo URL (optional if you uploaded a file)</Label>
        <Input
          type="url"
          value={photoUrl?.startsWith("data:") ? "" : photoUrl ?? ""}
          placeholder="https://"
          data-testid={photoTestId}
          onChange={(event) => onPhotoUrlChange(event.target.value || null)}
        />
        {photoUrl?.startsWith("data:") ? (
          <p className="text-xs text-muted-foreground">Using the uploaded photo file.</p>
        ) : null}
      </label>

      <label className="block space-y-2">
        <Label>Photo alt text</Label>
        <Input
          value={photoAltText ?? ""}
          placeholder={defaultPhotoAltText(name, title)}
          data-testid={altTestId ?? nameTestId}
          onChange={(event) => onPhotoAltTextChange(event.target.value || null)}
        />
      </label>
    </div>
  );
}
