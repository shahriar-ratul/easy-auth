"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type CountrySummary, type UpdateCountryInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { countrySchema, type CountryFormValues } from "../../country-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(country: CountrySummary): CountryFormValues {
  return {
    code: country.code,
    name: country.name,
    emoji: country.emoji,
    phoneCode: country.phoneCode,
    currency: country.currency,
    currencyName: country.currencyName,
    isoCode: country.isoCode,
    flag: country.flag,
  };
}

export default function EditCountryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.countriesManage);

  const [country, setCountry] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CountryFormValues>({
    resolver: zodResolver(countrySchema),
    defaultValues: { code: "", name: "", emoji: "", phoneCode: "", currency: "", currencyName: "", isoCode: "", flag: null },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getCountry(id);
      setCountry(result);
      form.reset(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this country."));
    } finally {
      setLoading(false);
    }
    // `form` is stable across renders (react-hook-form memoizes it), so it's safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canManage) return;
    void load();
  }, [canManage, load]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.countriesManage} what="Editing a country" />;

  async function onSubmit(values: CountryFormValues) {
    if (!country) return;
    setFormError(null);
    const input: UpdateCountryInput = {
      code: values.code,
      name: values.name,
      emoji: values.emoji,
      phoneCode: values.phoneCode,
      currency: values.currency,
      currencyName: values.currencyName,
      isoCode: values.isoCode,
      flag: values.flag || null,
    };
    try {
      await authClient.updateCountry(id, input);
      toast.success("Country updated.");
      router.push(`/countries/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { title: "Countries", href: "/countries" },
          { title: country?.name ?? "Details", href: `/countries/${id}` },
          { title: "Edit", href: `/countries/${id}/edit` },
        ]}
      />

      {loading && !country && <p className="text-sm text-muted-foreground">Loading…</p>}

      {country && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Edit {country.name}</CardTitle>
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
                          <Input {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push(`/countries/${id}`)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
