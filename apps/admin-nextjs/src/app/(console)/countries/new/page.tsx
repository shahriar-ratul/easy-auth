"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type CreateCountryInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { countrySchema, type CountryFormValues } from "../country-schema";

export default function NewCountryPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.countriesManage);
  const router = useRouter();

  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CountryFormValues>({
    resolver: zodResolver(countrySchema),
    defaultValues: { code: "", name: "", emoji: "", phoneCode: "", currency: "", currencyName: "", isoCode: "", flag: null },
  });

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.countriesManage} what="Adding a country" />;

  async function onSubmit(values: CountryFormValues) {
    setFormError(null);
    const input: CreateCountryInput = {
      code: values.code,
      name: values.name,
      emoji: values.emoji,
      phoneCode: values.phoneCode,
      currency: values.currency,
      currencyName: values.currencyName,
      isoCode: values.isoCode,
      flag: values.flag || undefined,
    };
    try {
      const country = await authClient.createCountry(input);
      toast.success("Country created.");
      router.push(`/countries/${country.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Countries", href: "/countries" }, { title: "Add country", href: "/countries/new" }]} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add country</CardTitle>
          <CardDescription>The flag image is optional — the emoji stands in wherever no image is set.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormErrorAlert messages={formError} />
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
              <FormField
                control={form.control}
                name="flag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Flag</FormLabel>
                    <FormControl>
                      <div>
                        <PhotoUpload photo={field.value} fallback={form.watch("emoji") || "?"} onChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Input placeholder="BD" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emoji"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emoji</FormLabel>
                      <FormControl>
                        <Input placeholder="🇧🇩" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone code</FormLabel>
                      <FormControl>
                        <Input placeholder="+880" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input placeholder="BDT" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currencyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency name</FormLabel>
                      <FormControl>
                        <Input placeholder="Bangladeshi Taka" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isoCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ISO code</FormLabel>
                      <FormControl>
                        <Input placeholder="BGD" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create country"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/countries")}>
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
