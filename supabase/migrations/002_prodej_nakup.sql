-- StrojPark 002 – prodej (zájemci, prodejní údaje, inzeráty) a nákup / dovoz strojů do ČR
-- Spusťte po 001_init.sql (SQL Editor → vložit → Run)

-- ---------- stroje: nákupní fáze, rozměry, prodej ----------
alter table public.machines drop constraint if exists machines_lifecycle_check;
alter table public.machines add constraint machines_lifecycle_check
  check (lifecycle in ('nakup','aktivni','prodano','vyrazeno'));

alter table public.machines
  add column if not exists transport_length_m numeric,
  add column if not exists transport_width_m numeric,
  add column if not exists transport_height_m numeric,
  add column if not exists sold_price numeric,
  add column if not exists sold_at date,
  add column if not exists buyer_name text not null default '',
  add column if not exists listing jsonb;

-- ---------- nákup a dovoz ----------
create table if not exists public.purchases (
  id uuid primary key,                      -- = machine_id
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  status text not null default 'vyhlednuto'
    check (status in ('vyhlednuto','proverovani','vyjednavani','koupeno','preprava','dorazilo','nekoupeno')),
  source text not null default 'dealer'
    check (source in ('dealer','aukce','soukromnik','firma','leasing','protiucet')),
  seller_name text not null default '',
  seller_contact text not null default '',
  seller_vat_id text not null default '',
  country text not null default 'CZ',
  city text not null default '',
  listing_url text not null default '',
  purchase_date date,
  currency text not null default 'EUR',
  price_foreign numeric,
  exchange_rate numeric not null default 1,
  vat_regime text not null default 'eu' check (vat_regime in ('cz','eu','import','margin','neplatce')),
  distance_km numeric,
  transport_cost numeric,
  customs_cost numeric,
  auction_fee numeric,
  inspection_cost numeric,
  registration_cost numeric,
  other_cost numeric,
  other_note text not null default '',
  expected_arrival date,
  checklist jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

-- ---------- zájemci a poptávky ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references public.machines(id) on delete cascade,
  wanted text not null default '',
  customer_name text not null default '',
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  source text not null default '',
  status text not null default 'novy'
    check (status in ('novy','kontaktovan','prohlidka','nabidka','vyjednavani','vyhrano','ztraceno')),
  offered_price numeric,
  next_contact date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists leads_machine_idx on public.leads(machine_id);

do $$
declare t text;
begin
  foreach t in array array['purchases','leads'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "team_all" on public.%1$s', t);
    execute format('create policy "team_all" on public.%1$s for all to authenticated using (true) with check (true)', t);
    begin
      execute format('alter publication supabase_realtime add table public.%1$s', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
