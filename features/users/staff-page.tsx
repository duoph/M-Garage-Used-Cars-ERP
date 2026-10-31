"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, Info, MoreHorizontal, Pencil, Plus, Power, SearchX, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { userSchema, type UserInput } from "@/lib/validation/schemas";
import { ROLES, type Role, type User } from "@/types";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { formatDate } from "@/lib/utils/dates";
import { hasCustomAccess, PERMISSION_GROUPS, permissionsFor, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/form-field";
import { cn } from "@/lib/utils/cn";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including staff accounts, access, settings and all financials. Always full access.",
  manager: "Purchases, inventory, sales, expenses, reports and profit. No staff or settings.",
  office: "Front office: vehicle papers, documents, cash and bank vouchers, receipts and expenses. No cost or profit.",
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
    .filter((u) => `${u.name} ${u.email} ${u.phone} ${u.designation ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));

  const paged = usePagedRows(rows, `${search}|${role}|${status}`);

  return (
    <>
      <PageHeader title="Staff & Users" description="Employee accounts, account types, designations and access." actions={<Button onClick={() => setEditing("new")}><Plus /> Add user</Button>} />
      <div className="mb-4 flex gap-2.5 rounded-lg border border-[#d1e0ff] bg-[#eff4ff] p-3 text-[13px] text-[#1d3a8a]">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">No passwords yet.</strong> Accounts here act as sign-in profiles only. When the backend is
          connected, invitations, passwords and sessions will be handled securely on the server.
        </p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border bg-card p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{ROLE_LABELS[r]}</span>
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular">{ds.users.filter((u) => u.role === r && u.status === "active").length} active</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground tabular">{ROLE_PERMISSIONS[r].size} permissions by default</p>
          </div>
        ))}
      </div>
      <DesignationsCard />
      <Card>
        <StickyBar>
          <FilterBar
            search={<SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="sm:w-full" size="sm" />}
          >
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="h-8 w-[160px]" aria-label="Account type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All account types</SelectItem>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 w-[130px]" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {rows.length === 0 ? (
          <EmptyState icon={ds.users.length ? SearchX : Users} title="No users match" />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((u) => {
                const roleBadge = <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>;
                const accessBadge = hasCustomAccess(u) && <Badge tone="warning" title="Access differs from the account type's defaults">Custom access</Badge>;
                const statusBadge = u.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>;
                return (
                  <ListRow
                    key={u.id}
                    onClick={() => setEditing(u)}
                    leading={<UserAvatar name={u.name} />}
                    title={<>{u.name} {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}</>}
                    subtitle={<>{u.designation && <span className="font-medium text-foreground/80">{u.designation} · </span>}{u.email || "No email yet"}{u.phone && <> · {u.phone}</>}</>}
                    mobile={<>{roleBadge}{accessBadge}{statusBadge}</>}
                    aside={
                      <>
                        <RowCell from="lg" className="w-28 text-right">{accessBadge}</RowCell>
                        <RowCell className="w-40 text-right">{roleBadge}</RowCell>
                        <RowCell className="w-20 text-right">{statusBadge}</RowCell>
                        <RowCell from="lg" className="w-28 text-right text-xs text-muted-foreground" title="Created">{formatDate(u.createdAt)}</RowCell>
                      </>
                    }
                    action={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(u)}><Pencil /> Edit user</DropdownMenuItem>
                          <DropdownMenuItem disabled={u.id === me.id} variant={u.status === "active" ? "destructive" : "default"} onSelect={() => setToggling(u)}>
                            <Power /> {u.status === "active" ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                );
              })}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
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
              designation: toggling.designation ?? "",
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

function DesignationsCard() {
  const { ds } = useData();
  const me = useCurrentUser();
  const designations = ds.settings.designations ?? [];
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save(next: string[]) {
    setSaving(true);
    try {
      await dealerService.setDesignations(me, next);
      return true;
    } catch (e) {
      reportError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (designations.some((d) => d.toLowerCase() === value.toLowerCase())) {
      toast.error(`"${value}" is already in the list`);
      return;
    }
    if (await save([...designations, value])) setDraft("");
  }

  const inUse = (d: string) => ds.users.filter((u) => u.designation === d).length;

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><BadgeCheck className="size-4 text-muted-foreground" /> Designations</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Job titles you can give staff, separate from their account type and access.</p>
        </div>
        <form onSubmit={add} className="flex gap-2 sm:w-80">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Showroom Manager" maxLength={60} className="h-8" aria-label="New designation" />
          <Button type="submit" size="sm" variant="outline" disabled={!draft.trim()} loading={saving}><Plus /> Add</Button>
        </form>
      </div>
      {designations.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No designations yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {designations.map((d) => (
            <li key={d} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-[13px]">
              {d}
              {inUse(d) > 0 && <span className="text-[11px] text-muted-foreground tabular">{inUse(d)}</span>}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label={`Remove ${d}`}
                disabled={saving}
                onClick={() => save(designations.filter((x) => x !== d))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccessEditor({ role, value, onChange }: { role: Role; value: Permission[] | null; onChange: (v: Permission[] | null) => void }) {
  if (role === "admin")
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" /> Admin accounts always have full access, so the showroom can never be locked out.
      </p>
    );
  const custom = value !== null;
  const active = new Set<Permission>(value ?? ROLE_PERMISSIONS[role]);
  const toggle = (p: Permission, on: boolean) => {
    const next = new Set(active);
    if (on) next.add(p);
    else next.delete(p);
    onChange([...next]);
  };
  return (
    <div className="rounded-lg border">
      <label className="flex cursor-pointer items-center justify-between gap-3 border-b p-3">
        <span>
          <span className="block text-[13px] font-medium">Custom access</span>
          <span className="block text-xs text-muted-foreground">
            {custom ? `${active.size} permissions chosen for this person.` : `Uses the ${ROLE_LABELS[role]} defaults (${ROLE_PERMISSIONS[role].size} permissions).`}
          </span>
        </span>
        <Switch checked={custom} onCheckedChange={(on) => onChange(on ? [...ROLE_PERMISSIONS[role]] : null)} aria-label="Custom access" />
      </label>
      <div className="grid gap-4 p-3 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.label} disabled={!custom} className="min-w-0">
            <legend className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</legend>
            <div className="grid gap-1">
              {g.items.map((item) => (
                <label key={item.permission} className={cn("flex items-start gap-2 text-[13px]", custom ? "cursor-pointer" : "opacity-60")}>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-primary)]"
                    checked={active.has(item.permission)}
                    onChange={(e) => toggle(item.permission, e.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const { ds } = useData();
  const me = useCurrentUser();
  const designations = ds.settings.designations ?? [];
  const form = useForm<UserInput>({
    resolver: zodResolver(userSchema),
    defaultValues: user
      ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          designation: user.designation ?? "",
          permissions: hasCustomAccess(user) ? ([...permissionsFor(user)] as Permission[]) : null,
        }
      : { name: "", email: "", phone: "", role: "sales", status: "active", designation: "", permissions: null },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });
  const isSelf = user?.id === me.id;

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
    <DialogContent className="sm:max-w-2xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>Account type and access changes take effect immediately and are recorded in the activity log.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-name" error={errors.name?.message} required>
            <Input id="u-name" {...form.register("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Designation" htmlFor="u-designation" hint={designations.length ? undefined : "Add designations on the Staff page first."}>
            <Controller control={form.control} name="designation" render={({ field }) => (
              <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                <SelectTrigger id="u-designation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No designation</SelectItem>
                  {/* Keep a title that was removed from the list selectable for this user. */}
                  {[...new Set([...designations, ...(field.value ? [field.value] : [])])].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Email / username" htmlFor="u-email" error={errors.email?.message} required>
            <Input id="u-email" type="email" autoComplete="off" {...form.register("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Contact number" htmlFor="u-phone" error={errors.phone?.message}>
            <Input id="u-phone" type="tel" {...form.register("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Account type" htmlFor="u-role" required hint={ROLE_DESCRIPTIONS[role]}>
            <Controller control={form.control} name="role" render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Custom access is chosen per account type, so it starts over from the new defaults.
                  form.setValue("permissions", null);
                }}
              >
                <SelectTrigger id="u-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Account status" htmlFor="u-status" error={errors.status?.message}>
            <Controller control={form.control} name="status" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isSelf}>
                <SelectTrigger id="u-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </Field>
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-medium">Access</span>
            <Controller control={form.control} name="permissions" render={({ field }) => (
              <AccessEditor role={role} value={(field.value as Permission[] | null | undefined) ?? null} onChange={field.onChange} />
            )} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{user ? "Save changes" : "Add user"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
