import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthApiError } from "@easy-auth/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";

/**
 * The console's front door. Cards are individually permission-gated so a low-privilege user sees
 * fewer of them rather than hitting a wall — that's also why this route isn't wrapped in
 * `RequirePermission` in App.tsx. No total user count is shown: the backend only exposes cursor
 * pagination for users, not a count endpoint, so that number would have to be fabricated.
 */
export function DashboardPage() {
  const ability = useAbility();
  const canReadUsers = ability.can(PERMISSIONS.usersRead, "permission");
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (canManageRoles) {
          const roles = await authClient.listRoles();
          if (!cancelled) setRoleCount(roles.length);
        }
        if (canReadPermissions) {
          const permissions = await authClient.listPermissions();
          if (!cancelled) setPermissionCount(permissions.length);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AuthApiError ? err.message : "Couldn't load dashboard data. Check that the backend is running, then try again.",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManageRoles, canReadPermissions]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of this deployment.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canManageRoles ? (
          <Card>
            <CardHeader>
              <CardDescription>Roles</CardDescription>
              <CardTitle className="text-3xl">{roleCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Defined for this deployment</CardContent>
          </Card>
        ) : null}
        {canReadPermissions ? (
          <Card>
            <CardHeader>
              <CardDescription>Permissions</CardDescription>
              <CardTitle className="text-3xl">{permissionCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">In the capability catalog</CardContent>
          </Card>
        ) : null}
        {canReadUsers ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
              <CardDescription>Search, block, edit, or delete accounts on this deployment.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/users" className="text-sm font-medium text-primary underline underline-offset-2">
                Go to Users →
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
