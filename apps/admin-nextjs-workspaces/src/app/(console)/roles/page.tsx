"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, userIdOf, type RoleSummary, type UpdateRoleInput, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PermissionRequired } from "@/components/permission-required";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useWorkspaceStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export default observer(function RolesPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";
  const canOpen = hasAnyPermission(ability, ROLES_SCREEN_PERMISSIONS);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);
  const canGrantPermissions = hasPermission(ability, PERMISSIONS.permissionsGrant);
  // The user pickers below are a convenience over `users:read`; without it you type an id.
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [roleName, setRoleName] = useState("");
  const [attachRoleId, setAttachRoleId] = useState("");
  const [attachPermission, setAttachPermission] = useState("");

  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleName, setAssignRoleName] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantPermissionKey, setGrantPermissionKey] = useState("");

  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [editForm, setEditForm] = useState<UpdateRoleInput>({});
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

  // Roles are per-workspace — `Role` is unique per [workspace, name] — so switching the active
  // workspace has to re-fetch rather than leave the previous one's roles on screen, same as the
  // users page's `activeWorkspaceId` dependency.
  useEffect(() => {
    if (!canManageRoles || !activeWorkspaceId) return;
    void loadRoles();
  }, [canManageRoles, activeWorkspaceId, loadRoles]);

  useEffect(() => {
    if (!canReadUsers || !activeWorkspaceId) return;
    authClient
      .listUsers({ limit: 100 })
      .then((result) => setUsers(result.items))
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load users.")));
  }, [canReadUsers, activeWorkspaceId]);

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

  const handleCreateRole = report(async () => {
    const role = await authClient.createRole({ slug: roleName });
    setRoles((prev) => [...prev, role]);
    setRoleName("");
    toast.success(`Role "${role.name}" created.`);
  });

  function openEditRole(role: RoleSummary) {
    setEditingRole(role);
    setEditForm({ displayName: role.displayName, description: undefined, isActive: role.isActive });
  }

  async function handleUpdateRole() {
    if (!editingRole) return;
    setEditSaving(true);
    try {
      const updated = await authClient.updateRole(editingRole.id, editForm);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingRole(null);
      toast.success(`Role "${updated.name}" updated.`);
    } catch (err) {
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

  const handleAttachPermission = report(async () => {
    await authClient.attachPermissionToRole(attachRoleId, attachPermission);
    toast.success(`Permission "${attachPermission}" attached to the role.`);
    setAttachPermission("");
  });

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

  return (
    <div className="flex flex-col gap-4">
      {canManageRoles && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create role</CardTitle>
              <CardDescription>
                Roles belong to {workspaceName}. A new one carries no permissions until you attach some below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateRole();
                }}
              >
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="roleName">Role name</Label>
                  <Input id="roleName" required value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="billing-manager" />
                </div>
                <Button type="submit">Create role</Button>
              </form>

              {rolesLoading && roles.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Loading roles…</p>}

              {roles.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {roles.map((role) => (
                    <li key={role.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{role.displayName}</span>
                        <Badge variant="outline">{role.name}</Badge>
                        {role.isDefault && <Badge variant="secondary">Default</Badge>}
                        {!role.isActive && <Badge variant="destructive">Inactive</Badge>}
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

          <Card>
            <CardHeader>
              <CardTitle>Attach permission to role</CardTitle>
              <CardDescription>Everyone holding the role gets the permission.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAttachPermission();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="attachRoleId">Role</Label>
                  <Select name="attachRoleId" required value={attachRoleId} onValueChange={setAttachRoleId}>
                    <SelectTrigger id="attachRoleId" className="w-48">
                      <SelectValue placeholder="Select a role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="attachPermission">Permission key</Label>
                  <Input
                    id="attachPermission"
                    required
                    value={attachPermission}
                    onChange={(e) => setAttachPermission(e.target.value)}
                    placeholder="audit-log:read"
                  />
                </div>
                <Button type="submit" disabled={!attachRoleId}>
                  Attach permission
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
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
          <CardDescription>Applied straight to the member, bypassing roles entirely. Scoped to {workspaceName}.</CardDescription>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>{editingRole?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editDisplayName">Display name</Label>
              <Input
                id="editDisplayName"
                value={editForm.displayName ?? ""}
                onChange={(e) => setEditForm((prev) => ({ ...prev, displayName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editDescription">Description</Label>
              <Input
                id="editDescription"
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="editIsActive"
                type="checkbox"
                checked={editForm.isActive ?? true}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              <Label htmlFor="editIsActive">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRole(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={() => void handleUpdateRole()} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
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
});
