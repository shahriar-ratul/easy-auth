"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { FormErrorAlert } from "@/components/form-error-alert";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

const emptyValues: ChangePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

function PasswordField({
  control,
  name,
  label,
}: {
  control: Control<ChangePasswordValues>;
  name: keyof ChangePasswordValues;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <Input type={visible ? "text" : "password"} className="pr-9" {...field} />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyValues,
  });

  function reset() {
    form.reset(emptyValues);
    setNotice(null);
    setSubmitError(null);
  }

  async function handleSubmit(values: ChangePasswordValues) {
    setSubmitError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await authClient.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setNotice("Password changed. Every other session was signed out.");
      form.reset(emptyValues);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Every other session gets signed out — this one doesn&apos;t.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
            <FormErrorAlert messages={submitError ? errorMessages(submitError) : null} />
            {notice && <Alert variant="success">{notice}</Alert>}
            <PasswordField control={form.control} name="currentPassword" label="Current password" />
            <PasswordField control={form.control} name="newPassword" label="New password" />
            <PasswordField control={form.control} name="confirmPassword" label="Confirm new password" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Changing…" : "Change password"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
