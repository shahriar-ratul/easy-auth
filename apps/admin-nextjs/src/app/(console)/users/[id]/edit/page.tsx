"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type RoleSummary, type UpdateUserInput, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { editUserSchema, type EditUserFormValues } from "../../user-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(user: UserSummary): EditUserFormValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
    photo: user.photo,
    roles: user.roles,
  };
}

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { firstName: "", lastName: "", displayName: "", phone: "", username: "", photo: null, roles: [] },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      form.reset(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
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

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.usersManage} what="Editing a user" />;

  async function onSubmit(values: EditUserFormValues) {
    if (!user) return;
    setFormError(null);
    const input: UpdateUserInput = {
      firstName: values.firstName || null,
      lastName: values.lastName || null,
      displayName: values.displayName || null,
      phone: values.phone || null,
      username: values.username || null,
      photo: values.photo || null,
    };
    // No bulk "set roles" endpoint — diffs against the roles loaded at mount and assigns/revokes only the delta.
    const selectedRoles = values.roles ?? [];
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    try {
      await Promise.all([
        authClient.updateUser(id, input),
        ...toAssign.map((slug) => authClient.assignRole(id, slug)),
        ...toRevoke.map((slug) => authClient.revokeRole(id, slug)),
      ]);
      toast.success("User updated.");
      router.push(`/users/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { title: "Users", href: "/users" },
          { title: user?.email ?? "Details", href: `/users/${id}` },
          { title: "Edit", href: `/users/${id}/edit` },
        ]}
      />

      {loading && !user && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Edit {user.email}</CardTitle>
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
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input {...field} />
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

                  {canReadRoles && (
                    <FormField
                      control={form.control}
                      name="roles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Roles</FormLabel>
                          <FormControl>
                            <div>
                              <RoleMultiSelect roles={roleCatalog} selected={field.value ?? []} onChange={field.onChange} disabled={!canAssignRoles} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push(`/users/${id}`)}>
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
