"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthApiError, userIdOf, type PermissionSummary, type RoleSummary, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { PermissionRequired } from "@/components/permission-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PERMISSIONS,
  ROLES_SCREEN_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  missingPermissionHint,
  type AppAbility,
} from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

const createRoleSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  displayName: z.string().optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
type CreateRoleForm = z.infer<typeof createRoleSchema>;

// `isDefault` has no field on `UpdateRoleInput` (or `CreateRoleInput`) — there's nothing to send it
// to, so no default-role toggle exists anywhere on this page.
const editRoleSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean(),
  permissions: z.array(z.string()),
});
type EditRoleForm = z.infer<typeof editRoleSchema>;

export default function RolesPage() {
  const ability = useAbility<AppAbility>();
  const canOpen = hasAnyPermission(ability, ROLES_SCREEN_PERMISSIONS);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);
  const canGrantPermissions = hasPermission(ability, PERMISSIONS.permissionsGrant);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  // The user pickers below are a convenience over `users:read`; without it you type an id.
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);

  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleName, setAssignRoleName] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantPermissionKey, setGrantPermissionKey] = useState("");

  const [createError, setCreateError] = useState<string[] | null>(null);
  const createForm = useForm<CreateRoleForm>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { slug: "", displayName: "", description: "", permissions: [] },
  });

  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [editError, setEditError] = useState<string[] | null>(null);
  const editForm = useForm<EditRoleForm>({
    resolver: zodResolver(editRoleSchema),
    defaultValues: { displayName: "", description: "", isActive: true, permissions: [] },
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleSummary | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const result = await authClient.listRoles();
      setRoles(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load roles."));
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageRoles) return;
    void loadRoles();
  }, [canManageRoles, loadRoles]);

  useEffect(() => {
    if (!canReadUsers) return;
    authClient
      .listUsers({ limit: 100 })
      .then((result) => setUsers(result.items))
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load users.")));
  }, [canReadUsers]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  if (!canOpen) return <PermissionRequired permission={ROLES_SCREEN_PERMISSIONS} what="Roles & permissions" />;

  function report(fn: () => Promise<void>) {
    return async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(apiErrorMessage(err, "That action failed. Try again."));
      }
    };
  }

  async function handleCreateRole(values: CreateRoleForm) {
    setCreateError(null);
    try {
      const role = await authClient.createRole({ slug: values.slug, displayName: values.displayName || undefined, description: values.description || undefined });
      const permissions = values.permissions ?? [];
      if (permissions.length > 0) {
        await Promise.all(permissions.map((slug) => authClient.attachPermissionToRole(role.id, slug)));
      }
      setRoles((prev) => [...prev, { ...role, permissions }]);
      createForm.reset({ slug: "", displayName: "", description: "", permissions: [] });
      toast.success(`Role "${role.name}" created.`);
    } catch (err) {
      setCreateError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't create this role. Try again."));
    }
  }

  function openEditRole(role: RoleSummary) {
    setEditingRole(role);
    setEditError(null);
    editForm.reset({ displayName: role.displayName, description: "", isActive: role.isActive, permissions: role.permissions });
  }

  async function handleUpdateRole(values: EditRoleForm) {
    if (!editingRole) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const toAttach = values.permissions.filter((slug) => !editingRole.permissions.includes(slug));
      const toDetach = editingRole.permissions.filter((slug) => !values.permissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(editingRole.id, { displayName: values.displayName, description: values.description || null, isActive: values.isActive }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(editingRole.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(editingRole.id, slug)),
      ]);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? { ...updated, permissions: values.permissions } : r)));
      setEditingRole(null);
      toast.success(`Role "${updated.name}" updated.`);
    } catch (err) {
      setEditError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't update this role. Try again."));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!deletingRole) return;
    setDeleteSaving(true);
    try {
      await authClient.deleteRole(deletingRole.id);
      setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id));
      toast.success(`Role "${deletingRole.name}" deleted.`);
      setDeletingRole(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this role. Try again."));
    } finally {
      setDeleteSaving(false);
    }
  }

  const handleAssignRole = report(async () => {
    await authClient.assignRole(assignUserId, assignRoleName);
    toast.success(`Role "${assignRoleName}" assigned.`);
  });

  const handleRevokeRole = report(async () => {
    await authClient.revokeRole(assignUserId, assignRoleName);
    toast.success(`Role "${assignRoleName}" revoked.`);
  });

  const handleGrantPermission = report(async () => {
    await authClient.grantPermission(grantUserId, grantPermissionKey);
    toast.success(`Permission "${grantPermissionKey}" granted.`);
  });

  const handleRevokePermission = report(async () => {
    await authClient.revokePermission(grantUserId, grantPermissionKey);
    toast.success(`Permission "${grantPermissionKey}" revoked.`);
  });

  function userField(id: string, value: string, onChange: (next: string) => void) {
    if (!canReadUsers) {
      return <Input id={id} required className="w-56" value={value} onChange={(e) => onChange(e.target.value)} placeholder="User ID" />;
    }
    return (
      <Select name={id} required value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-56">
          <SelectValue placeholder="Select a user…" />
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => (
            <SelectItem key={userIdOf(user)} value={userIdOf(user)}>
              {user.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const editValues = editForm.watch();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Roles & permissions", href: "/roles" }]} />

      {canManageRoles && (
        <Card>
          <CardHeader>
            <CardTitle>Create role</CardTitle>
            <CardDescription>Pick the permissions this role grants right here — you can still change them later.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...createForm}>
              <form className="flex flex-col gap-4" onSubmit={createForm.handleSubmit(handleCreateRole)}>
                <FormErrorAlert messages={createError} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input placeholder="billing-manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input placeholder="Billing manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {canReadPermissions && (
                  <FormField
                    control={createForm.control}
                    name="permissions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permissions</FormLabel>
                        <FormControl>
                          <PermissionGroupSelect permissions={permissionCatalog} selected={field.value ?? []} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button type="submit" disabled={createForm.formState.isSubmitting} className="w-fit">
                  {createForm.formState.isSubmitting ? "Creating…" : "Create role"}
                </Button>
              </form>
            </Form>

            {rolesLoading && roles.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Loading roles…</p>}

            {roles.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {roles.map((role) => (
                  <li key={role.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{role.displayName}</span>
                      <Badge variant="outline">{role.name}</Badge>
                      {role.isDefault && <Badge variant="secondary">Default</Badge>}
                      {!role.isActive && <Badge variant="destructive">Inactive</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openEditRole(role)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeletingRole(role)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assign or revoke a role</CardTitle>
          <CardDescription>Revoking a role leaves the user&apos;s direct permission grants alone.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignUserId">User</Label>
              {userField("assignUserId", assignUserId, setAssignUserId)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignRoleName">Role name</Label>
              <Input id="assignRoleName" required value={assignRoleName} onChange={(e) => setAssignRoleName(e.target.value)} placeholder="billing-manager" />
            </div>
            <Button
              type="button"
              disabled={!canAssignRoles || !assignUserId || !assignRoleName}
              title={canAssignRoles ? undefined : missingPermissionHint(PERMISSIONS.rolesAssign)}
              onClick={() => void handleAssignRole()}
            >
              Assign role
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canAssignRoles || !assignUserId || !assignRoleName}
              title={canAssignRoles ? undefined : missingPermissionHint(PERMISSIONS.rolesAssign)}
              onClick={() => void handleRevokeRole()}
            >
              Revoke role
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grant or revoke a permission directly</CardTitle>
          <CardDescription>Applied straight to the user, bypassing roles entirely.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grantUserId">User</Label>
              {userField("grantUserId", grantUserId, setGrantUserId)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grantPermissionKey">Permission key</Label>
              <Input
                id="grantPermissionKey"
                required
                value={grantPermissionKey}
                onChange={(e) => setGrantPermissionKey(e.target.value)}
                placeholder="users:read"
              />
            </div>
            <Button
              type="button"
              disabled={!canGrantPermissions || !grantUserId || !grantPermissionKey}
              title={canGrantPermissions ? undefined : missingPermissionHint(PERMISSIONS.permissionsGrant)}
              onClick={() => void handleGrantPermission()}
            >
              Grant permission
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canGrantPermissions || !grantUserId || !grantPermissionKey}
              title={canGrantPermissions ? undefined : missingPermissionHint(PERMISSIONS.permissionsGrant)}
              onClick={() => void handleRevokePermission()}
            >
              Revoke permission
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editingRole !== null} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>{editingRole?.name}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="flex flex-col gap-4" onSubmit={editForm.handleSubmit(handleUpdateRole)}>
              <FormErrorAlert messages={editError} />
              <FormField
                control={editForm.control}
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
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />
              {canReadPermissions && (
                <FormField
                  control={editForm.control}
                  name="permissions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permissions</FormLabel>
                      <FormControl>
                        <PermissionGroupSelect permissions={permissionCatalog} selected={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingRole(null)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    editSaving ||
                    (editingRole !== null &&
                      editValues.displayName === editingRole.displayName &&
                      editValues.isActive === editingRole.isActive &&
                      sameSlugs(editValues.permissions, editingRole.permissions))
                  }
                >
                  {editSaving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingRole !== null} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role {deletingRole?.name}?</DialogTitle>
            <DialogDescription>
              Existing assignments are left in place; the role simply stops being resolved or granting anything.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingRole(null)} disabled={deleteSaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteRole()} disabled={deleteSaving}>
              {deleteSaving ? "Deleting…" : "Delete role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
