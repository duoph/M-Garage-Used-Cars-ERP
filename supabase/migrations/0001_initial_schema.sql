-- =============================================================================
-- M Garage / DealerOS — initial Supabase schema
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run once on an empty project.
--
-- Conventions (mirrors types/index.ts):
--   * Money is integer paise in BIGINT columns (₹1 = 100 paise). Never floats.
--   * Business dates are DATE; timestamps are TIMESTAMPTZ.
--   * IDs are UUIDs; human references (PUR-2026-0001) are separate text columns.
-- =============================================================================

create extension if not exists pgcrypto;

-- ─── Enums ───────────────────────────────────────────────────────────────────
create type user_role          as enum ('admin','manager','office','sales','accountant');
create type user_status        as enum ('active','inactive');
create type vehicle_status     as enum ('available','reserved','sold','returned_inspection','returned_to_supplier');
create type fuel_type          as enum ('petrol','diesel','cng','electric','hybrid');
create type transmission_type  as enum ('manual','automatic','amt','cvt','dct');
create type payment_method     as enum ('cash','upi','bank_transfer','cheque','card','finance');
create type purchase_status    as enum ('active','cancelled');
create type reservation_status as enum ('active','converted','cancelled');
create type sale_status        as enum ('completed','cancelled');
create type return_status      as enum ('none','partial','returned');
create type expense_category   as enum (
  'repair','mechanical','painting','detailing','transportation','documentation','vehicle_misc',
  'rent','utilities','salary','marketing','office','maintenance','general_misc');
create type account_kind       as enum ('cash','bank','owner','finance');
create type voucher_type       as enum ('receipt','payment','contra');
create type voucher_status     as enum ('active','cancelled');
create type document_kind      as enum (
  'id_proof','address_proof','pan_card','sale_letter','delivery_note','rc','insurance','puc','noc','form_29_30','other');
create type document_owner     as enum ('vehicle','purchase','sale');
create type ledger_source      as enum (
  'opening','sale_payment','booking','finance_settlement','purchase_payment','expense','voucher',
  'sales_refund','finance_adjustment','purchase_refund');
create type money_direction    as enum ('in','out');

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─── Branches ────────────────────────────────────────────────────────────────
create table branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  address     text not null default '',
  phone       text not null default '',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Users (staff profiles; linked to Supabase Auth) ─────────────────────────
create table users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         text not null unique,
  phone         text not null default '',
  role          user_role not null default 'sales',
  status        user_status not null default 'active',
  designation   text,
  permissions   text[],                 -- null = role defaults
  branch_id     uuid references branches(id),
  all_branches  boolean,                -- null = role default
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Customers ───────────────────────────────────────────────────────────────
create table customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null default '',
  address     text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_phone_idx on customers (phone);

-- ─── Vehicles & purchases (circular link: FKs added below) ───────────────────
create table vehicles (
  id                   uuid primary key default gen_random_uuid(),
  stock_number         text not null unique,
  purchase_id          uuid not null,
  make                 text not null,
  model                text not null,
  variant              text not null default '',
  year                 int  not null check (year between 1950 and 2100),
  registration_number  text not null default '',
  chassis_number       text not null default '',
  engine_number        text not null default '',
  fuel_type            fuel_type not null,
  transmission         transmission_type not null,
  mileage_km           int not null default 0 check (mileage_km >= 0),
  color                text not null default '',
  previous_owners      int not null default 0 check (previous_owners >= 0),
  asking_price_paise   bigint not null default 0 check (asking_price_paise >= 0),
  status               vehicle_status not null default 'available',
  cover_image_id       uuid,
  notes                text not null default '',
  archived_at          timestamptz,
  papers               jsonb,           -- VehiclePapers
  branch_id            uuid references branches(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Normalised uniqueness for active stock (ignores blanks and archived cars).
create unique index vehicles_reg_no_uniq on vehicles (upper(regexp_replace(registration_number, '[^A-Za-z0-9]', '', 'g')))
  where registration_number <> '' and archived_at is null;
create unique index vehicles_chassis_uniq on vehicles (upper(chassis_number))
  where chassis_number <> '' and archived_at is null;
create index vehicles_status_idx  on vehicles (status);
create index vehicles_branch_idx  on vehicles (branch_id);
create index vehicles_created_idx on vehicles (created_at);

create table purchases (
  id                     uuid primary key default gen_random_uuid(),
  reference              text not null unique,
  vehicle_id             uuid not null,
  seller_name            text not null,
  seller_contact         text not null default '',
  seller_address         text not null default '',
  seller_notes           text not null default '',
  purchase_date          date not null,
  purchase_price_paise   bigint not null check (purchase_price_paise >= 0),
  amount_paid_paise      bigint not null default 0 check (amount_paid_paise >= 0),
  payment_method         payment_method not null,
  payment_reference      text not null default '',
  notes                  text not null default '',
  status                 purchase_status not null default 'active',
  created_by             uuid not null references users(id),
  cancelled_at           timestamptz,
  cancel_reason          text not null default '',
  branch_id              uuid references branches(id),
  returned_paise         bigint not null default 0,
  refund_received_paise  bigint not null default 0,
  return_status          return_status not null default 'none',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index purchases_vehicle_idx on purchases (vehicle_id);
create index purchases_date_idx    on purchases (purchase_date);
create index purchases_branch_idx  on purchases (branch_id);

alter table vehicles  add constraint vehicles_purchase_fk
  foreign key (purchase_id) references purchases(id) deferrable initially deferred;
alter table purchases add constraint purchases_vehicle_fk
  foreign key (vehicle_id) references vehicles(id) deferrable initially deferred;

-- ─── Vehicle images ──────────────────────────────────────────────────────────
create table vehicle_images (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references vehicles(id) on delete cascade,
  storage_key     text not null,
  thumb_key       text not null default '',
  mime_type       text not null,
  size            int not null default 0,
  width           int not null default 0,
  height          int not null default 0,
  "order"         int not null default 0,
  is_cover        boolean not null default false,
  is_placeholder  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index vehicle_images_vehicle_idx on vehicle_images (vehicle_id, "order");

alter table vehicles add constraint vehicles_cover_image_fk
  foreign key (cover_image_id) references vehicle_images(id) on delete set null deferrable initially deferred;

-- ─── Money accounts ──────────────────────────────────────────────────────────
create table accounts (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  kind                   account_kind not null,
  bank_name              text not null default '',
  account_number         text not null default '',
  ifsc                   text not null default '',
  upi_id                 text not null default '',
  custodian_id           uuid references users(id),
  opening_balance_paise  bigint not null default 0,
  opening_date           date not null default current_date,
  is_default             boolean not null default false,
  archived               boolean not null default false,
  notes                  text not null default '',
  branch_id              uuid references branches(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index accounts_kind_idx   on accounts (kind);
create index accounts_branch_idx on accounts (branch_id);

-- ─── Purchase payments ───────────────────────────────────────────────────────
create table purchase_payments (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references purchases(id) on delete cascade,
  number        text not null,
  date          date not null,
  method        payment_method not null,
  amount_paise  bigint not null check (amount_paise > 0),
  account_id    uuid not null references accounts(id),
  reference     text not null default '',
  notes         text not null default '',
  kind          text not null check (kind in ('at_purchase','payment')),
  recorded_by   uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index purchase_payments_purchase_idx on purchase_payments (purchase_id);
create index purchase_payments_date_idx     on purchase_payments (date);

-- ─── Reservations ────────────────────────────────────────────────────────────
create table reservations (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  vehicle_id            uuid not null references vehicles(id),
  customer_id           uuid not null references customers(id),
  reservation_date      date not null,
  booking_amount_paise  bigint not null default 0 check (booking_amount_paise >= 0),
  booking_method        payment_method not null,
  booking_reference     text not null default '',
  status                reservation_status not null default 'active',
  notes                 text not null default '',
  created_by            uuid not null references users(id),
  sale_id               uuid,
  cancelled_at          timestamptz,
  cancel_reason         text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index reservations_vehicle_idx  on reservations (vehicle_id);
create index reservations_customer_idx on reservations (customer_id);
-- Only one active reservation per car.
create unique index reservations_one_active on reservations (vehicle_id) where status = 'active';

-- ─── Sales ───────────────────────────────────────────────────────────────────
create table sales (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  vehicle_id              uuid not null references vehicles(id),
  customer_id             uuid not null references customers(id),
  reservation_id          uuid references reservations(id),
  sale_date               date not null,
  sale_price_paise        bigint not null check (sale_price_paise >= 0),
  status                  sale_status not null default 'completed',
  notes                   text not null default '',
  sold_by                 uuid not null references users(id),
  cancelled_at            timestamptz,
  cancel_reason           text not null default '',
  branch_id               uuid references branches(id),
  returned_paise          bigint not null default 0,
  refunded_paise          bigint not null default 0,
  finance_adjusted_paise  bigint not null default 0,
  return_status           return_status not null default 'none',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index sales_vehicle_idx  on sales (vehicle_id);
create index sales_customer_idx on sales (customer_id);
create index sales_date_idx     on sales (sale_date);
create index sales_branch_idx   on sales (branch_id);
-- Only one completed sale per car.
create unique index sales_one_completed on sales (vehicle_id) where status = 'completed';

alter table reservations add constraint reservations_sale_fk
  foreign key (sale_id) references sales(id) deferrable initially deferred;

-- ─── Sale payments ───────────────────────────────────────────────────────────
create table sale_payments (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references sales(id) on delete cascade,
  receipt_number      text not null,
  amount_paise        bigint not null check (amount_paise > 0),
  date                date not null,
  method              payment_method not null,
  reference           text not null default '',
  notes               text not null default '',
  kind                text not null check (kind in ('booking','payment')),
  recorded_by         uuid not null references users(id),
  account_id          uuid references accounts(id),
  received_by         uuid references users(id),
  lender_name         text not null default '',
  loan_reference      text not null default '',
  adjusted_paise      bigint not null default 0,
  settled_on          date,
  settled_account_id  uuid references accounts(id),
  settled_reference   text not null default '',
  settled_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index sale_payments_sale_idx    on sale_payments (sale_id);
create index sale_payments_date_idx    on sale_payments (date);
create index sale_payments_account_idx on sale_payments (account_id);

-- ─── Expenses ────────────────────────────────────────────────────────────────
create table expenses (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  vehicle_id         uuid references vehicles(id),
  category           expense_category not null,
  amount_paise       bigint not null check (amount_paise > 0),
  date               date not null,
  description        text not null default '',
  vendor             text not null default '',
  payment_method     payment_method not null,
  notes              text not null default '',
  created_by         uuid not null references users(id),
  account_id         uuid references accounts(id),
  payment_reference  text not null default '',
  branch_id          uuid references branches(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index expenses_vehicle_idx  on expenses (vehicle_id);
create index expenses_date_idx     on expenses (date);
create index expenses_category_idx on expenses (category);
create index expenses_branch_idx   on expenses (branch_id);

-- ─── Vouchers ────────────────────────────────────────────────────────────────
create table vouchers (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  type           voucher_type not null,
  head           text not null,
  date           date not null,
  amount_paise   bigint not null check (amount_paise > 0),
  method         payment_method not null,
  account_id     uuid not null references accounts(id),
  to_account_id  uuid references accounts(id),
  party_name     text not null default '',
  party_phone    text not null default '',
  reference      text not null default '',
  narration      text not null default '',
  purchase_id    uuid references purchases(id),
  sale_id        uuid references sales(id),
  handled_by     uuid not null references users(id),
  status         voucher_status not null default 'active',
  created_by     uuid not null references users(id),
  cancelled_at   timestamptz,
  cancel_reason  text not null default '',
  branch_id      uuid references branches(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((type = 'contra') = (to_account_id is not null))
);
create index vouchers_date_idx    on vouchers (date);
create index vouchers_account_idx on vouchers (account_id);

-- ─── Returns ─────────────────────────────────────────────────────────────────
create table sales_returns (
  id                        uuid primary key default gen_random_uuid(),
  number                    text not null unique,
  sale_id                   uuid not null references sales(id),
  customer_id               uuid not null references customers(id),
  vehicle_id                uuid not null references vehicles(id),
  branch_id                 uuid references branches(id),
  date                      date not null,
  return_amount_paise       bigint not null check (return_amount_paise >= 0),
  deduction_paise           bigint not null default 0 check (deduction_paise >= 0),
  finance_payment_id        uuid references sale_payments(id),
  finance_adjustment_paise  bigint not null default 0,
  refund_due_paise          bigint not null default 0,
  vehicle_returned          boolean not null default false,
  reason                    text not null default '',
  notes                     text not null default '',
  created_by                uuid not null references users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index sales_returns_sale_idx on sales_returns (sale_id);

create table purchase_returns (
  id                   uuid primary key default gen_random_uuid(),
  number               text not null unique,
  purchase_id          uuid not null references purchases(id),
  vehicle_id           uuid not null references vehicles(id),
  branch_id            uuid references branches(id),
  seller_name          text not null default '',
  date                 date not null,
  return_amount_paise  bigint not null check (return_amount_paise >= 0),
  deduction_paise      bigint not null default 0 check (deduction_paise >= 0),
  refund_due_paise     bigint not null default 0,
  reason               text not null default '',
  notes                text not null default '',
  created_by           uuid not null references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index purchase_returns_purchase_idx on purchase_returns (purchase_id);

create table return_refunds (
  id            uuid primary key default gen_random_uuid(),
  return_type   text not null check (return_type in ('sales','purchase')),
  return_id     uuid not null,          -- sales_returns.id or purchase_returns.id
  number        text not null,
  date          date not null,
  method        payment_method not null,
  amount_paise  bigint not null check (amount_paise > 0),
  account_id    uuid not null references accounts(id),
  reference     text not null default '',
  recorded_by   uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index return_refunds_return_idx on return_refunds (return_type, return_id);

-- ─── Ledger (single source of truth for balances) ────────────────────────────
create table ledger_entries (
  key           text primary key,       -- stable per cause, so corrections re-post in place
  source        ledger_source not null,
  date          date not null,
  created_at    timestamptz not null default now(),
  account_id    uuid not null references accounts(id),
  branch_id     uuid references branches(id),
  direction     money_direction not null,
  amount_paise  bigint not null check (amount_paise >= 0),
  number        text not null default '',
  type_label    text not null default '',
  party         text not null default '',
  particulars   text not null default '',
  method        payment_method,
  handled_by    uuid references users(id),
  entered_by    uuid references users(id),
  href          text,
  voucher_id    uuid references vouchers(id),
  transfer      boolean not null default false
);
create index ledger_account_date_idx on ledger_entries (account_id, date);
create index ledger_branch_date_idx  on ledger_entries (branch_id, date);
create index ledger_source_idx       on ledger_entries (source);

-- ─── Day close ───────────────────────────────────────────────────────────────
create table day_closes (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branches(id),
  date              date not null,
  accounts          jsonb not null default '[]',  -- [{accountId, systemPaise, countedPaise}]
  difference_paise  bigint not null default 0,
  notes             text not null default '',
  closed_by         uuid not null references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (branch_id, date)
);

-- ─── Documents (files live in Cloudflare R2) ─────────────────────────────────
create table documents (
  id           uuid primary key default gen_random_uuid(),
  owner_type   document_owner not null,
  owner_id     uuid not null,
  vehicle_id   uuid references vehicles(id),
  kind         document_kind not null,
  title        text not null default '',
  file_name    text not null,
  storage_key  text not null,
  mime_type    text not null,
  size         int not null default 0,
  uploaded_by  uuid not null references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index documents_owner_idx   on documents (owner_type, owner_id);
create index documents_vehicle_idx on documents (vehicle_id);

-- ─── Activity log ────────────────────────────────────────────────────────────
create table activity (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  entity_type  text not null,
  entity_id    uuid,
  action       text not null,
  timestamp    timestamptz not null default now(),
  description  text not null default '',
  href         text,
  metadata     jsonb not null default '{}'
);
create index activity_timestamp_idx on activity (timestamp desc);
create index activity_entity_idx    on activity (entity_id);
create index activity_actor_idx     on activity (actor_id);

-- ─── Settings (single row) ───────────────────────────────────────────────────
create table settings (
  id                      text primary key default 'business' check (id = 'business'),
  showroom_name           text not null default 'M Garage',
  legal_name              text not null default '',
  address                 text not null default '',
  city                    text not null default '',
  phone                   text not null default '',
  email                   text not null default '',
  gstin                   text not null default '',
  logo_key                text,
  currency                text not null default 'INR',
  date_format             text not null default 'dd MMM yyyy',
  default_inventory_view  text not null default 'grid' check (default_inventory_view in ('grid','table')),
  receipt_footer          text not null default '',
  receipt_terms           text not null default '',
  max_upload_mb           int not null default 10,
  max_photos_per_vehicle  int not null default 30,
  storage_quota_gb        int not null default 10,
  designations            text[] not null default '{}',
  invoice_template        text not null default 'mgarage'
                            check (invoice_template in ('mgarage','classic','modern','compact','bold')),
  updated_at              timestamptz not null default now()
);
insert into settings (id) values ('business');

-- ─── Counters (reference numbers like PUR-2026-0001) ─────────────────────────
create table counters (
  key    text primary key,
  value  int not null default 0
);

-- Atomically take the next number for a counter key.
create or replace function next_counter(p_key text) returns int
language sql as $$
  insert into counters (key, value) values (p_key, 1)
  on conflict (key) do update set value = counters.value + 1
  returning value;
$$;

-- ─── updated_at triggers on every table that has the column ──────────────────
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I_updated_at before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Baseline: only signed-in, active staff can read/write. Tighten per role later
-- (e.g. hide purchase cost from 'sales'). The service-role key bypasses RLS.
create or replace function is_active_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users
    where auth_user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users
    where auth_user_id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','users','customers','vehicles','purchases','vehicle_images','accounts',
    'purchase_payments','reservations','sales','sale_payments','expenses','vouchers',
    'sales_returns','purchase_returns','return_refunds','ledger_entries','day_closes',
    'documents','activity','settings','counters']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff read"  on %I for select to authenticated using (is_active_staff())', t);
    execute format('create policy "staff write" on %I for all    to authenticated using (is_active_staff()) with check (is_active_staff())', t);
  end loop;
end $$;

-- Only admins may change staff accounts and settings.
drop policy "staff write" on users;
create policy "admin write" on users for all to authenticated using (is_admin()) with check (is_admin());
drop policy "staff write" on settings;
create policy "admin write" on settings for all to authenticated using (is_admin()) with check (is_admin());

-- =============================================================================
-- After running: create your login in Authentication → Users, then link it as admin:
--
--   insert into users (auth_user_id, name, email, role)
--   select id, 'Owner', email, 'admin' from auth.users where email = 'you@example.com';
--
--   insert into branches (name, code) values ('Main Branch', 'MAIN');
-- =============================================================================
