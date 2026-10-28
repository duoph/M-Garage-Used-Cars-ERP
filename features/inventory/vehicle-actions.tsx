"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Eye, MoreHorizontal, Pencil, Receipt, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { vehicleTitle } from "@/lib/utils/labels";
import type { VehicleView } from "@/lib/calculations/selectors";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReserveDialog } from "@/features/sales/reserve-dialog";
import { VehicleEditSheet } from "./vehicle-edit-sheet";

type Dialog = "edit" | "reserve" | "release" | null;

/** Contextual actions for a vehicle; every item respects role permissions and vehicle status. */
export function useVehicleActions(view: VehicleView) {
  const { can } = useAuth();
  const user = useCurrentUser();
  const router = useRouter();
  const openExpense = useDialogStore((s) => s.openExpense);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const v = view.vehicle;
  const archived = !!v.archivedAt;

  const actions = {
    canEdit: can("inventory.edit") && !archived,
    canReserve: can("sales.create") && v.status === "available" && !archived,
    canSell: can("sales.create") && v.status !== "sold" && !archived,
    canRelease: can("sales.create") && v.status === "reserved" && !!view.reservation,
    canExpense: can("expenses.manage") && !archived,
    canViewSale: can("sales.view") && !!view.sale && (can("sales.viewAll") || view.sale.soldBy === user.id),
    edit: () => setDialog("edit"),
    reserve: () => setDialog("reserve"),
    release: () => setDialog("release"),
    sell: () =>
      router.push(`/sales/new?vehicle=${v.id}${view.reservation ? `&reservation=${view.reservation.id}` : ""}`),
    expense: () => openExpense({ vehicleId: v.id }),
    viewSale: () => view.sale && router.push(`/sales/${view.sale.id}`),
  };

  const dialogs = (
    <>
      {actions.canEdit && <VehicleEditSheet vehicle={v} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />}
      {actions.canReserve && <ReserveDialog vehicle={v} open={dialog === "reserve"} onOpenChange={(o) => setDialog(o ? "reserve" : null)} />}
      {actions.canRelease && view.reservation && (
        <ConfirmDialog
          open={dialog === "release"}
          onOpenChange={(o) => setDialog(o ? "release" : null)}
          title="Release reservation?"
          description={
            <>
              {vehicleTitle(v)} will become available again. The reservation for{" "}
              <strong>{view.reservationCustomer?.name ?? "this buyer"}</strong> stays in history. Handle any booking refund outside the system.
            </>
          }
          confirmLabel="Release reservation"
          tone="destructive"
          requireReason
          reasonPlaceholder="e.g. Buyer withdrew, loan not approved"
          onConfirm={async (reason) => {
            try {
              await dealerService.cancelReservation(user, view.reservation!.id, reason);
              toast.success("Reservation released; vehicle is available again");
            } catch (e) {
              reportError(e);
              return false;
            }
          }}
        />
      )}
    </>
  );

  return { actions, dialogs };
}

export function VehicleActionsMenu({ view, align = "end" }: { view: VehicleView; align?: "start" | "end" }) {
  const router = useRouter();
  const { actions: a, dialogs } = useVehicleActions(view);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${vehicleTitle(view.vehicle)}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          <DropdownMenuItem onSelect={() => router.push(`/inventory/${view.vehicle.id}`)}>
            <Eye /> View details
          </DropdownMenuItem>
          {a.canEdit && (
            <DropdownMenuItem onSelect={a.edit}>
              <Pencil /> Edit vehicle
            </DropdownMenuItem>
          )}
          {(a.canReserve || a.canSell || a.canRelease || a.canViewSale) && <DropdownMenuSeparator />}
          {a.canReserve && (
            <DropdownMenuItem onSelect={a.reserve}>
              <ClipboardList /> Reserve
            </DropdownMenuItem>
          )}
          {a.canSell && (
            <DropdownMenuItem onSelect={a.sell}>
              <Receipt /> {view.reservation ? "Complete sale" : "Record sale"}
            </DropdownMenuItem>
          )}
          {a.canViewSale && (
            <DropdownMenuItem onSelect={a.viewSale}>
              <Receipt /> View sale
            </DropdownMenuItem>
          )}
          {a.canRelease && (
            <DropdownMenuItem variant="destructive" onSelect={a.release}>
              <Undo2 /> Release reservation
            </DropdownMenuItem>
          )}
          {a.canExpense && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={a.expense}>
                <Wallet /> Add vehicle expense
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
