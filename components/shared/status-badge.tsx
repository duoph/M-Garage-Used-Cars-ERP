import { Badge } from "@/components/ui/badge";
import {
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  SALE_STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/lib/utils/labels";
import type { PaymentStatus, PurchaseStatus, ReservationStatus, SaleStatus, VehicleStatus } from "@/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

function Dot({ className }: { className: string }) {
  return <span className={`size-1.5 rounded-full ${className}`} aria-hidden />;
}

const VEHICLE_TONE: Record<VehicleStatus, { tone: Tone; dot: string }> = {
  available: { tone: "success", dot: "bg-success" },
  reserved: { tone: "warning", dot: "bg-warning" },
  sold: { tone: "neutral", dot: "bg-[#667085]" },
};

export function VehicleStatusBadge({ status, archived }: { status: VehicleStatus; archived?: boolean }) {
  if (archived)
    return (
      <Badge tone="danger">
        <Dot className="bg-destructive" />
        Archived
      </Badge>
    );
  const t = VEHICLE_TONE[status];
  return (
    <Badge tone={t.tone}>
      <Dot className={t.dot} />
      {VEHICLE_STATUS_LABELS[status]}
    </Badge>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, Tone> = { unpaid: "danger", partial: "warning", paid: "success" };
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge tone={status === "completed" ? "brand" : "danger"}>{SALE_STATUS_LABELS[status]}</Badge>;
}

const RES_TONE: Record<ReservationStatus, Tone> = { active: "warning", converted: "success", cancelled: "neutral" };
export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge tone={RES_TONE[status]}>{RESERVATION_STATUS_LABELS[status]}</Badge>;
}

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return status === "active" ? <Badge tone="brand">Active</Badge> : <Badge tone="danger">Cancelled</Badge>;
}
