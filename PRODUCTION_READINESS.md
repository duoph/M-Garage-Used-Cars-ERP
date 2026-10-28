# Production readiness

DealerOS Phase 1 is a **client-side demo**. It must not hold real customer or financial data until
the items below are done. Nothing here is solved by the current build.

## 1. Secure authentication
- Replace the persona picker (`features/auth`, `lib/store/session.ts`) with real sign-in (e.g. email +
  password with hashing on the server, or an identity provider), invitations and password reset.
- Server-issued, httpOnly, secure session cookies; session expiry and revocation on deactivation.
- No credentials or secrets in client code.

## 2. Server-side role enforcement
- `lib/permissions` currently only shapes the UI. Every API endpoint must re-check the role.
- **Do not send restricted data to the browser.** Today the full dataset (incl. purchase prices and
  profit) is loaded client-side and hidden by the UI. In production, queries for Sales Staff must
  omit purchase cost, landed cost, profit, internal expenses and other users' sales entirely —
  including in search results, exports and receipts.
- Exports must be generated server-side from role-filtered queries.

## 3. Cloud database
- Move `lib/db` (IndexedDB/Dexie) to Cloudflare D1 or PostgreSQL with proper schema, foreign keys,
  unique constraints (normalised registration number, chassis number), and migrations.
- Keep integer paise columns; keep business-date vs timestamp distinction.
- Implement `DealerCommands` (`lib/repositories/contracts.ts`) as server handlers reusing
  `lib/validation` and `lib/calculations`.

## 4. Object storage
- Move photos from IndexedDB Blobs to Cloudflare R2 via signed upload URLs; implement `ImageStorage`.
- Server-side validation of type/size, image re-encoding, and quota tracking against the 5 GB
  allowance (`BusinessSettings.storageQuotaGb`). Private bucket with signed read URLs or a CDN policy.

## 5. Multi-user consistency
- Browser transactions only protect a single device. Production needs database transactions,
  row-level locking or optimistic concurrency (version columns) so two staff cannot sell or reserve
  the same vehicle simultaneously, and idempotency keys on payment/sale submissions.
- Reference numbers (PUR/SAL/RCT/EXP) must come from database sequences, not per-browser counters.

## 6. Backups and recovery
- Automated database backups with point-in-time recovery, R2 object versioning, documented restore
  drills. The JSON export in Settings is a demo convenience, not a backup strategy.

## 7. Production audit logging
- Activity entries are currently written by the client and can be cleared. Production audit logs must
  be written server-side in the same transaction as the change, be append-only, include actor, IP/
  device and before/after values for financial fields, and be retained per policy.

## 8. Deployment and monitoring
- CI running `npm run check` and `npm run build`; preview and production environments.
- Error tracking, uptime checks, structured logs, rate limiting, security headers/CSP.
- Data protection review (customer phone numbers and addresses are personal data under India's
  DPDP Act): consent, retention and access controls.

## 9. Demo content
- Remove the bundled Wikimedia demo photos (`public/demo-cars`, `lib/images/demo-photos.ts`) and the demo
  seed before go-live; real listings must use the showroom's own photos.

## 10. Not in Phase 1 (by design)
GST tax invoices, RTO/insurance integrations, CRM, WhatsApp automation, multi-branch, public listings.
Receipts are payment acknowledgements, not tax invoices.
