import { useMemo, useState } from "react";
import type { UserSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { useDebounce } from "use-debounce";
import { ChevronDownIcon, EyeIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/stores/store-context";
import { cn } from "@/lib/cn";
import { AlertModal } from "@/components/alert-modal";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

export const UsersPage = observer(function UsersPage() {
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const workspaceName = workspaceStore.activeWorkspace?.name ?? "this workspace";
  const canBlock = ability.can(PERMISSIONS.usersBlock, "permission");
  const canManage = ability.can(PERMISSIONS.usersManage, "permission");

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<UserSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"block" | "status" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  // Keyed on the active workspace, same as before: `listUsers` sends it as `X-Workspace-Id`, so
  // switching workspaces has to refetch or the table would show one workspace's members under
  // another's name.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["users-list", activeWorkspaceId, pagination.pageIndex, pagination.pageSize, searchKey],
    queryFn: () => authClient.listUsers({ search: searchKey || undefined, page: pagination.pageIndex + 1, limit: pagination.pageSize }),
    placeholderData: keepPreviousData,
  });

  const total = data?.meta.total ?? 0;
  const pageCount = data?.meta.pageCount ?? 0;

  // The backend has no server-side `isActive` filter, so status filters only the already-fetched
  // page — `total`/`pageCount` (and the pager) stay keyed to the unfiltered count.
  const users = useMemo(() => {
    const items = data?.items ?? [];
    if (status === "active") return items.filter((u) => u.isActive);
    if (status === "inactive") return items.filter((u) => !u.isActive);
    return items;
  }, [data, status]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openBlockConfirm(user: UserSummary) {
    setPendingUser(user);
    setPendingAction("block");
    setConfirmOpen(true);
  }

  function openStatusConfirm(user: UserSummary) {
    setPendingUser(user);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingUser || !pendingAction) return;
    const userId = userIdOf(pendingUser);
    setPendingBusy(true);
    try {
      if (pendingAction === "block") {
        if (pendingUser.blocked) await authClient.unblockUser(userId);
        else await authClient.blockUser(userId);
        toast.success(pendingUser.blocked ? "User unblocked." : "User blocked.");
      } else {
        if (pendingUser.isActive) await authClient.deactivateUser(userId);
        else await authClient.activateUser(userId);
        toast.success(pendingUser.isActive ? "User deactivated." : "User activated.");
      }
      setConfirmOpen(false);
      setPendingUser(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this user's status. Try again."));
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<UserSummary>[]>(
    () => [
      {
        id: "user",
        header: "User",
        accessorFn: (user) => user.displayName || user.email,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Link to={`/users/${userIdOf(user)}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="size-8">
                {user.photo && <AvatarImage src={user.photo} alt="" />}
                <AvatarFallback>{initialsOf(user)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{user.displayName || user.email}</span>
                {user.displayName && <span className="text-xs text-muted-foreground">{user.email}</span>}
              </div>
            </Link>
          );
        },
      },
      {
        id: "roles",
        header: "Roles",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            {row.original.roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        // A routine administrative toggle, distinct from Block in the Actions column — see the
        // `isActive` vs `blocked` note on `UserSummary`. The badge itself is the click target.
        accessorFn: (user) => (user.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canBlock} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(user)}>
                  <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {canBlock ? (user.isActive ? "Deactivate this user" : "Activate this user") : "You don't have permission to change this user's status."}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (user) => user.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        accessorFn: (user) => user.updatedAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString()}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          const userId = userIdOf(user);
          return (
            <div className="flex justify-end items-center gap-1.5">
              {user.blocked && <Badge variant="destructive">Blocked</Badge>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to={`/users/${userId}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
                    <EyeIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant={user.blocked ? "outline" : "destructive"} disabled={!canBlock} onClick={() => openBlockConfirm(user)}>
                    {user.blocked ? "Unblock" : "Block"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canBlock ? (user.blocked ? "Unblock this user" : "Block this user") : "You don't have permission to change this user's status."}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canBlock],
  );

  const table = useReactTable({
    data: users,
    columns,
    pageCount: pageCount || -1,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
  });

  return (
    <div className="flex flex-col gap-6">
      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "block"
            ? pendingUser?.blocked
              ? "This unblocks the account — they can sign in again immediately."
              : "This blocks the account everywhere, immediately."
            : pendingUser?.isActive
              ? "This deactivates the account — they can sign in again once reactivated."
              : "This reactivates the account, immediately."
        }
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Search, block or unblock, and review roles for the members of {workspaceName}.</p>
        </div>
        {canManage && (
          <Link to="/users/new" className={cn(buttonVariants({ size: "sm" }))}>
            <PlusIcon />
            Add user
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Directory</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{apiErrorMessage(error, "Couldn't load users. Try again.")}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              placeholder="Search by email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
            <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" ? "" : (value as "active" | "inactive"))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!search && !status} onClick={clearFilters}>
              Clear
            </Button>
          </div>

          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              Showing {users.length} of {total} results
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns <ChevronDownIcon className="ml-1 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isLoading ? (
            <TableSkeletonLoader
              columns={[
                { header: "User", skeletonType: "avatar" },
                { header: "Roles", skeletonType: "badge", skeletonCount: 2 },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Created", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Updated", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Actions", width: "w-[150px]", skeletonType: "actions", skeletonCount: 2 },
              ]}
              rows={pagination.pageSize > 10 ? 10 : pagination.pageSize}
            />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={users} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
