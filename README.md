# DealerOS

**Used-car showroom management by Duoph Technologies — Phase 1 (single showroom).**

DealerOS handles vehicle purchasing, inventory and photos, reservations, sales and payments,
showroom and vehicle expenses, per-vehicle profitability, reports, staff roles and an activity log.

> **Demo mode.** This build runs entirely in the browser. Data (including photos) is stored in
> IndexedDB on the current device, and sign-in is a persona picker with no passwords. It is **not**
> production-ready — see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose a demo employee. Sample data (22 vehicles, sales, payments,
expenses, activity) is created on first load and persists across refreshes.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm test` | Vitest unit + workflow tests (uses `fake-indexeddb`) |
| `npm run check` | typecheck + lint + tests |

## Demo personas

| Persona | Role | Sees |
| --- | --- | --- |
| Arjun Menon | Admin / Owner | Everything, incl. staff and settings |
| Priya Nair | Manager | Operations, purchasing, pricing, profit — no staff/settings |
| Rahul Varma | Sales Staff | Stock, photos, reservations, own sales, receipts — **no cost or profit** |
| Divya Krishnan | Accountant | Payments, expenses, reports, exports — cannot edit vehicles |

Switch persona any time from the profile menu (top right). Settings → Demo data lets you export/import
a backup, restore sample data, or clear data.

## Architecture

```
app/                     Routes (App Router). (app)/ uses the authenticated AppShell; /receipt is print-only.
components/ui/           Radix-based primitives (shadcn-style)
components/layout/       AppShell, Sidebar, Topbar, global search (⌘K)
components/shared/       DataTable, StatCard, StatusBadge, CurrencyInput, ConfirmDialog, FinancialValue, RoleGuard…
features/<module>/       Screens and module components (dashboard, inventory, purchases, sales, expenses, reports, users, activity, settings)
lib/db/                  Dexie schema, demo seed, backup/import
lib/repositories/        Persistence contracts (DealerCommands, ImageStorage) — the swap point for a real backend
lib/services/            IndexedDB implementation of DealerCommands (atomic transactions + activity log)
lib/calculations/        Pure finance maths, selectors and state-transition rules
lib/permissions/         Central role → permission map and route guard
lib/validation/          Zod schemas shared by forms and services
lib/images/              Client-side resize/compress (WebP/JPEG), placeholder generator, blob storage
tests/                   Vitest suites
```

Key rules:

- **Money is integer paise** everywhere; rupees only exist at the input/display boundary.
- **Derived, not duplicated:** amount received, balance and payment status are computed from payment
  records; landed cost and profit from purchase + vehicle expenses.
- **Gross profit = sale price − purchase price − vehicle-specific expenses.** General showroom expenses
  are reported separately and never reduce per-car profit.
- Every business command (purchase, reserve, sell, pay, expense, user change…) runs in one IndexedDB
  transaction, checks permissions, validates with Zod and writes an activity entry — or changes nothing.
- Vehicle lifecycle: `available → reserved → sold`; a reserved car can only be sold via its own
  reservation; a vehicle can never have two completed sales; cancellations keep history.
- Photos are validated, resized to 1600px (480px thumbnails), compressed to WebP/JPEG and stored as
  Blobs in IndexedDB with ref-counted object URLs.
- Demo vehicles use real, freely-licensed photos from Wikimedia Commons bundled in `public/demo-cars`
  (credits in `public/demo-cars/CREDITS.md` and under each photo in the gallery). They are representative
  photos of the model, not the actual demo cars. If a file can't load, a labelled placeholder is generated.
  Browsers seeded with the older placeholder art are upgraded automatically on next load.

### Connecting a backend

Screens call `dealerService` (implements `DealerCommands`) for writes and read a shared `Dataset`
from `DataProvider`. To move to Cloudflare D1/PostgreSQL + R2: implement `DealerCommands` as API
calls, replace `DataProvider`'s IndexedDB live query with server queries that return **role-filtered**
data, and implement `ImageStorage` with signed R2 uploads. Business rules in `lib/calculations` and
schemas in `lib/validation` are framework-free and can run on the server unchanged.
