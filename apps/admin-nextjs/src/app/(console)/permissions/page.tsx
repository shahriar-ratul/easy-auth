"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import {
  type Column,
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { DefinePermissionInput, PermissionSummary } from "@easy-auth/auth-client";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { PermissionRequired } from "@/components/permission-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOptions } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";

const permissionSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  displayName: z.string().optional(),
  description: z.string().optional(),
  group: z.string().min(1, "Group is required"),
  // Derived from the permission catalog (see `deriveGroupOptions`/`handleGroupSelect` below) rather
  // than typed — kept editable here only as an advanced override.
  groupOrder: z.number().optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});
type PermissionForm = z.infer<typeof permissionSchema>;

const emptyForm: PermissionForm = { slug: "", displayName: "", description: "", group: "" };

function deriveGroupOptions(permissions: PermissionSummary[]): ComboboxOptions[] {
  const seen = new Set<string>();
  const options: ComboboxOptions[] = [];
  for (const permission of permissions) {
    if (!seen.has(permission.group)) {
      seen.add(permission.group);
      options.push({ value: permission.group, label: permission.group });
    }
  }
  return options;
}

function groupOrderFor(permissions: PermissionSummary[], group: string): number {
  return permissions.find((p) => p.group === group)?.groupOrder ?? 0;
}

function nextOrderInGroup(permissions: PermissionSummary[], group: string): number {
  const maxOrder = permissions.filter((p) => p.group === group).reduce((max, p) => Math.max(max, p.order), -1);
  return maxOrder + 1;
}

function nextGroupOrder(permissions: PermissionSummary[]): number {
  const maxGroupOrder = permissions.reduce((max, p) => Math.max(max, p.groupOrder), -1);
  return maxGroupOrder + 1;
}

function SortableHeader({ column, children }: { column: Column<PermissionSummary, unknown>; children: React.ReactNode }) {
  const sorted = column.getIsSorted();
  return (
    <button type="button" className="flex items-center gap-1 font-medium" onClick={column.getToggleSortingHandler()}>
      {children}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export default function PermissionsPage() {
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [editing, setEditing] = useState<PermissionSummary | null>(null);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const permissionForm = useForm<PermissionForm>({
    resolver: zodResolver(permissionSchema),
    defaultValues: emptyForm,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPermissions(await authClient.listPermissions());
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  const groupOptions = useMemo(() => deriveGroupOptions(permissions), [permissions]);

  function handleGroupSelect(option: ComboboxOptions) {
    permissionForm.setValue("group", option.value, { shouldValidate: true });
    permissionForm.setValue("groupOrder", groupOrderFor(permissions, option.value));
    permissionForm.setValue("order", nextOrderInGroup(permissions, option.value));
  }

  function handleGroupCreate(label: string) {
    permissionForm.setValue("group", label, { shouldValidate: true });
    permissionForm.setValue("groupOrder", nextGroupOrder(permissions));
    permissionForm.setValue("order", 1);
  }

  function openCreate() {
    setEditing(null);
    setSaveError(null);
    permissionForm.reset(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(permission: PermissionSummary) {
    setEditing(permission);
    setSaveError(null);
    permissionForm.reset({
      slug: permission.slug,
      displayName: permission.displayName,
      description: permission.description ?? "",
      group: permission.group,
      groupOrder: permission.groupOrder,
      order: permission.order,
      isActive: permission.isActive,
    });
    setCreateOpen(true);
  }

  async function handleSave(values: PermissionForm) {
    setSaving(true);
    setSaveError(null);
    try {
      const input: DefinePermissionInput = values;
      const saved = await authClient.definePermission(input);
      setPermissions((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
      });
      setNotice(`Permission "${saved.slug}" saved.`);
      setCreateOpen(false);
    } catch (err) {
      setSaveError(errorMessages(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<PermissionSummary>[]>(
    () => [
      {
        id: "slug",
        accessorKey: "slug",
        header: ({ column }) => <SortableHeader column={column}>Slug</SortableHeader>,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.slug}</span>,
      },
      {
        id: "displayName",
        accessorKey: "displayName",
        header: ({ column }) => <SortableHeader column={column}>Display name</SortableHeader>,
      },
      {
        id: "group",
        accessorKey: "group",
        header: ({ column }) => <SortableHeader column={column}>Group</SortableHeader>,
      },
      {
        id: "order",
        accessorKey: "order",
        header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
      },
      {
        id: "status",
        header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
        accessorFn: (permission) => (permission.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => <Badge variant={row.original.isActive ? "success" : "destructive"}>{row.original.isActive ? "Active" : "Inactive"}</Badge>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!canDefine}
              title={canDefine ? undefined : missingPermissionHint(PERMISSIONS.permissionsDefine)}
              onClick={() => openEdit(row.original)}
            >
              Edit
            </Button>
          </div>
        ),
      },
    ],
    [canDefine],
  );

  const table = useReactTable({
    data: permissions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.permissionsRead} what="Permissions" />;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Permissions", href: "/permissions" }]} />

      {loadError && <Alert variant="destructive">{loadError}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>The capability catalog — attach these to roles or grant them to a user directly.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canDefine} title={canDefine ? undefined : missingPermissionHint(PERMISSIONS.permissionsDefine)} onClick={openCreate}>
                New permission
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? `Edit ${editing.slug}` : "New permission"}</DialogTitle>
                <DialogDescription>
                  {editing ? "Editing is an upsert keyed on slug — the slug itself can't change here." : "Slug is the key routes check, e.g. billing:manage."}
                </DialogDescription>
              </DialogHeader>
              <Form {...permissionForm}>
                <form className="flex flex-col gap-4" onSubmit={permissionForm.handleSubmit(handleSave)}>
                  <FormErrorAlert messages={saveError} />
                  <FormField
                    control={permissionForm.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input disabled={!!editing} placeholder="billing:manage" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={permissionForm.control}
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
                    control={permissionForm.control}
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
                    control={permissionForm.control}
                    name="group"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group</FormLabel>
                        <FormControl>
                          <Combobox
                            options={groupOptions}
                            selected={field.value}
                            onChange={handleGroupSelect}
                            onCreate={handleGroupCreate}
                            showCreate
                            placeholder="Select or create a group…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={permissionForm.control}
                      name="groupOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Group order</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>Derived from the group — override to reorder groups.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={permissionForm.control}
                      name="order"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>Derived from the group&apos;s existing permissions.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {editing && (
                    <FormField
                      control={permissionForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value ?? true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <FormLabel className="font-normal">Active</FormLabel>
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <TableSkeletonLoader
              columns={[
                { header: "Slug", skeletonType: "text", skeletonWidth: "w-40" },
                { header: "Display name", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Group", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Order", skeletonType: "text", skeletonWidth: "w-8" },
                { header: "Status", width: "w-[100px]", skeletonType: "badge" },
                { header: "Actions", width: "w-[100px]", skeletonType: "actions", skeletonCount: 1 },
              ]}
            />
          ) : permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className={header.id === "actions" ? "text-right" : undefined}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
