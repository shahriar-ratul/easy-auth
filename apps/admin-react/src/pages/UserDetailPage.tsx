import { type FormEvent, useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { RoleSummary, UpdateUserInput, UserSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore } from "@/stores/store-context";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
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

interface ProfileForm {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
}

function toProfileForm(user: UserSummary): ProfileForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
  };
}

export const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const authStore = useAuthStore();
  const canManageUser = ability.can(PERMISSIONS.usersManage, "permission");
  const canBlock = ability.can(PERMISSIONS.usersBlock, "permission");
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");
  const isSelf = id !== undefined && id === authStore.currentUser?.sub;

  const [user, setUser] = useState<UserSummary | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const [activePending, setActivePending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      setForm(toProfileForm(result));
      setSelectedRoles(result.roles);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id || !form) return;
    setSubmitting(true);
    try {
      const input: UpdateUserInput = {
        firstName: form.firstName.trim() === "" ? null : form.firstName,
        lastName: form.lastName.trim() === "" ? null : form.lastName,
        displayName: form.displayName.trim() === "" ? null : form.displayName,
        phone: form.phone.trim() === "" ? null : form.phone,
        username: form.username.trim() === "" ? null : form.username,
      };
      const updated = await authClient.updateUser(id, input);
      setUser(updated);
      setForm(toProfileForm(updated));
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save this profile. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhotoChange(photo: string | null) {
    if (!id) return;
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
    if (!id || !user) return;
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

  async function toggleBlocked() {
    if (!id || !user) return;
    setBlockPending(true);
    try {
      if (user.blocked) await authClient.unblockUser(id);
      else await authClient.blockUser(id);
      setUser((prev) => (prev ? { ...prev, blocked: !prev.blocked } : prev));
      toast.success(user.blocked ? "User unblocked." : "User blocked.");
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.blocked ? "unblock" : "block"} this user. Try again.`));
    } finally {
      setBlockPending(false);
    }
  }

  async function toggleActive() {
    if (!id || !user) return;
    setActivePending(true);
    try {
      if (user.isActive) await authClient.deactivateUser(id);
      else await authClient.activateUser(id);
      setUser((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(user.isActive ? "User deactivated." : "User activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.isActive ? "deactivate" : "activate"} this user. Try again.`));
    } finally {
      setActivePending(false);
    }
  }

  if (!id) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/users" className="text-sm text-muted-foreground hover:underline">
          ← Back to users
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{user?.email ?? "User"}</h1>
        <p className="text-sm text-muted-foreground">
          {user ? (
            <>
              Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"} · Created:{" "}
              {new Date(user.createdAt).toLocaleDateString()}
            </>
          ) : (
            "Profile, status, and account actions for this user."
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : user && form ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Email is the login identifier and can't be changed here.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <PhotoUpload
                  photo={user.photo}
                  fallback={initialsOf(user)}
                  disabled={!canManageUser}
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

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-email">Email</Label>
                    <Input id="user-email" value={user.email} disabled />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium leading-none">Status</span>
                    <div className="flex h-9 items-center gap-1.5">
                      <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                      {user.blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-firstName">First name</Label>
                    <Input
                      id="user-firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      disabled={!canManageUser}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-lastName">Last name</Label>
                    <Input
                      id="user-lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      disabled={!canManageUser}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-displayName">Display name</Label>
                    <Input
                      id="user-displayName"
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      disabled={!canManageUser}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-phone">Phone</Label>
                    <Input id="user-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canManageUser} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-username">Username</Label>
                    <Input
                      id="user-username"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      disabled={!canManageUser}
                    />
                  </div>
                </div>
                {canManageUser ? (
                  <Button type="submit" disabled={submitting} className="self-start">
                    {submitting ? "Saving…" : "Save changes"}
                  </Button>
                ) : null}
                </form>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {canBlock ? (
                <Button variant={user.blocked ? "outline" : "destructive"} disabled={blockPending} onClick={() => void toggleBlocked()}>
                  {user.blocked ? "Unblock user" : "Block user"}
                </Button>
              ) : null}
              {canBlock ? (
                <Button variant={user.isActive ? "destructive" : "outline"} disabled={activePending} onClick={() => void toggleActive()}>
                  {user.isActive ? "Deactivate user" : "Activate user"}
                </Button>
              ) : null}
              {canManageUser ? (
                <Button
                  variant="destructive"
                  disabled={isSelf}
                  title={isSelf ? "You can't delete your own account." : undefined}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete account
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <DeleteAccountDialog
        open={confirmingDelete}
        email={user?.email ?? ""}
        userId={id}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/users")}
      />
    </div>
  );
});

function DeleteAccountDialog({
  open,
  email,
  userId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  email: string;
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await authClient.deleteUser(userId);
      toast.success("Account deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this account. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete account"
      description={`${email || "This user"} is soft-deleted: they stop appearing in listings and can no longer sign in.`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={() => void handleDelete()}>
            {submitting ? "Deleting…" : "Delete account"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
