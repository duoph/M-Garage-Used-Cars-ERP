# DealerOS

**Used-car showroom management by Duoph Technologies — Phase 1 (single showroom).**

DealerOS handles vehicle purchasing, inventory and photos, reservations, sales and payments,
showroom and vehicle expenses, per-vehicle profitability, reports, staff roles and an activity log.

> **Local mode.** Business records are stored in IndexedDB on the current device, new vehicle photos
> go to Cloudflare R2 when configured, and sign-in is an account picker with no passwords. It is **not**
> production-ready — see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in what you use (Cloudflare R2 for photos, Supabase
later). Open http://localhost:3000 and sign in as **Owner**. The app starts as a blank showroom with
that one admin account: set the showroom profile in Settings and add staff from the Staff page.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm test` | Vitest unit + workflow tests (uses `fake-indexeddb`) |
| `npm run check` | typecheck + lint + tests |

## Roles

| Role | Sees |
| --- | --- |
| Admin / Owner | Everything, incl. staff and settings |
| Manager | Operations, purchasing, pricing, profit — no staff/settings |
| Sales Staff | Stock, photos, reservations, own sales, receipts — **no cost or profit** |
| Accountant | Payments, expenses, reports, exports — cannot edit vehicles |

Switch account from the profile menu (top right). Settings → Data & backups lets you export/import a
backup or clear business data.

## Architecture

```
app/                     Routes (App Router). (app)/ uses the authenticated AppShell; /receipt is print-only.
components/ui/           Radix-based primitives (shadcn-style)
components/layout/       AppShell, Sidebar, Topbar, global search (⌘K)
components/shared/       DataTable, StatCard, StatusBadge, CurrencyInput, ConfirmDialog, FinancialValue, RoleGuard…
features/<module>/       Screens and module components (dashboard, inventory, purchases, sales, expenses, reports, users, activity, settings)
lib/db/                  Dexie schema, first-run bootstrap, backup/import
lib/repositories/        Persistence contracts (DealerCommands, ImageStorage) — the swap point for a real backend
lib/services/            IndexedDB implementation of DealerCommands (atomic transactions + activity log)
lib/calculations/        Pure finance maths, selectors and state-transition rules
lib/permissions/         Central role → permission map and route guard
lib/validation/          Zod schemas shared by forms and services
lib/images/              Client-side resize/compress (WebP/JPEG), IndexedDB and R2 image storage
lib/server/              Server-only Cloudflare R2 access (presigned uploads, signed reads, usage)
lib/supabase/            Supabase browser/server clients (inactive until env vars are set)
app/api/                 Route handlers: /uploads, /images, /storage
tests/                   Vitest suites; tests/fixtures/demo-seed.ts is the sample showroom they run against
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
- Photos are validated, resized to 1600px (480px thumbnails) and compressed to WebP/JPEG in the browser.
  With `NEXT_PUBLIC_IMAGE_STORAGE=r2` they upload straight to R2 (`car-images/<vehicleId>/`) via presigned
  URLs; otherwise they are stored as Blobs in IndexedDB.

### Connecting a backend

Screens call `dealerService` (implements `DealerCommands`) for writes and read a shared `Dataset`
from `DataProvider`. To move to Supabase (Postgres + Auth): add the schema under
`supabase/migrations`, implement `DealerCommands` with `lib/supabase`, and replace `DataProvider`'s
IndexedDB live query with server queries that return **role-filtered** data (row-level security). Business rules in `lib/calculations` and
schemas in `lib/validation` are framework-free and can run on the server unchanged.
