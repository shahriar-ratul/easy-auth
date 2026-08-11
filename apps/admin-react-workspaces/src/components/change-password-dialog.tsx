import { useState, type FormEvent } from "react";
import { AuthApiError } from "@easy-auth/auth-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setCurrentPassword("");
    setNewPassword("");
    setError(null);
    setNotice(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setNotice("Password changed. Every other session was signed out.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't change the password. Check your current password, then try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Change password" description="Every other session gets signed out — this one doesn't.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Changing…" : "Change password"}
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
