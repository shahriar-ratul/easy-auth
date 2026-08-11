import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Navigate, Route, Routes } from "react-router-dom";
import { AbilityContext, abilityFor, PERMISSIONS } from "@/lib/ability";
import { useAuthStore } from "@/stores/store-context";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequirePermission } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { AddUserPage } from "@/pages/AddUserPage";
import { UserDetailPage } from "@/pages/UserDetailPage";
import { RolesPage } from "@/pages/RolesPage";
import { PermissionsPage } from "@/pages/PermissionsPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { AccountPage } from "@/pages/AccountPage";

export const App = observer(function App() {
  const store = useAuthStore();

  useEffect(() => {
    void store.initialize();
  }, [store]);

  const ability = abilityFor(store.currentUser);

  return (
    <AbilityContext.Provider value={ability}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/account" element={<AccountPage />} />

            <Route element={<RequirePermission anyOf={[PERMISSIONS.usersRead]} />}>
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[PERMISSIONS.usersManage]} />}>
              <Route path="/users/new" element={<AddUserPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[PERMISSIONS.rolesManage, PERMISSIONS.rolesAssign, PERMISSIONS.permissionsGrant]} />}>
              <Route path="/roles" element={<RolesPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[PERMISSIONS.permissionsRead]} />}>
              <Route path="/permissions" element={<PermissionsPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[PERMISSIONS.auditLogRead]} />}>
              <Route path="/audit-log" element={<AuditLogPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AbilityContext.Provider>
  );
});
