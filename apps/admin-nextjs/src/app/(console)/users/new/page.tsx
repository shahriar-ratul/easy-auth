"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { userIdOf, type CreateUserInput, type RoleSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { createUserSchema, type CreateUserFormValues } from "../user-schema";

export default function NewUserPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const router = useRouter();

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      displayName: "",
      phone: "",
      username: "",
      photo: null,
      roles: [],
    },
  });

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoles)
      .catch((err) => toast.error(errorMessage(err)));
  }, [canReadRoles]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.usersManage} what="Adding a user" />;

  async function onSubmit(values: CreateUserFormValues) {
    setFormError(null);
    // `CreateUserInput`'s optional fields are plain `string | undefined` — an empty string would
    // be sent as a real value, so blanks are dropped rather than forwarded.
    const roleSlugs = canReadRoles
      ? (values.roles ?? [])
      : manualRoles
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean);
    const input: CreateUserInput = {
      email: values.email,
      password: values.password,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      displayName: values.displayName || undefined,
      phone: values.phone || undefined,
      username: values.username || undefined,
      photo: values.photo || undefined,
      roles: roleSlugs.length > 0 ? roleSlugs : undefined,
    };
    try {
      const user = await authClient.createUser(input);
      toast.success("User created.");
      router.push(`/users/${userIdOf(user)}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }, { title: "Add user", href: "/users/new" }]} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>No invitation email — the account is usable immediately with the password set here.</CardDescription>
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
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

                {canReadRoles ? (
                  <FormField
                    control={form.control}
                    name="roles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Roles</FormLabel>
                        <FormControl>
                          <div>
                            <RoleMultiSelect roles={roles} selected={field.value ?? []} onChange={field.onChange} />
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="roles">Roles</Label>
                    <Input id="roles" value={manualRoles} onChange={(e) => setManualRoles(e.target.value)} placeholder="admin, member" />
                    <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create user"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/users")}>
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
