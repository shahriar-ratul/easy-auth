"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type CreateLanguageInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { DIRECTION_OPTIONS, languageSchema, type LanguageFormValues } from "../language-schema";

export default function NewLanguagePage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.languagesManage);
  const router = useRouter();

  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<LanguageFormValues>({
    resolver: zodResolver(languageSchema),
    defaultValues: { code: "", name: "", nativeName: "", direction: "ltr", isDefault: false },
  });

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.languagesManage} what="Adding a language" />;

  async function onSubmit(values: LanguageFormValues) {
    setFormError(null);
    const input: CreateLanguageInput = {
      code: values.code,
      name: values.name,
      nativeName: values.nativeName,
      direction: values.direction,
      isDefault: values.isDefault,
    };
    try {
      const language = await authClient.createLanguage(input);
      toast.success("Language created.");
      router.push(`/languages/${language.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Languages", href: "/languages" }, { title: "Add language", href: "/languages/new" }]} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add language</CardTitle>
          <CardDescription>The default language is the one a new deployment's locale falls back to.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormErrorAlert messages={formError} />
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Bengali" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nativeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Native name</FormLabel>
                      <FormControl>
                        <Input placeholder="বাংলা" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input placeholder="bn" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Direction</FormLabel>
                      <FormControl>
                        <div>
                          <Combobox
                            options={DIRECTION_OPTIONS}
                            selected={field.value}
                            placeholder="Select direction"
                            onChange={(option) => field.onChange(option.value)}
                            showCreate={false}
                            popoverClassName="min-w-[250px]"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    </FormControl>
                    <FormLabel className="font-normal">Default language</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create language"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/languages")}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
