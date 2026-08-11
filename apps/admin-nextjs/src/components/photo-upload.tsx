"use client";

import { useCallback, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { UploadIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.85;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB, matching the reference's dropzone limit

/** Resizes to fit within MAX_DIMENSION and re-encodes as JPEG, so a phone photo doesn't land in the database as a multi-megabyte data URI. */
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read this image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas is not supported in this browser."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Stores the photo as a data URI directly on the `photo` column — there is no object-storage
 * service in this stack, and a small resized JPEG (see MAX_DIMENSION) keeps the row a reasonable
 * size. Swap this for an upload-to-a-bucket-then-store-the-URL flow if the deployment adds one.
 *
 * Built on `react-dropzone` (2MB, image/* only) with the reference's accepted-preview /
 * rejected-files-list shape, condensed into one control instead of the reference's two separate
 * sections — this app attaches the photo straight to the record instead of deferring it to a
 * multipart form submit.
 */
export function PhotoUpload({
  photo,
  fallback,
  onChange,
  disabled,
}: {
  photo: string | null | undefined;
  fallback: string;
  onChange: (photo: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<FileRejection[]>([]);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      setRejected(rejections);
      const file = accepted[0];
      if (!file) return;
      setError(null);
      setBusy(true);
      resizeToDataUri(file)
        .then((dataUri) => onChange(dataUri))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't process this image."))
        .finally(() => setBusy(false));
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    disabled: disabled || busy,
    accept: { "image/*": [] },
    maxSize: MAX_FILE_BYTES,
  });

  async function handleRemove(event: React.MouseEvent) {
    event.stopPropagation();
    setError(null);
    setBusy(true);
    try {
      await onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  function removeRejected(name: string) {
    setRejected((prev) => prev.filter(({ file }) => file.name !== name));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
          isDragActive ? "border-primary bg-muted" : "border-border",
        )}
      >
        <input {...getInputProps()} />
        <Avatar className="size-16 shrink-0">
          {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
          <AvatarFallback className="text-base">{fallback}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <UploadIcon className="size-4" />
            {busy ? "Uploading…" : isDragActive ? "Drop to upload" : "Click or drag an image here"}
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG up to 2MB</p>
        </div>
        {photo && !disabled && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={busy} onClick={handleRemove}>
            <XIcon />
            Remove
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rejected.map(({ file, errors }) => (
            <li key={file.name} className="flex items-start justify-between gap-2 text-xs">
              <div>
                <span className="font-medium">{file.name}</span>
                <ul className="text-destructive">
                  {errors.map((e) => (
                    <li key={e.code}>{e.message}</li>
                  ))}
                </ul>
              </div>
              <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => removeRejected(file.name)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
