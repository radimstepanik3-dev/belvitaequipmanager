-- StrojPark – schéma databáze pro Supabase (PostgreSQL)
-- Spusťte v Supabase: SQL Editor → vložit → Run   (nebo `supabase db push`)
--
-- Model oprávnění: každý PŘIHLÁŠENÝ člen týmu může číst i upravovat vše.
-- Nové uživatele zakládá administrátor v Supabase (Authentication → Users → Invite),
-- veřejnou registraci doporučujeme vypnout (Authentication → Providers → Email → "Allow new users to sign up").

create extension if not exists "pgcrypto";

-- ---------- pomocná funkce pro updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- stroje ----------
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  category text not null default '',
  brand text not null default '',
  model text not null default '',
  year int,
  serial_number text not null default '',
  hours numeric,
  weight_kg numeric,
  power_kw numeric,
  condition text not null default '',
  location text not null default '',
  description text not null default '',
  ownership text not null default 'vlastni' check (ownership in ('vlastni','zakaznik')),
  customer_name text not null default '',
  lifecycle text not null default 'aktivni' check (lifecycle in ('aktivni','prodano','vyrazeno')),
  for_sale boolean not null default false,
  sale_price numeric,
  purchase_price numeric,
  for_rent boolean not null default false,
  cover_media_id uuid,
  ai_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

-- ---------- fotky a dokumenty ----------
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references public.machines(id) on delete cascade,
  service_order_id uuid,
  kind text not null check (kind in ('photo','document')),
  stage text check (stage in ('prijem','prubeh','dokonceni')),
  name text not null default '',
  mime text not null default '',
  size bigint not null default 0,
  path text not null,
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists media_machine_idx on public.media(machine_id);
create index if not exists media_service_idx on public.media(service_order_id);

-- ---------- servisní zakázky ----------
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  machine_id uuid not null references public.machines(id) on delete cascade,
  status text not null default 'prijato'
    check (status in ('prijato','diagnostika','ceka_na_dily','v_oprave','hotovo','predano','zruseno')),
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  received_at timestamptz not null default now(),
  received_by text not null default '',
  hours_at_intake numeric,
  fault_description text not null default '',
  intake_condition text not null default '',
  accessories text not null default '',
  technician text not null default '',
  estimated_completion date,
  diagnosis text not null default '',
  labor_rate numeric not null default 0,
  completed_at timestamptz,
  completion_notes text not null default '',
  handed_over_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create unique index if not exists service_orders_number_idx on public.service_orders(number);
create index if not exists service_orders_machine_idx on public.service_orders(machine_id);

alter table public.media
  drop constraint if exists media_service_fk,
  add constraint media_service_fk foreign key (service_order_id) references public.service_orders(id) on delete cascade;

-- pracovní list
create table if not exists public.service_work (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  date date not null default current_date,
  technician text not null default '',
  hours numeric not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists service_work_order_idx on public.service_work(service_order_id);

-- náhradní díly
create table if not exists public.service_parts (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  part_number text not null default '',
  name text not null default '',
  quantity numeric not null default 1,
  unit text not null default 'ks',
  unit_price numeric not null default 0,
  status text not null default 'objednano' check (status in ('objednano','skladem','pouzito')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists service_parts_order_idx on public.service_parts(service_order_id);

-- ---------- půjčovna ----------
create table if not exists public.rental_rates (
  id uuid primary key,                       -- = machine_id
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  price_hour numeric,
  price_day numeric,
  price_weekend numeric,
  price_week numeric,
  price_month numeric,
  deposit numeric,
  operator_hour numeric,
  note text not null default '',
  in_pricelist boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  type text not null check (type in ('pronajem','rezervace_pronajem','rezervace_prodej','prodej')),
  status text not null default 'aktivni' check (status in ('aktivni','dokonceno','zruseno')),
  customer_name text not null default '',
  customer_company text not null default '',
  customer_phone text not null default '',
  start_date date not null,
  end_date date,
  price_total numeric,
  deposit numeric,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists bookings_machine_idx on public.bookings(machine_id);

-- ---------- nastavení firmy (jeden řádek) ----------
create table if not exists public.settings (
  id uuid primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

-- ---------- triggery, RLS, realtime ----------
do $$
declare t text;
begin
  foreach t in array array['machines','media','service_orders','service_work','service_parts','rental_rates','bookings','settings'] loop
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

-- ---------- úložiště souborů (fotky, dokumenty) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "team_media_select" on storage.objects;
drop policy if exists "team_media_insert" on storage.objects;
drop policy if exists "team_media_update" on storage.objects;
drop policy if exists "team_media_delete" on storage.objects;
create policy "team_media_select" on storage.objects for select to authenticated using (bucket_id = 'media');
create policy "team_media_insert" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "team_media_update" on storage.objects for update to authenticated using (bucket_id = 'media');
create policy "team_media_delete" on storage.objects for delete to authenticated using (bucket_id = 'media');
