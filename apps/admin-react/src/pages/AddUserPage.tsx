import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateUserInput, RoleSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

const emptyForm = { email: "", password: "", firstName: "", lastName: "", displayName: "", phone: "", username: "" };

export function AddUserPage() {
  const navigate = useNavigate();
  const ability = useAbility();
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");

  const [form, setForm] = useState(emptyForm);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoles)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const roleSlugs = canReadRoles
        ? selectedRoles
        : manualRoles
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);
      const input: CreateUserInput = {
        email: form.email,
        password: form.password,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        displayName: form.displayName || undefined,
        phone: form.phone || undefined,
        username: form.username || undefined,
        roles: roleSlugs.length > 0 ? roleSlugs : undefined,
      };
      const user = await authClient.createUser(input);
      toast.success("User created.");
      navigate(`/users/${userIdOf(user)}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create this user. Check the fields and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>No invitation email — the account is usable immediately with the password set here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="roles">Roles</Label>
                {canReadRoles ? (
                  <RoleMultiSelect roles={roles} selected={selectedRoles} onChange={setSelectedRoles} />
                ) : (
                  <Input id="roles" value={manualRoles} onChange={(e) => setManualRoles(e.target.value)} placeholder="admin, member" />
                )}
                <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create user"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/users")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
