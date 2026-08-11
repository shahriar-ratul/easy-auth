import { useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.85;

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
 */
export function PhotoUpload({
  photo,
  fallback,
  onChange,
  disabled,
}: {
  photo: string | null;
  fallback: string;
  onChange: (photo: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const dataUri = await resizeToDataUri(file);
      await onChange(dataUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process this image.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
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

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {photo && <AvatarImage src={photo} alt="" />}
        <AvatarFallback className="text-base">{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : "Upload photo"}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={handleRemove}>
              <XIcon />
              Remove
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
