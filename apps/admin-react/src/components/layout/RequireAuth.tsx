import { observer } from "mobx-react-lite";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { canAny, useAbility } from "@/lib/ability";
import { useAuthStore } from "@/stores/store-context";

/** Route guard: redirects to /login (preserving the intended destination) when there's no session. */
export const RequireAuth = observer(function RequireAuth() {
  const store = useAuthStore();
  const location = useLocation();

  if (store.initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!store.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
});

/**
 * Gate for a page whose routes the backend requires a permission for. `anyOf` is satisfied by
 * holding any one of the listed permissions, which is how a page made of several independently
 * gated cards (Roles & Permissions) opens for someone who can use only part of it.
 *
 * The backend's `PermissionGuard` is the real boundary — this exists so a page that would answer
 * 403 isn't offered in the first place, and it reads the same permission keys the guard does.
 */
export function RequirePermission({ anyOf }: { anyOf: readonly string[] }) {
  const ability = useAbility();

  if (!canAny(ability, anyOf)) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium">You don't have access to this page</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It needs the {anyOf.map((permission) => `"${permission}"`).join(" or ")} permission. Ask an administrator to grant it, then sign in again.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
