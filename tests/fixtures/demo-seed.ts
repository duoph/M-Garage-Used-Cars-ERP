import { addDays, format, setHours, setMinutes, startOfMonth, subDays, subMonths } from "date-fns";
import type { DealerDatabase } from "@/lib/db/database";
import { formatReference, newId } from "@/lib/utils/ids";
import { formatINR } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/utils/labels";
import type {
  ActivityLog,
  BusinessSettings,
  Customer,
  Expense,
  ExpenseCategory,
  FuelType,
  PaymentMethod,
  Purchase,
  Quote,
  Reservation,
  Sale,
  SalePayment,
  Transmission,
  User,
  Vehicle,
} from "@/types";

/**
 * Sample showroom used only by the test suite (no photos). The app itself starts empty; see lib/db/bootstrap.ts.
 */

/** Deterministic PRNG so demo data is identical on every reset. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const L = (lakhs: number) => Math.round(lakhs * 1_00_000) * 100; // lakhs → paise, rounded to the rupee

export const DEMO_USER_IDS = {
  admin: "u-admin-arjun",
  manager: "u-manager-priya",
  sales: "u-sales-rahul",
  accountant: "u-accountant-divya",
} as const;

interface VehicleSeed {
  make: string;
  model: string;
  variant: string;
  /** Model key into VARIANTS for the generated extra cars. */
  photo: string;
  year: number;
  fuel: FuelType;
  trans: Transmission;
  km: number;
  color: string;
  owners: number;
  reg: string;
  chassis: string;
  asking: number; // lakhs
  purchasedDaysAgo: number;
  outcome:
    | { kind: "available" }
    | { kind: "reserved"; daysAgo: number; booking: number; buyer: number }
    | { kind: "sold"; daysAgo: number | "thisMonth"; thisMonthOffset?: number; discount: number; paidPct: number; buyer: number };
}

const BUYERS: { name: string; phone: string; address: string }[] = [
  { name: "Anand Pillai", phone: "9847012345", address: "Kakkanad, Kochi" },
  { name: "Fathima Rasheed", phone: "9895123456", address: "Edappally, Kochi" },
  { name: "Vishnu Prasad", phone: "9746234567", address: "Thrissur" },
  { name: "Meera Joseph", phone: "9605345678", address: "Aluva" },
  { name: "Sanjay Kurup", phone: "9447456789", address: "Kottayam" },
  { name: "Nikhil Thomas", phone: "9020567890", address: "Vyttila, Kochi" },
  { name: "Aisha Kareem", phone: "8547678901", address: "Perumbavoor" },
  { name: "Rohit Shenoy", phone: "9567789012", address: "Fort Kochi" },
  { name: "Lakshmi Iyer", phone: "9388890123", address: "Kalamassery" },
  { name: "Joseph Mathew", phone: "9961901234", address: "Angamaly" },
  { name: "Deepa Varghese", phone: "9744012398", address: "Muvattupuzha" },
  { name: "Harish Menon", phone: "9846123987", address: "Tripunithura" },
];

const SELLERS: { name: string; phone: string; address: string }[] = [
  { name: "Thomas Kurian", phone: "9847554433", address: "Palarivattom, Kochi" },
  { name: "Ramesh Babu", phone: "9895667788", address: "Kaloor, Kochi" },
  { name: "Shameer Ali", phone: "9746112233", address: "Aluva" },
  { name: "Gopika Nair", phone: "9605998877", address: "Thrissur" },
  { name: "Benny Chacko", phone: "9447223344", address: "Kottayam" },
  { name: "Hyundai Advantage Exchange", phone: "9020445566", address: "NH 66, Edappally" },
  { name: "Arun Raj", phone: "8547334455", address: "Kakkanad" },
  { name: "Sneha George", phone: "9567889900", address: "Vytilla" },
];

const VEHICLES: VehicleSeed[] = [
  { photo: "baleno", make: "Maruti Suzuki", model: "Baleno", variant: "Zeta 1.2", year: 2021, fuel: "petrol", trans: "manual", km: 28400, color: "Blue", owners: 1, reg: "KL 07 CF 4521", chassis: "MA3EWDE1S00412345", asking: 6.85, purchasedDaysAgo: 150, outcome: { kind: "sold", daysAgo: 120, discount: 0.15, paidPct: 1, buyer: 0 } },
  { photo: "creta20", make: "Hyundai", model: "Creta", variant: "SX 1.5 Diesel", year: 2020, fuel: "diesel", trans: "manual", km: 46200, color: "White", owners: 1, reg: "KL 39 K 7788", chassis: "MALC381CLLM112233", asking: 13.75, purchasedDaysAgo: 140, outcome: { kind: "sold", daysAgo: 104, discount: 0.25, paidPct: 1, buyer: 1 } },
  { photo: "nexon", make: "Tata", model: "Nexon", variant: "XZ+ Petrol", year: 2022, fuel: "petrol", trans: "manual", km: 18750, color: "Red", owners: 1, reg: "KL 07 CU 2290", chassis: "MAT627513NKA55678", asking: 9.45, purchasedDaysAgo: 128, outcome: { kind: "sold", daysAgo: 92, discount: 0.2, paidPct: 1, buyer: 2 } },
  { photo: "city19", make: "Honda", model: "City", variant: "V CVT", year: 2019, fuel: "petrol", trans: "cvt", km: 52300, color: "Silver", owners: 2, reg: "KA 03 MN 6612", chassis: "MAKGM657JKN300112", asking: 9.25, purchasedDaysAgo: 118, outcome: { kind: "sold", daysAgo: 70, discount: 0.15, paidPct: 1, buyer: 3 } },
  { photo: "seltos", make: "Kia", model: "Seltos", variant: "HTX 1.5 iVT", year: 2021, fuel: "petrol", trans: "cvt", km: 33100, color: "Grey", owners: 1, reg: "KL 41 H 9004", chassis: "MZBEN813LMN045671", asking: 14.6, purchasedDaysAgo: 96, outcome: { kind: "sold", daysAgo: 58, discount: 0.3, paidPct: 1, buyer: 4 } },
  { photo: "innova", make: "Toyota", model: "Innova Crysta", variant: "2.4 VX 7S", year: 2019, fuel: "diesel", trans: "manual", km: 88400, color: "Silver", owners: 1, reg: "KL 05 AX 1188", chassis: "MBJAA3GM40021445", asking: 18.9, purchasedDaysAgo: 82, outcome: { kind: "sold", daysAgo: 40, discount: 0.4, paidPct: 0.72, buyer: 5 } },
  { photo: "swift", make: "Maruti Suzuki", model: "Swift", variant: "VXi AMT", year: 2022, fuel: "petrol", trans: "amt", km: 15600, color: "Red", owners: 1, reg: "KL 07 DA 3321", chassis: "MA3ZSF41S00987612", asking: 6.4, purchasedDaysAgo: 60, outcome: { kind: "sold", daysAgo: "thisMonth", thisMonthOffset: 18, discount: 0.1, paidPct: 1, buyer: 6 } },
  { photo: "polo", make: "Volkswagen", model: "Polo", variant: "Highline Plus 1.0 TSI", year: 2020, fuel: "petrol", trans: "manual", km: 41250, color: "White", owners: 2, reg: "TN 09 BZ 4410", chassis: "WVWZZZ6RZLY21877", asking: 6.25, purchasedDaysAgo: 52, outcome: { kind: "sold", daysAgo: "thisMonth", thisMonthOffset: 11, discount: 0.15, paidPct: 0.6, buyer: 7 } },
  { photo: "slavia", make: "Skoda", model: "Slavia", variant: "Style 1.5 TSI DSG", year: 2023, fuel: "petrol", trans: "dct", km: 12900, color: "Grey", owners: 1, reg: "KL 07 DE 7070", chassis: "TMBJR6NJ2P8001234", asking: 15.2, purchasedDaysAgo: 34, outcome: { kind: "sold", daysAgo: "thisMonth", thisMonthOffset: 4, discount: 0.2, paidPct: 1, buyer: 8 } },
  { photo: "i20", make: "Hyundai", model: "i20", variant: "Asta (O) 1.2", year: 2021, fuel: "petrol", trans: "manual", km: 26800, color: "Blue", owners: 1, reg: "KL 43 F 5512", chassis: "MALBM51RLMM55301", asking: 7.95, purchasedDaysAgo: 30, outcome: { kind: "sold", daysAgo: "thisMonth", thisMonthOffset: 1, discount: 0.1, paidPct: 0.35, buyer: 9 } },
  { photo: "xuv300", make: "Mahindra", model: "XUV300", variant: "W8 (O) Diesel", year: 2021, fuel: "diesel", trans: "manual", km: 39400, color: "Orange", owners: 1, reg: "KL 08 BQ 6634", chassis: "MA1NE2HTXM2B41120", asking: 9.85, purchasedDaysAgo: 44, outcome: { kind: "reserved", daysAgo: 6, booking: 0.5, buyer: 10 } },
  { photo: "creta22", make: "Hyundai", model: "Creta", variant: "SX (O) 1.5 Turbo DCT", year: 2022, fuel: "petrol", trans: "dct", km: 21300, color: "Black", owners: 1, reg: "KL 07 CZ 1001", chassis: "MALC381CLNM778812", asking: 17.4, purchasedDaysAgo: 26, outcome: { kind: "reserved", daysAgo: 3, booking: 1, buyer: 11 } },
  { photo: "brezza", make: "Maruti Suzuki", model: "Brezza", variant: "ZXi Plus", year: 2023, fuel: "petrol", trans: "manual", km: 9800, color: "Brown", owners: 1, reg: "KL 40 M 2323", chassis: "MA3NYFB1S00334578", asking: 11.35, purchasedDaysAgo: 18, outcome: { kind: "reserved", daysAgo: 1, booking: 0.25, buyer: 0 } },
  { photo: "kwid", make: "Renault", model: "Kwid", variant: "RXT 1.0", year: 2020, fuel: "petrol", trans: "manual", km: 31200, color: "Orange", owners: 1, reg: "KL 07 BX 8890", chassis: "MEEBBA001L3201145", asking: 3.45, purchasedDaysAgo: 75, outcome: { kind: "available" } },
  { photo: "cityhev", make: "Honda", model: "City", variant: "ZX e:HEV", year: 2023, fuel: "hybrid", trans: "cvt", km: 14500, color: "White", owners: 1, reg: "KL 07 DF 5005", chassis: "MAKGN6S43PN100221", asking: 17.95, purchasedDaysAgo: 22, outcome: { kind: "available" } },
  { photo: "nexonev", make: "Tata", model: "Nexon EV", variant: "Max XZ+ Lux", year: 2022, fuel: "electric", trans: "automatic", km: 27600, color: "Blue", owners: 1, reg: "KL 07 CY 9191", chassis: "MAT627602NKB10022", asking: 13.25, purchasedDaysAgo: 38, outcome: { kind: "available" } },
  { photo: "sonet", make: "Kia", model: "Sonet", variant: "HTX 1.0 Turbo iMT", year: 2021, fuel: "petrol", trans: "manual", km: 30500, color: "Red", owners: 1, reg: "KL 51 E 4040", chassis: "MZBEP813LMN066121", asking: 8.95, purchasedDaysAgo: 15, outcome: { kind: "available" } },
  { photo: "dzire", make: "Maruti Suzuki", model: "Dzire", variant: "VXi CNG", year: 2022, fuel: "cng", trans: "manual", km: 48900, color: "Silver", owners: 1, reg: "KL 07 CV 3412", chassis: "MA3FJEB1S00556677", asking: 6.75, purchasedDaysAgo: 11, outcome: { kind: "available" } },
  { photo: "glanza", make: "Toyota", model: "Glanza", variant: "V AMT", year: 2022, fuel: "petrol", trans: "amt", km: 22100, color: "Grey", owners: 1, reg: "KA 51 MR 1290", chassis: "MBJB29BT400112098", asking: 7.4, purchasedDaysAgo: 8, outcome: { kind: "available" } },
  { photo: "thar", make: "Mahindra", model: "Thar", variant: "LX 4WD Diesel AT", year: 2021, fuel: "diesel", trans: "automatic", km: 36700, color: "Black", owners: 1, reg: "KL 10 AZ 7007", chassis: "MA1TA2YD3M2F10345", asking: 14.8, purchasedDaysAgo: 98, outcome: { kind: "available" } },
  { photo: "kushaq", make: "Skoda", model: "Kushaq", variant: "Ambition 1.0 TSI", year: 2022, fuel: "petrol", trans: "manual", km: 24800, color: "White", owners: 1, reg: "KL 07 DB 6160", chassis: "TMBLJ9NS1N8004410", asking: 11.6, purchasedDaysAgo: 5, outcome: { kind: "available" } },
  { photo: "venue", make: "Hyundai", model: "Venue", variant: "S(O) 1.2", year: 2020, fuel: "petrol", trans: "manual", km: 43900, color: "Grey", owners: 2, reg: "KL 17 R 3331", chassis: "MALCU41ULLM20118", asking: 7.65, purchasedDaysAgo: 2, outcome: { kind: "available" } },
];

/** Trims per model, so repeat cars differ in spec as well as year, km and numbers. `adj` scales the price. */
const VARIANTS: Record<string, { variant: string; fuel: FuelType; trans: Transmission; adj: number }[]> = {
  baleno: [{ variant: "Delta 1.2", fuel: "petrol", trans: "manual", adj: 0.92 }, { variant: "Zeta 1.2", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "Alpha 1.2 AMT", fuel: "petrol", trans: "amt", adj: 1.1 }],
  creta20: [{ variant: "S 1.5 Petrol", fuel: "petrol", trans: "manual", adj: 0.88 }, { variant: "SX 1.5 Diesel", fuel: "diesel", trans: "manual", adj: 1 }, { variant: "SX (O) 1.5 Diesel AT", fuel: "diesel", trans: "automatic", adj: 1.12 }],
  nexon: [{ variant: "XM Petrol", fuel: "petrol", trans: "manual", adj: 0.86 }, { variant: "XZ+ Petrol", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "XZA+ Diesel AMT", fuel: "diesel", trans: "amt", adj: 1.12 }],
  city19: [{ variant: "SV MT", fuel: "petrol", trans: "manual", adj: 0.9 }, { variant: "V CVT", fuel: "petrol", trans: "cvt", adj: 1 }, { variant: "ZX Diesel MT", fuel: "diesel", trans: "manual", adj: 1.08 }],
  seltos: [{ variant: "HTK 1.5 Petrol", fuel: "petrol", trans: "manual", adj: 0.85 }, { variant: "HTX 1.5 iVT", fuel: "petrol", trans: "cvt", adj: 1 }, { variant: "GTX+ 1.4 Turbo DCT", fuel: "petrol", trans: "dct", adj: 1.15 }],
  innova: [{ variant: "2.4 GX 8S", fuel: "diesel", trans: "manual", adj: 0.9 }, { variant: "2.4 VX 7S", fuel: "diesel", trans: "manual", adj: 1 }, { variant: "2.4 ZX 7S AT", fuel: "diesel", trans: "automatic", adj: 1.14 }],
  swift: [{ variant: "LXi", fuel: "petrol", trans: "manual", adj: 0.85 }, { variant: "VXi AMT", fuel: "petrol", trans: "amt", adj: 1 }, { variant: "ZXi Plus", fuel: "petrol", trans: "manual", adj: 1.1 }],
  polo: [{ variant: "Comfortline 1.0 MPI", fuel: "petrol", trans: "manual", adj: 0.88 }, { variant: "Highline Plus 1.0 TSI", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "GT 1.0 TSI AT", fuel: "petrol", trans: "automatic", adj: 1.15 }],
  slavia: [{ variant: "Active 1.0 TSI", fuel: "petrol", trans: "manual", adj: 0.82 }, { variant: "Ambition 1.0 TSI AT", fuel: "petrol", trans: "automatic", adj: 0.92 }, { variant: "Style 1.5 TSI DSG", fuel: "petrol", trans: "dct", adj: 1 }],
  i20: [{ variant: "Magna 1.2", fuel: "petrol", trans: "manual", adj: 0.86 }, { variant: "Sportz 1.2 IVT", fuel: "petrol", trans: "cvt", adj: 0.95 }, { variant: "Asta (O) 1.2", fuel: "petrol", trans: "manual", adj: 1 }],
  xuv300: [{ variant: "W6 Petrol", fuel: "petrol", trans: "manual", adj: 0.88 }, { variant: "W8 (O) Diesel", fuel: "diesel", trans: "manual", adj: 1 }, { variant: "W8 (O) Diesel AMT", fuel: "diesel", trans: "amt", adj: 1.06 }],
  creta22: [{ variant: "EX 1.5 Petrol", fuel: "petrol", trans: "manual", adj: 0.78 }, { variant: "SX 1.5 Diesel AT", fuel: "diesel", trans: "automatic", adj: 0.95 }, { variant: "SX (O) 1.5 Turbo DCT", fuel: "petrol", trans: "dct", adj: 1 }],
  brezza: [{ variant: "LXi", fuel: "petrol", trans: "manual", adj: 0.8 }, { variant: "VXi CNG", fuel: "cng", trans: "manual", adj: 0.9 }, { variant: "ZXi Plus AT", fuel: "petrol", trans: "automatic", adj: 1.08 }],
  kwid: [{ variant: "RXL 0.8", fuel: "petrol", trans: "manual", adj: 0.88 }, { variant: "RXT 1.0", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "Climber 1.0 AMT", fuel: "petrol", trans: "amt", adj: 1.1 }],
  cityhev: [{ variant: "V e:HEV", fuel: "hybrid", trans: "cvt", adj: 0.93 }, { variant: "ZX e:HEV", fuel: "hybrid", trans: "cvt", adj: 1 }],
  nexonev: [{ variant: "Prime XM", fuel: "electric", trans: "automatic", adj: 0.85 }, { variant: "Max XZ+ Lux", fuel: "electric", trans: "automatic", adj: 1 }],
  sonet: [{ variant: "HTE 1.2", fuel: "petrol", trans: "manual", adj: 0.8 }, { variant: "HTX 1.0 Turbo iMT", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "GTX+ 1.5 Diesel AT", fuel: "diesel", trans: "automatic", adj: 1.2 }],
  dzire: [{ variant: "LXi", fuel: "petrol", trans: "manual", adj: 0.86 }, { variant: "VXi CNG", fuel: "cng", trans: "manual", adj: 1 }, { variant: "ZXi AMT", fuel: "petrol", trans: "amt", adj: 1.08 }],
  glanza: [{ variant: "G MT", fuel: "petrol", trans: "manual", adj: 0.9 }, { variant: "V AMT", fuel: "petrol", trans: "amt", adj: 1 }, { variant: "S CNG", fuel: "cng", trans: "manual", adj: 0.95 }],
  thar: [{ variant: "AX (O) 4WD Diesel", fuel: "diesel", trans: "manual", adj: 0.9 }, { variant: "LX 4WD Petrol AT", fuel: "petrol", trans: "automatic", adj: 0.98 }, { variant: "LX 4WD Diesel AT", fuel: "diesel", trans: "automatic", adj: 1 }],
  kushaq: [{ variant: "Active 1.0 TSI", fuel: "petrol", trans: "manual", adj: 0.88 }, { variant: "Ambition 1.0 TSI", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "Style 1.5 TSI DSG", fuel: "petrol", trans: "dct", adj: 1.22 }],
  venue: [{ variant: "E 1.2", fuel: "petrol", trans: "manual", adj: 0.85 }, { variant: "S(O) 1.2", fuel: "petrol", trans: "manual", adj: 1 }, { variant: "SX 1.0 Turbo DCT", fuel: "petrol", trans: "dct", adj: 1.2 }],
};

/** How many extra demo cars are generated on top of the hand-written fleet above. */
export const EXTRA_DEMO_VEHICLES = 100;

/**
 * Repeats the models above with different trims, years, mileage, prices and unique registration and
 * chassis numbers. Uses its own fixed seed, so every reset produces the same cars.
 */
function extraVehicleSeeds(count: number): VehicleSeed[] {
  const rand = mulberry32(20261028);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  // Series letters skip I, O, Q and Z (Z is reserved for test registrations).
  const SERIES = "ABCDEFGHJKLMNPRSTUVWXY";
  const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  const RTO: Record<string, number[]> = { KL: [1, 2, 5, 7, 7, 7, 8, 10, 11, 13, 17, 39, 40, 41, 43, 51, 63], KA: [1, 3, 5, 51, 53], TN: [9, 10, 22, 38] };
  const usedRegs = new Set(VEHICLES.map((v) => v.reg));
  const usedChassis = new Set(VEHICLES.map((v) => v.chassis));
  const unique = (used: Set<string>, make: () => string) => {
    let value = make();
    while (used.has(value)) value = make();
    used.add(value);
    return value;
  };

  const out: VehicleSeed[] = [];
  for (let i = 0; i < count; i++) {
    const base = VEHICLES[i % VEHICLES.length];
    const spec = pick(VARIANTS[base.photo] ?? [{ variant: base.variant, fuel: base.fuel, trans: base.trans, adj: 1 }]);
    const year = Math.max(2014, Math.min(2025, base.year + int(-3, 2)));
    const age = 2026 - year;
    const km = Math.round((age * int(7000, 13500) + int(1500, 6000)) / 100) * 100;
    const state = pick(["KL", "KL", "KL", "KL", "KL", "KA", "TN"] as const);
    const reg = unique(usedRegs, () => `${state} ${String(pick(RTO[state])).padStart(2, "0")} ${pick([...SERIES])}${pick([...SERIES])} ${int(1000, 9999)}`);
    const chassis = unique(usedChassis, () => base.chassis.slice(0, 8) + Array.from({ length: 9 }, () => pick([...VIN_CHARS])).join(""));
    const asking = Math.max(2.5, Math.round(base.asking * spec.adj * (1 + 0.07 * (year - base.year)) * (0.95 + rand() * 0.1) * 20) / 20);
    const purchasedDaysAgo = int(1, 175);

    let outcome: VehicleSeed["outcome"] = { kind: "available" };
    const roll = rand();
    if (purchasedDaysAgo > 30 && roll < 0.4)
      outcome = {
        kind: "sold",
        daysAgo: int(1, purchasedDaysAgo - 7),
        discount: pick([0.05, 0.1, 0.15, 0.2, 0.25, 0.3]),
        paidPct: rand() < 0.15 ? pick([0.5, 0.6, 0.75, 0.9]) : 1,
        buyer: int(0, BUYERS.length - 1),
      };
    else if (roll < 0.48)
      outcome = { kind: "reserved", daysAgo: int(1, Math.min(12, purchasedDaysAgo)), booking: pick([0.25, 0.5, 1]), buyer: int(0, BUYERS.length - 1) };

    out.push({
      ...base,
      variant: spec.variant,
      fuel: spec.fuel,
      trans: spec.trans,
      year,
      km,
      owners: age > 7 ? int(1, 3) : age > 4 ? int(1, 2) : 1,
      reg,
      chassis,
      asking,
      purchasedDaysAgo,
      outcome,
    });
  }
  return out;
}

/** Everything that gets seeded: the hand-written cars first, then the generated repeats. */
const FLEET: VehicleSeed[] = [...VEHICLES, ...extraVehicleSeeds(EXTRA_DEMO_VEHICLES)];

const VEHICLE_EXPENSE_TEMPLATES: { category: ExpenseCategory; description: string; vendor: string; min: number; max: number }[] = [
  { category: "detailing", description: "Interior deep cleaning and exterior polish", vendor: "Shine Car Spa", min: 2500, max: 6500 },
  { category: "repair", description: "Front bumper repair and alignment", vendor: "Kochi Auto Works", min: 6000, max: 18000 },
  { category: "mechanical", description: "Service, oil change and brake pads", vendor: "Precision Motors", min: 5500, max: 16000 },
  { category: "painting", description: "Panel repaint (rear door)", vendor: "ColourTech Body Shop", min: 9000, max: 24000 },
  { category: "transportation", description: "Flatbed transport to showroom", vendor: "Kerala Towing Services", min: 1800, max: 5500 },
  { category: "documentation", description: "RC transfer and NOC processing", vendor: "RTO Agent – Babu", min: 2500, max: 7500 },
  { category: "vehicle_misc", description: "New floor mats and wiper blades", vendor: "Auto Accessories Hub", min: 1200, max: 3800 },
];

function at(date: Date, hour: number, minute = 0): string {
  return setMinutes(setHours(date, hour), minute).toISOString();
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function defaultSettings(): BusinessSettings {
  return {
    id: "business",
    showroomName: "Prestige Auto Hub",
    legalName: "Prestige Auto Hub Pvt. Ltd.",
    address: "NH 66 Bypass, Near Lulu Junction, Edappally",
    city: "Kochi, Kerala 682024",
    phone: "9847000123",
    email: "sales@prestigeautohub.in",
    gstin: "",
    logoKey: null,
    currency: "INR",
    dateFormat: "dd MMM yyyy",
    defaultInventoryView: "grid",
    receiptFooter: "Thank you for choosing Prestige Auto Hub.",
    receiptTerms:
      "Vehicle sold on an as-is-where-is basis after inspection by the buyer. RC transfer will be completed after receipt of full payment. This is a payment acknowledgement, not a tax invoice.",
    maxUploadMb: 10,
    maxPhotosPerVehicle: 20,
    storageQuotaGb: 5,
    updatedAt: new Date().toISOString(),
  };
}

export function demoUsers(nowIso: string): User[] {
  const created = subMonths(new Date(nowIso), 8).toISOString();
  const mk = (id: string, name: string, email: string, phone: string, role: User["role"], status: User["status"] = "active"): User => ({
    id, name, email, phone, role, status, createdAt: created, updatedAt: created,
  });
  return [
    mk(DEMO_USER_IDS.admin, "Arjun Menon", "arjun@prestigeautohub.in", "9847000101", "admin"),
    mk(DEMO_USER_IDS.manager, "Priya Nair", "priya@prestigeautohub.in", "9847000102", "manager"),
    mk(DEMO_USER_IDS.sales, "Rahul Varma", "rahul@prestigeautohub.in", "9847000103", "sales"),
    mk(DEMO_USER_IDS.accountant, "Divya Krishnan", "divya@prestigeautohub.in", "9847000104", "accountant"),
    mk("u-sales-faisal", "Faisal Rahman", "faisal@prestigeautohub.in", "9847000105", "sales"),
    mk("u-sales-suresh", "Suresh Kumar", "suresh@prestigeautohub.in", "9847000106", "sales", "inactive"),
  ];
}

export interface SeedOptions {
  now?: Date;
}

/** Builds the full demo dataset in memory. */
export function buildDemoData({ now = new Date() }: SeedOptions = {}) {
  const rand = mulberry32(20261027);
  // Generated cars draw from their own stream so the hand-written cars and monthly expenses stay identical.
  const extraRand = mulberry32(20261029);
  const between = (min: number, max: number, r = rand) => Math.round(min + r() * (max - min));
  const year = now.getFullYear();
  const nowIso = now.toISOString();
  const users = demoUsers(nowIso);
  const salesUsers = [DEMO_USER_IDS.sales, "u-sales-faisal", DEMO_USER_IDS.manager];

  const vehicles: Vehicle[] = [];
  const purchases: Purchase[] = [];
  const customers = new Map<number, Customer>();
  const reservations: Reservation[] = [];
  const sales: Sale[] = [];
  const payments: SalePayment[] = [];
  const expenses: Expense[] = [];
  const activity: ActivityLog[] = [];
  const counters = { PUR: 0, SAL: 0, RES: 0, RCT: 0, EXP: 0, STK: 0, QUO: 0 };
  const ref = (prefix: keyof typeof counters) => formatReference(prefix, year, ++counters[prefix]);
  const act = (a: Omit<ActivityLog, "id" | "metadata"> & { metadata?: ActivityLog["metadata"] }) =>
    activity.push({ id: newId(), metadata: {}, ...a });

  const customerFor = (i: number, when: string): Customer => {
    const existing = customers.get(i);
    if (existing) return existing;
    const b = BUYERS[i];
    const c: Customer = { id: newId(), name: b.name, phone: b.phone, address: b.address, notes: "", createdAt: when, updatedAt: when };
    customers.set(i, c);
    return c;
  };

  const monthStart = startOfMonth(now);
  const daysIntoMonth = Math.max(0, Math.floor((now.getTime() - monthStart.getTime()) / 86_400_000));

  FLEET.forEach((s, idx) => {
    const rng = idx < VEHICLES.length ? rand : extraRand;
    const purchaseDate = subDays(now, s.purchasedDaysAgo);
    const created = at(purchaseDate, 10 + (idx % 6), (idx * 7) % 60);
    const vehicleId = newId();
    const purchaseId = newId();
    const askingPaise = L(s.asking);
    const purchasePaise = Math.round((askingPaise * (0.83 + rng() * 0.05)) / 100_000) * 100_000; // round to ₹1,000
    const seller = SELLERS[idx % SELLERS.length];
    const fullyPaid = idx % 7 !== 3;
    const stockNumber = `STK-${String(++counters.STK).padStart(4, "0")}`;

    const vehicle: Vehicle = {
      id: vehicleId,
      stockNumber,
      purchaseId,
      make: s.make,
      model: s.model,
      variant: s.variant,
      year: s.year,
      registrationNumber: s.reg,
      chassisNumber: s.chassis,
      engineNumber: "",
      fuelType: s.fuel,
      transmission: s.trans,
      mileageKm: s.km,
      // Match the colour shown in the real demo photos.
      color: s.color,
      previousOwners: s.owners,
      askingPricePaise: askingPaise,
      status: "available",
      coverImageId: null,
      notes: idx % 4 === 0 ? "Single owner, full service history available." : "",
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
    };
    const purchase: Purchase = {
      id: purchaseId,
      reference: ref("PUR"),
      vehicleId,
      sellerName: seller.name,
      sellerContact: seller.phone,
      sellerAddress: seller.address,
      sellerNotes: "",
      purchaseDate: iso(purchaseDate),
      purchasePricePaise: purchasePaise,
      amountPaidPaise: fullyPaid ? purchasePaise : Math.round((purchasePaise * 0.7) / 100_000) * 100_000,
      paymentMethod: (["bank_transfer", "upi", "cheque", "bank_transfer"] as PaymentMethod[])[idx % 4],
      paymentReference: idx % 2 === 0 ? `UTR${String(40213377 + idx * 917)}` : "",
      notes: "",
      status: "active",
      createdBy: idx % 3 === 0 ? DEMO_USER_IDS.admin : DEMO_USER_IDS.manager,
      cancelledAt: null,
      cancelReason: "",
      createdAt: created,
      updatedAt: created,
    };

    act({ actorId: purchase.createdBy, entityType: "purchase", entityId: purchaseId, action: "purchase.created", timestamp: created,
      description: `Purchased ${s.year} ${s.make} ${s.model} (${s.reg}) from ${seller.name}`, href: `/purchases/${purchaseId}`,
      metadata: { sensitive: true, financial: [{ label: "Purchase price", after: purchasePaise }] } });
    act({ actorId: purchase.createdBy, entityType: "vehicle", entityId: vehicleId, action: "vehicle.created", timestamp: at(purchaseDate, 17, idx),
      description: `Added ${s.year} ${s.make} ${s.model} to stock as ${stockNumber}`, href: `/inventory/${vehicleId}` });

    // Vehicle-specific reconditioning expenses (most cars get 1–3).
    const expenseCount = idx % 5 === 4 ? 0 : 1 + (idx % 3);
    for (let e = 0; e < expenseCount; e++) {
      const t = VEHICLE_EXPENSE_TEMPLATES[(idx + e * 2) % VEHICLE_EXPENSE_TEMPLATES.length];
      const date = addDays(purchaseDate, Math.min(s.purchasedDaysAgo, 1 + e * 3));
      const amount = Math.round(between(t.min, t.max, rng) / 50) * 50 * 100;
      const exp: Expense = {
        id: newId(), reference: ref("EXP"), vehicleId, category: t.category, amountPaise: amount, date: iso(date),
        description: t.description, vendor: t.vendor, paymentMethod: e % 2 ? "cash" : "upi", notes: "",
        createdBy: DEMO_USER_IDS.accountant, createdAt: at(date, 12, e * 10), updatedAt: at(date, 12, e * 10),
      };
      expenses.push(exp);
      act({ actorId: exp.createdBy, entityType: "expense", entityId: exp.id, action: "expense.created", timestamp: exp.createdAt,
        description: `Recorded ${EXPENSE_CATEGORY_LABELS[t.category].toLowerCase()} expense for ${s.make} ${s.model} (${s.reg}): ${t.description}`,
        href: `/inventory/${vehicleId}`, metadata: { sensitive: true, financial: [{ label: "Amount", after: amount }] } });
    }

    const o = s.outcome;
    if (o.kind === "reserved") {
      const rDate = subDays(now, o.daysAgo);
      const c = customerFor(o.buyer, at(rDate, 11));
      const r: Reservation = {
        id: newId(), reference: ref("RES"), vehicleId, customerId: c.id, reservationDate: iso(rDate),
        bookingAmountPaise: L(o.booking), bookingMethod: "upi", bookingReference: `UPI${312000 + idx * 37}`, status: "active",
        notes: "Customer arranging bank loan; expected to close within 10 days.", createdBy: DEMO_USER_IDS.sales,
        saleId: null, cancelledAt: null, cancelReason: "", createdAt: at(rDate, 11, 30), updatedAt: at(rDate, 11, 30),
      };
      reservations.push(r);
      vehicle.status = "reserved";
      act({ actorId: r.createdBy, entityType: "reservation", entityId: r.id, action: "reservation.created", timestamp: r.createdAt,
        description: `Reserved ${s.make} ${s.model} (${s.reg}) for ${c.name} with booking of ${formatINR(r.bookingAmountPaise)}`,
        href: `/inventory/${vehicleId}` });
    }

    if (o.kind === "sold") {
      const sDate =
        o.daysAgo === "thisMonth" ? subDays(now, Math.min(o.thisMonthOffset ?? 0, daysIntoMonth)) : subDays(now, o.daysAgo);
      const c = customerFor(o.buyer, at(sDate, 15));
      const salePrice = askingPaise - L(o.discount);
      const soldBy = salesUsers[idx % salesUsers.length];
      const sale: Sale = {
        id: newId(), reference: ref("SAL"), vehicleId, customerId: c.id, reservationId: null, saleDate: iso(sDate),
        salePricePaise: salePrice, status: "completed", notes: "", soldBy, cancelledAt: null, cancelReason: "",
        createdAt: at(sDate, 15, 20), updatedAt: at(sDate, 15, 20),
      };
      sales.push(sale);
      vehicle.status = "sold";
      act({ actorId: soldBy, entityType: "sale", entityId: sale.id, action: "sale.completed", timestamp: sale.createdAt,
        description: `Sold ${s.make} ${s.model} (${s.reg}) to ${c.name} for ${formatINR(salePrice)}`, href: `/sales/${sale.id}` });

      const target = Math.round((salePrice * o.paidPct) / 100_000) * 100_000;
      const split = o.paidPct === 1 && idx % 2 === 0 ? [0.3, 0.7] : [1];
      let paid = 0;
      split.forEach((fraction, i) => {
        const amount = i === split.length - 1 ? target - paid : Math.round((target * fraction) / 100_000) * 100_000;
        paid += amount;
        const pDate = i === 0 ? sDate : addDays(sDate, Math.min(5, Math.max(0, Math.floor((now.getTime() - sDate.getTime()) / 86_400_000))));
        const p: SalePayment = {
          id: newId(), saleId: sale.id, receiptNumber: ref("RCT"), amountPaise: amount, date: iso(pDate),
          method: i === 0 ? "upi" : "bank_transfer", reference: i === 0 ? `UPI${780000 + idx * 13}` : `NEFT${5501200 + idx * 71}`,
          notes: i === 0 ? "Payment at sale" : "Balance payment", kind: "payment", recordedBy: i === 0 ? soldBy : DEMO_USER_IDS.accountant,
          createdAt: at(pDate, 16, 5 + i), updatedAt: at(pDate, 16, 5 + i),
        };
        payments.push(p);
        act({ actorId: p.recordedBy, entityType: "payment", entityId: p.id, action: "payment.recorded", timestamp: p.createdAt,
          description: `Received ${formatINR(amount)} from ${c.name} against ${sale.reference}`, href: `/sales/${sale.id}` });
      });
    }

    vehicles.push(vehicle);
    purchases.push(purchase);
  });

  // A reservation that was released, to demonstrate history.
  {
    const v = vehicles.find((x) => x.registrationNumber === "KL 07 BX 8890");
    if (v) {
      const rDate = subDays(now, 30);
      const c = customerFor(7, at(rDate, 10));
      const r: Reservation = {
        id: newId(), reference: ref("RES"), vehicleId: v.id, customerId: c.id, reservationDate: iso(rDate),
        bookingAmountPaise: 0, bookingMethod: "cash", bookingReference: "", status: "cancelled", notes: "",
        createdBy: DEMO_USER_IDS.sales, saleId: null, cancelledAt: at(addDays(rDate, 4), 12), cancelReason: "Buyer chose a different model",
        createdAt: at(rDate, 10, 15), updatedAt: at(addDays(rDate, 4), 12),
      };
      reservations.push(r);
      act({ actorId: r.createdBy, entityType: "reservation", entityId: r.id, action: "reservation.created", timestamp: r.createdAt,
        description: `Reserved Renault Kwid (${v.registrationNumber}) for ${c.name}`, href: `/inventory/${v.id}` });
      act({ actorId: DEMO_USER_IDS.manager, entityType: "reservation", entityId: r.id, action: "reservation.cancelled", timestamp: r.cancelledAt!,
        description: `Released reservation of Renault Kwid for ${c.name}`, href: `/inventory/${v.id}`,
        metadata: { changes: [{ field: "Reason", after: r.cancelReason }] } });
    }
  }

  // General showroom expenses for the last six months.
  for (let m = 5; m >= 0; m--) {
    const monthDate = startOfMonth(subMonths(now, m));
    const general: { category: ExpenseCategory; description: string; vendor: string; amount: number; day: number }[] = [
      { category: "rent", description: "Showroom rent", vendor: "Edappally Commercial Properties", amount: 85000, day: 3 },
      { category: "salary", description: "Staff salaries", vendor: "Payroll", amount: 240000, day: 1 },
      { category: "utilities", description: "Electricity and water", vendor: "KSEB", amount: between(9000, 14500), day: 10 },
      { category: "marketing", description: m % 2 ? "OLX & CarWale featured listings" : "Instagram and Facebook ads", vendor: m % 2 ? "CarWale" : "Meta", amount: between(12000, 28000), day: 12 },
      { category: "office", description: "Stationery, printing and tea", vendor: "Local vendors", amount: between(2500, 6000), day: 18 },
    ];
    if (m % 2 === 0) general.push({ category: "maintenance", description: "Yard lighting and CCTV maintenance", vendor: "SecureView Systems", amount: between(4000, 9000), day: 21 });
    if (m === 2) general.push({ category: "general_misc", description: "Diwali customer gifts", vendor: "Kochi Gift House", amount: 18500, day: 24 });
    for (const g of general) {
      const date = addDays(monthDate, g.day - 1);
      if (date > now) continue;
      const exp: Expense = {
        id: newId(), reference: ref("EXP"), vehicleId: null, category: g.category, amountPaise: g.amount * 100, date: iso(date),
        description: g.description, vendor: g.vendor, paymentMethod: g.category === "salary" ? "bank_transfer" : "upi", notes: "",
        createdBy: DEMO_USER_IDS.accountant, createdAt: at(date, 11), updatedAt: at(date, 11),
      };
      expenses.push(exp);
      act({ actorId: exp.createdBy, entityType: "expense", entityId: exp.id, action: "expense.created", timestamp: exp.createdAt,
        description: `Recorded ${EXPENSE_CATEGORY_LABELS[g.category].toLowerCase()} expense: ${g.description}`, href: "/expenses",
        metadata: { sensitive: true, financial: [{ label: "Amount", after: exp.amountPaise }] } });
    }
  }

  // A few price quotes for cars still in stock: open, accepted-in-principle and declined.
  const quotes: Quote[] = [];
  const quoteBuyers = [
    { name: "Rahul Menon", phone: "9846012345", address: "Kakkanad, Kochi", days: 2, status: "open" },
    { name: "Sneha Varghese", phone: "9895023456", address: "Aluva", days: 5, status: "open" },
    { name: "Arjun Nair", phone: "9744034567", address: "Thrissur", days: 9, status: "open" },
    { name: "Fathima Rasheed", phone: "9633045678", address: "Kaloor, Kochi", days: 14, status: "declined" },
    { name: "Vishnu Prasad", phone: "9567056789", address: "Kottayam", days: 21, status: "open" },
  ] as const;
  vehicles
    .filter((v) => v.status === "available")
    .slice(0, quoteBuyers.length)
    .forEach((v, i) => {
      const b = quoteBuyers[i];
      const qDate = subDays(now, b.days);
      const q: Quote = {
        id: newId(), reference: ref("QUO"), vehicleId: v.id, customerName: b.name, customerPhone: b.phone, customerAddress: b.address,
        quoteDate: iso(qDate), validUntil: iso(addDays(qDate, 15)), vehiclePricePaise: v.askingPricePaise,
        extras: [
          { description: "Ownership transfer (RTO)", amountPaise: 4500_00 },
          ...(i % 2 === 0 ? [{ description: "Comprehensive insurance, 1 year", amountPaise: 18500_00 }] : []),
        ],
        discountPaise: i % 3 === 0 ? 10000_00 : 0, notes: i === 1 ? "Buyer wants a new set of tyres before delivery." : "",
        status: b.status, saleId: null, createdBy: i % 2 ? "u-sales-faisal" : DEMO_USER_IDS.sales,
        createdAt: at(qDate, 12, 10), updatedAt: at(qDate, 12, 10),
      };
      quotes.push(q);
      act({ actorId: q.createdBy, entityType: "quote", entityId: q.id, action: "quote.created", timestamp: q.createdAt,
        description: `Quoted ${v.make} ${v.model} (${v.registrationNumber}) to ${b.name}`, href: `/quote/${q.id}` });
    });

  const counterRows = Object.entries(counters).map(([k, value]) => ({ key: k === "STK" ? "STK" : `${k}-${year}`, value }));

  return {
    users,
    vehicles,
    purchases,
    customers: [...customers.values()],
    reservations,
    sales,
    salePayments: payments,
    quotes,
    expenses,
    activity,
    settings: [defaultSettings()],
    counters: counterRows,
  };
}

export async function seedDatabase(db: DealerDatabase, opts: SeedOptions = {}) {
  const data = buildDemoData(opts);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.users.bulkAdd(data.users);
    await db.vehicles.bulkAdd(data.vehicles);
    await db.purchases.bulkAdd(data.purchases);
    await db.customers.bulkAdd(data.customers);
    await db.reservations.bulkAdd(data.reservations);
    await db.sales.bulkAdd(data.sales);
    await db.salePayments.bulkAdd(data.salePayments);
    await db.quotes.bulkAdd(data.quotes);
    await db.expenses.bulkAdd(data.expenses);
    await db.activity.bulkAdd(data.activity);
    await db.settings.bulkAdd(data.settings);
    await db.counters.bulkAdd(data.counters);
    await db.meta.put({ key: "seededAt", value: new Date().toISOString() });
  });
}
