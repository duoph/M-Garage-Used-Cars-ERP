"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, MoreHorizontal, Pencil, Plus, Power, SearchX, Users } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { userSchema, type UserInput } from "@/lib/validation/schemas";
import { ROLES, type Role, type User } from "@/types";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { formatDate } from "@/lib/utils/dates";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/form-field";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including staff accounts, settings and all financials.",
  manager: "Purchases, inventory, sales, expenses, reports and profit. No staff or settings.",
  sales: "Stock, photos, reservations, sales and receipts. Never sees costs or profit.",
  accountant: "Payments, expenses, financial reports and exports. Cannot edit vehicles.",
};

export function StaffPage() {
  const { ds } = useData();
  const me = useCurrentUser();
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState<"all" | Role>("all");
  const [status, setStatus] = React.useState<"all" | User["status"]>("all");
  const [editing, setEditing] = React.useState<User | "new" | null>(null);
  const [toggling, setToggling] = React.useState<User | null>(null);

  const rows = ds.users
    .filter((u) => role === "all" || u.role === role)
    .filter((u) => status === "all" || u.status === status)
    .filter((u) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));

  const columns: ColumnDef<User>[] = [
    {
      id: "name",
      header: "Employee",
      accessorFn: (u) => u.name,
      cell: ({ row: { original: u } }) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={u.name} />
          <div>
            <div className="font-medium">{u.name} {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}</div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
          </div>
        </div>
      ),
    },
    { id: "phone", header: "Contact", accessorFn: (u) => u.phone, cell: ({ getValue }) => String(getValue() || "—") },
    { id: "role", header: "Role", accessorFn: (u) => ROLES.indexOf(u.role), cell: ({ row: { original: u } }) => <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[u.role]}</Badge> },
    { id: "status", header: "Status", accessorFn: (u) => u.status, cell: ({ row: { original: u } }) => (u.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>) },
    { id: "created", header: "Created", accessorFn: (u) => u.createdAt, cell: ({ row: { original: u } }) => formatDate(u.createdAt) },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: u } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditing(u)}><Pencil /> Edit user</DropdownMenuItem>
            <DropdownMenuItem disabled={u.id === me.id} variant={u.status === "active" ? "destructive" : "default"} onSelect={() => setToggling(u)}>
              <Power /> {u.status === "active" ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Staff & Users" description="Manage employee accounts and their roles." actions={<Button onClick={() => setEditing("new")}><Plus /> Add user</Button>} />
      <div className="mb-4 flex gap-2.5 rounded-lg border border-[#d1e0ff] bg-[#eff4ff] p-3 text-[13px] text-[#1d3a8a]">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Demo access.</strong> Accounts here act as sign-in personas only — there are no passwords in this demo. When the backend is
          connected, invitations, passwords and sessions will be handled securely on the server.
        </p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{ROLE_LABELS[r]}</span>
              <span className="text-xs text-muted-foreground tabular">{ds.users.filter((u) => u.role === r && u.status === "active").length} active</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground tabular">{ROLE_PERMISSIONS[r].size} permissions</p>
          </div>
        ))}
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" />
          <div className="flex flex-wrap gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-9 w-[130px]" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(u) => u.id}
          resetPageKey={`${search}|${role}|${status}`}
          empty={<EmptyState icon={ds.users.length ? SearchX : Users} title="No users match" />}
          renderMobileCard={(u) => (
            <button type="button" onClick={() => setEditing(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <UserAvatar name={u.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.name}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                {u.status === "inactive" && <span className="text-[11px] text-muted-foreground">Inactive</span>}
              </div>
            </button>
          )}
        />
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && <UserForm user={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === "active" ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        description={toggling?.status === "active" ? "They will no longer be able to sign in. Their past records are kept." : "They will be able to sign in again with their current role."}
        confirmLabel={toggling?.status === "active" ? "Deactivate" : "Reactivate"}
        tone={toggling?.status === "active" ? "destructive" : "default"}
        onConfirm={async () => {
          if (!toggling) return;
          try {
            await dealerService.updateUser(me, toggling.id, {
              name: toggling.name,
              email: toggling.email,
              phone: toggling.phone,
              role: toggling.role,
              status: toggling.status === "active" ? "inactive" : "active",
            });
            toast.success(toggling.status === "active" ? "User deactivated" : "User reactivated");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </>
  );
}

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const me = useCurrentUser();
  const form = useForm<UserInput>({
    resolver: zodResolver(userSchema),
    defaultValues: user
      ? { name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status }
      : { name: "", email: "", phone: "", role: "sales", status: "active" },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: UserInput) {
    try {
      if (user) await dealerService.updateUser(me, user.id, values);
      else await dealerService.createUser(me, values);
      toast.success(user ? "User updated" : `${values.name} added`);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>Role changes take effect immediately and are recorded in the activity log.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-name" error={errors.name?.message} required className="sm:col-span-2">
            <Input id="u-name" {...form.register("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Email / username" htmlFor="u-email" error={errors.email?.message} required>
            <Input id="u-email" type="email" autoComplete="off" {...form.register("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Contact number" htmlFor="u-phone" error={errors.phone?.message}>
            <Input id="u-phone" type="tel" {...form.register("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Role" htmlFor="u-role" required hint={ROLE_DESCRIPTIONS[role]}>
            <Controller control={form.control} name="role" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="u-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Account status" htmlFor="u-status" error={errors.status?.message}>
            <Controller control={form.control} name="status" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={user?.id === me.id}>
                <SelectTrigger id="u-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{user ? "Save changes" : "Add user"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
