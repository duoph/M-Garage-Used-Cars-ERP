import { z } from "zod";
import {
  EXPENSE_CATEGORIES,
  FUEL_TYPES,
  PAYMENT_METHODS,
  ROLES,
  TRANSMISSIONS,
  USER_STATUSES,
  VEHICLE_EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/types";
import { normalizeRegistration } from "@/lib/utils/ids";

const MAX_PAISE = 100_00_00_000_00; // ₹100 crore ceiling guards against typos.

export const isoDate = z
  .string({ error: "Date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Business date that may not lie in the future. */
export const pastOrTodayDate = isoDate.refine((d) => d <= localToday(), "Date cannot be in the future");

function localToday(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export const paise = (label: string) =>
  z
    .number({ error: `${label} is required` })
    .int(`${label} must be a valid amount`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_PAISE, `${label} looks too large`);

export const positivePaise = (label: string) => paise(label).refine((v) => v > 0, `${label} must be greater than zero`);

const phoneRegex = /^(\+?91)?[6-9]\d{9}$/;
export const indianPhone = z
  .string()
  .trim()
  .min(1, "Contact number is required")
  .refine((v) => phoneRegex.test(v.replace(/[\s-]/g, "")), "Enter a valid 10-digit Indian mobile number");

export const optionalIndianPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || phoneRegex.test(v.replace(/[\s-]/g, "")), "Enter a valid 10-digit Indian mobile number");

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const currentYear = new Date().getFullYear();

export const registrationNumber = z
  .string()
  .trim()
  .min(1, "Registration number is required")
  .refine((v) => {
    const n = normalizeRegistration(v);
    return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(n) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(n);
  }, "Use a valid Indian format, e.g. KL 07 CD 4521");

export const vehicleDetailsSchema = z.object({
  make: z.string().trim().min(1, "Make is required").max(40),
  model: z.string().trim().min(1, "Model is required").max(40),
  variant: optionalText(60),
  year: z
    .number({ error: "Year is required" })
    .int()
    .min(1990, "Year must be 1990 or later")
    .max(currentYear + 1, `Year cannot be after ${currentYear + 1}`),
  registrationNumber,
  chassisNumber: z
    .string()
    .trim()
    .max(25, "Chassis number is too long")
    .refine((v) => v === "" || /^[A-Za-z0-9]{6,25}$/.test(v), "Use 6–25 letters and digits"),
  engineNumber: optionalText(25),
  fuelType: z.enum(FUEL_TYPES, { error: "Select a fuel type" }),
  transmission: z.enum(TRANSMISSIONS, { error: "Select a transmission" }),
  mileageKm: z
    .number({ error: "Kilometers driven is required" })
    .int("Use whole kilometers")
    .min(0, "Cannot be negative")
    .max(1_000_000, "Value looks too large"),
  color: z.string().trim().min(1, "Colour is required").max(30),
  previousOwners: z.number({ error: "Required" }).int().min(0, "Cannot be negative").max(10, "Max 10 owners"),
  notes: optionalText(1000),
});
export type VehicleDetailsInput = z.infer<typeof vehicleDetailsSchema>;

export const vehicleEditSchema = vehicleDetailsSchema.extend({
  askingPricePaise: positivePaise("Asking price"),
});
export type VehicleEditInput = z.infer<typeof vehicleEditSchema>;

export const sellerSchema = z.object({
  sellerName: z.string().trim().min(2, "Seller name is required").max(80),
  sellerContact: indianPhone,
  sellerAddress: optionalText(200),
  sellerNotes: optionalText(500),
});

export const purchaseInfoSchema = z.object({
  purchaseDate: pastOrTodayDate,
  purchasePricePaise: positivePaise("Purchase price"),
  amountPaidPaise: paise("Amount paid"),
  askingPricePaise: positivePaise("Asking price"),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Select a payment method" }),
  paymentReference: optionalText(60),
  purchaseNotes: optionalText(1000),
});

export const purchaseFormSchema = vehicleDetailsSchema
  .extend(sellerSchema.shape)
  .extend(purchaseInfoSchema.shape)
  .superRefine((v, ctx) => {
    if (v.amountPaidPaise > v.purchasePricePaise)
      ctx.addIssue({ code: "custom", path: ["amountPaidPaise"], message: "Amount paid cannot exceed the purchase price" });
  });
export type PurchaseFormInput = z.infer<typeof purchaseFormSchema>;

/** Edit of the purchase transaction itself (vehicle specs are edited from inventory). */
export const purchaseEditSchema = sellerSchema
  .extend({
    purchaseDate: pastOrTodayDate,
    purchasePricePaise: positivePaise("Purchase price"),
    amountPaidPaise: paise("Amount paid"),
    paymentMethod: z.enum(PAYMENT_METHODS),
    paymentReference: optionalText(60),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.amountPaidPaise > v.purchasePricePaise)
      ctx.addIssue({ code: "custom", path: ["amountPaidPaise"], message: "Amount paid cannot exceed the purchase price" });
  });
export type PurchaseEditInput = z.infer<typeof purchaseEditSchema>;

export const customerSchema = z.object({
  customerName: z.string().trim().min(2, "Buyer name is required").max(80),
  customerPhone: indianPhone,
  customerAddress: optionalText(200),
  customerNotes: optionalText(500),
});

export const reservationSchema = customerSchema.extend({
  reservationDate: pastOrTodayDate,
  bookingAmountPaise: paise("Booking amount"),
  bookingMethod: z.enum(PAYMENT_METHODS),
  bookingReference: optionalText(60),
  notes: optionalText(500),
});
export type ReservationInput = z.infer<typeof reservationSchema>;

export const makeSaleSchema = (bookingPaise: number) =>
  customerSchema
    .extend({
      vehicleId: z.string().min(1, "Select a vehicle"),
      reservationId: z.string().nullable(),
      saleDate: pastOrTodayDate,
      salePricePaise: positivePaise("Sale price"),
      amountReceivedPaise: paise("Amount received"),
      paymentMethod: z.enum(PAYMENT_METHODS),
      paymentReference: optionalText(60),
      notes: optionalText(1000),
    })
    .superRefine((v, ctx) => {
      if (v.salePricePaise < bookingPaise)
        ctx.addIssue({
          code: "custom",
          path: ["salePricePaise"],
          message: "Sale price cannot be lower than the booking amount already received",
        });
      if (bookingPaise + v.amountReceivedPaise > v.salePricePaise)
        ctx.addIssue({
          code: "custom",
          path: ["amountReceivedPaise"],
          message: "Total received would exceed the sale price",
        });
    });
export type SaleInput = z.infer<ReturnType<typeof makeSaleSchema>>;

export const makePaymentSchema = (balancePaise: number) =>
  z.object({
    amountPaise: positivePaise("Amount").refine(
      (v) => v <= balancePaise,
      "Amount exceeds the outstanding balance",
    ),
    date: pastOrTodayDate,
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(60),
    notes: optionalText(300),
  });
export type PaymentInput = z.infer<ReturnType<typeof makePaymentSchema>>;

export function isVehicleCategory(c: ExpenseCategory): boolean {
  return (VEHICLE_EXPENSE_CATEGORIES as readonly string[]).includes(c);
}

export const expenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES, { error: "Select a category" }),
    amountPaise: positivePaise("Amount"),
    date: pastOrTodayDate,
    description: z.string().trim().min(2, "Description is required").max(200),
    vendor: optionalText(80),
    paymentMethod: z.enum(PAYMENT_METHODS),
    vehicleId: z.string().nullable(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (isVehicleCategory(v.category) && !v.vehicleId)
      ctx.addIssue({ code: "custom", path: ["vehicleId"], message: "Select the vehicle this expense belongs to" });
    if (!isVehicleCategory(v.category) && v.vehicleId)
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Choose a vehicle category, or clear the related vehicle for a general expense",
      });
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const userSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: optionalIndianPhone,
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
});
export type UserInput = z.infer<typeof userSchema>;

export const settingsSchema = z.object({
  showroomName: z.string().trim().min(2, "Business name is required").max(80),
  legalName: optionalText(120),
  address: z.string().trim().min(5, "Address is required").max(200),
  city: optionalText(60),
  phone: indianPhone,
  email: z.string().trim().email("Enter a valid email address"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(v), "Enter a valid 15-character GSTIN"),
  dateFormat: z.enum(["dd MMM yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]),
  defaultInventoryView: z.enum(["grid", "table"]),
  receiptFooter: optionalText(200),
  receiptTerms: optionalText(600),
  maxUploadMb: z.number().int().min(1).max(25),
  maxPhotosPerVehicle: z.number().int().min(1).max(40),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
