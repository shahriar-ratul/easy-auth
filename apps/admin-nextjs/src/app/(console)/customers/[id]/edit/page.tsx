"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type CustomerSummary, type UpdateCustomerInput } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS, editCustomerSchema, type EditCustomerFormValues } from "../../customer-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(customer: CustomerSummary): EditCustomerFormValues {
  return {
    email: customer.email,
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    username: customer.username ?? "",
    phone: customer.phone ?? "",
    dob: customer.dob ? new Date(customer.dob) : undefined,
    gender: customer.gender ?? "",
    joinedDate: customer.joinedDate ? new Date(customer.joinedDate) : undefined,
    photo: customer.photo,
  };
}

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<EditCustomerFormValues>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: { email: "", firstName: "", lastName: "", username: "", phone: "", dob: undefined, gender: "", joinedDate: undefined, photo: null },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getCustomer(id);
      setCustomer(result);
      form.reset(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this customer."));
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

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.customersManage} what="Editing a customer" />;

  async function onSubmit(values: EditCustomerFormValues) {
    if (!customer) return;
    setFormError(null);
    // `joinedDate` is not nullable on update, so a cleared picker just leaves it unchanged.
    const input: UpdateCustomerInput = {
      email: values.email,
      firstName: values.firstName || null,
      lastName: values.lastName || null,
      username: values.username || null,
      phone: values.phone || null,
      dob: values.dob ? format(values.dob, "yyyy-MM-dd") : null,
      gender: values.gender || null,
      joinedDate: values.joinedDate ? format(values.joinedDate, "yyyy-MM-dd") : undefined,
      photo: values.photo || null,
    };
    try {
      await authClient.updateCustomer(id, input);
      toast.success("Customer updated.");
      router.push(`/customers/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { title: "Customers", href: "/customers" },
          { title: customer?.email ?? "Details", href: `/customers/${id}` },
          { title: "Edit", href: `/customers/${id}/edit` },
        ]}
      />

      {loading && !customer && <p className="text-sm text-muted-foreground">Loading…</p>}

      {customer && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Edit {customer.email}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormErrorAlert messages={formError} />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="photo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo</FormLabel>
                      <FormControl>
                        <div>
                          <PhotoUpload photo={field.value} fallback="?" onChange={field.onChange} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <FormControl>
                          <div>
                            <Combobox
                              options={GENDER_OPTIONS}
                              selected={field.value ?? ""}
                              placeholder="Select gender"
                              onChange={(option) => field.onChange(option.value)}
                              showCreate={false}
                              popoverClassName="min-w-[200px]"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dob"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of birth</FormLabel>
                        <FormControl>
                          <div>
                            <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick a date" displayFormat="dd-MM-yyyy" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="joinedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joined date</FormLabel>
                        <FormControl>
                          <div>
                            <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick a date" displayFormat="dd-MM-yyyy" />
                          </div>
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
                  <Button type="button" variant="outline" onClick={() => router.push(`/customers/${id}`)}>
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
