import {
  CarFront,
  CircleDollarSign,
  ClipboardList,
  Image as ImageIcon,
  PenLine,
  Receipt,
  Settings,
  ShoppingCart,
  Tag,
  Undo2,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "@/lib/permissions";
import type { ActivityAction, ActivityLog, User } from "@/types";

export function activityIcon(action: ActivityAction): { icon: LucideIcon; tone: string } {
  if (action.startsWith("purchase")) return { icon: ShoppingCart, tone: "bg-[#eff4ff] text-[#2948b8]" };
  if (action === "vehicle.price_changed") return { icon: Tag, tone: "bg-warning-soft text-warning" };
  if (action.startsWith("vehicle")) return { icon: CarFront, tone: "bg-primary-soft text-primary" };
  if (action.startsWith("photo")) return { icon: ImageIcon, tone: "bg-[#f4f3ff] text-[#5925dc]" };
  if (action === "reservation.cancelled" || action === "sale.cancelled") return { icon: Undo2, tone: "bg-destructive-soft text-destructive" };
  if (action.startsWith("reservation")) return { icon: ClipboardList, tone: "bg-warning-soft text-warning" };
  if (action.startsWith("sale")) return { icon: Receipt, tone: "bg-success-soft text-success" };
  if (action.startsWith("payment")) return { icon: CircleDollarSign, tone: "bg-success-soft text-success" };
  if (action.startsWith("expense")) return { icon: Wallet, tone: "bg-[#fdf2fa] text-[#c11574]" };
  if (action.startsWith("user")) return { icon: UserCog, tone: "bg-[#f2f4f7] text-[#475467]" };
  if (action.startsWith("settings") || action.startsWith("data")) return { icon: Settings, tone: "bg-[#f2f4f7] text-[#475467]" };
  return { icon: PenLine, tone: "bg-[#f2f4f7] text-[#475467]" };
}

const SENSITIVE_ACTIONS: ActivityAction[] = ["purchase.created", "purchase.updated", "expense.created", "expense.updated", "expense.deleted"];

/**
 * Which activity entries a user may see. Users without full activity access only see their own
 * entries, and users without cost visibility never see cost-related entries.
 */
export function visibleActivity(entries: readonly ActivityLog[], user: User): ActivityLog[] {
  const has = (p: Permission) => can(user, p);
  return entries.filter((e) => {
    if (!has("activity.view") && e.actorId !== user.id) return false;
    if (!has("finance.viewCost") && (e.metadata.sensitive || SENSITIVE_ACTIONS.includes(e.action))) return false;
    if (!has("users.manage") && e.entityType === "user") return false;
    return true;
  });
}
