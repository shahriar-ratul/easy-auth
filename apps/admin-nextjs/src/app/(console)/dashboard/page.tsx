"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";

export default observer(function DashboardPage() {
  const ability = useAbility<AppAbility>();
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);

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
        if (!cancelled) setError(errorMessage(err));
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
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of this deployment.</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canManageRoles && (
          <Card>
            <CardHeader>
              <CardDescription>Roles</CardDescription>
              <CardTitle className="text-3xl">{roleCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Defined for this deployment</CardContent>
          </Card>
        )}
        {canReadPermissions && (
          <Card>
            <CardHeader>
              <CardDescription>Permissions</CardDescription>
              <CardTitle className="text-3xl">{permissionCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">In the capability catalog</CardContent>
          </Card>
        )}
        {canReadUsers && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
              <CardDescription>Search, block, edit, or delete accounts on this deployment.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/users" className="text-sm font-medium text-primary underline underline-offset-2">
                Go to Users →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
});
