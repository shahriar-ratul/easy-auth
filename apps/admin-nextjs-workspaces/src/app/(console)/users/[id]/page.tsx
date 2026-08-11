"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type RoleSummary, type UpdateUserInput, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

type ProfileForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
};

function toForm(user: UserSummary): ProfileForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
  };
}

/** Empty string means "clear the field" (`null`), matching `UpdateUserInput`'s nullable fields. */
function toInput(form: ProfileForm): UpdateUserInput {
  return {
    firstName: form.firstName || null,
    lastName: form.lastName || null,
    displayName: form.displayName || null,
    phone: form.phone || null,
    username: form.username || null,
  };
}

function initialsOf(user: UserSummary): string {
  const from = user.displayName || user.email;
  return (
    from
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const authStore = useAuthStore();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const canRead = hasPermission(ability, PERMISSIONS.usersRead);
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canBlock = hasPermission(ability, PERMISSIONS.usersBlock);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);

  const [user, setUser] = useState<UserSummary | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      setForm(toForm(result));
      setSelectedRoles(result.roles);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Membership is workspace-scoped, same reasoning as the users list's `activeWorkspaceId`
  // dependency: switching workspace has to re-fetch rather than leave the previous workspace's
  // user on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  useEffect(() => {
    if (!canReadRoles || !activeWorkspaceId) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles, activeWorkspaceId]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.usersRead} what="User details" />;

  const isSelf = authStore.currentUser?.sub === id;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await authClient.updateUser(id, toInput(form));
      setUser(updated);
      setForm(toForm(updated));
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save this profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(photo: string | null) {
    try {
      const updated = await authClient.updateUser(id, { photo });
      setUser(updated);
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  /** No bulk "set roles" endpoint — diffs against the loaded roles and assigns/revokes only the delta. */
  async function handleSaveRoles() {
    if (!user) return;
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    if (toAssign.length === 0 && toRevoke.length === 0) return;
    setSavingRoles(true);
    try {
      await Promise.all([...toAssign.map((slug) => authClient.assignRole(id, slug)), ...toRevoke.map((slug) => authClient.revokeRole(id, slug))]);
      setUser((prev) => (prev ? { ...prev, roles: selectedRoles } : prev));
      toast.success("Roles updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update roles. Try again."));
      setSelectedRoles(user.roles);
    } finally {
      setSavingRoles(false);
    }
  }

  async function toggleBlock() {
    if (!user) return;
    try {
      if (user.blocked) await authClient.unblockUser(id);
      else await authClient.blockUser(id);
      setUser((prev) => (prev ? { ...prev, blocked: !prev.blocked } : prev));
      toast.success(user.blocked ? "User unblocked." : "User blocked.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this user's status. Try again."));
    }
  }

  async function toggleActive() {
    if (!user) return;
    try {
      if (user.isActive) await authClient.deactivateUser(id);
      else await authClient.activateUser(id);
      setUser((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(user.isActive ? "User deactivated." : "User activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this user's status. Try again."));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteUser(id);
      toast.success("Account deleted.");
      router.push("/users");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this account. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loading && !user && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && form && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{user.email}</CardTitle>
                <CardDescription>
                  Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"} · Created:{" "}
                  {new Date(user.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-1.5">
                <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                {user.blocked && <Badge variant="destructive">Blocked</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PhotoUpload
                photo={user.photo}
                fallback={initialsOf(user)}
                disabled={!canManage}
                onChange={handlePhotoChange}
              />

              <div className="flex flex-col gap-1.5">
                <Label>Roles</Label>
                {canReadRoles ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="max-w-xs flex-1">
                      <RoleMultiSelect roles={roleCatalog} selected={selectedRoles} onChange={setSelectedRoles} disabled={!canAssignRoles} />
                    </div>
                    {canAssignRoles && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingRoles || JSON.stringify([...selectedRoles].sort()) === JSON.stringify([...user.roles].sort())}
                        onClick={() => void handleSaveRoles()}
                      >
                        {savingRoles ? "Saving…" : "Save roles"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                    {user.roles.map((role) => (
                      <Badge key={role} variant="outline">
                        {role}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    disabled={!canManage}
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    disabled={!canManage}
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    disabled={!canManage}
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    disabled={!canManage}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" disabled={!canManage} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={!canManage || saving} title={canManage ? undefined : missingPermissionHint(PERMISSIONS.usersManage)}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={user.blocked ? "outline" : "destructive"}
                disabled={!canBlock}
                title={canBlock ? undefined : missingPermissionHint(PERMISSIONS.usersBlock)}
                onClick={() => void toggleBlock()}
              >
                {user.blocked ? "Unblock" : "Block"}
              </Button>

              <Button
                variant={user.isActive ? "destructive" : "outline"}
                disabled={!canBlock}
                title={canBlock ? undefined : missingPermissionHint(PERMISSIONS.usersBlock)}
                onClick={() => void toggleActive()}
              >
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={!canManage || isSelf}
                    title={
                      isSelf
                        ? "You cannot delete your own account."
                        : canManage
                          ? undefined
                          : missingPermissionHint(PERMISSIONS.usersManage)
                    }
                  >
                    Delete account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {user.email}?</DialogTitle>
                    <DialogDescription>
                      This soft-deletes the account: it stops appearing in listings and can no longer sign in, but the row is kept for
                      audit purposes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete account"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
});

export default UserDetailPage;
