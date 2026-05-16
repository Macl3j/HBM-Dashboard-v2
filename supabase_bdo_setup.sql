-- BDO Module Database Schema

-- 1. BDO Configuration (API Credentials)
create table if not exists bdo_config (
  id uuid default gen_random_uuid() primary key,
  client_id text not null,
  client_secret text not null,
  api_key text,
  environment text default 'production' check (environment in ('test', 'production')),
  eup_id text, -- ID miejsca prowadzenia działalności
  default_receiver_id text,
  default_carrier_id text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. BDO KPO (Karta Przekazania Odpadu)
create table if not exists bdo_kpo (
  id uuid default gen_random_uuid() primary key,
  kpo_number text unique, -- Numer nadany przez BDO lub "SZKIC-..."
  waste_code text not null, -- np. 15 01 02
  waste_mass decimal not null, -- w Mg
  sender_name text not null,
  receiver_name text not null,
  transport_name text,
  status text default 'SZKIC',
  planned_date timestamp with time zone,
  realized_date timestamp with time zone,
  bdo_id text, -- ID dokumentu w systemie BDO
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Fix status check constraint if exists
do $$ 
begin
  if exists (select 1 from pg_constraint where conname = 'bdo_kpo_status_check') then
    alter table bdo_kpo drop constraint bdo_kpo_status_check;
  end if;
  alter table bdo_kpo add constraint bdo_kpo_status_check 
    check (status in ('SZKIC', 'SENT_TO_BDO', 'planned', 'in_transit', 'completed', 'cancelled'));
end $$;

-- 3. BDO Bales (Magazyn Belek)
create table if not exists bdo_bales (
  id uuid default gen_random_uuid() primary key,
  waste_type text not null, -- PET, ALU
  color text,
  weight decimal not null default 0,
  shift_number integer,
  leader_name text,
  kpo_id uuid references bdo_kpo(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. BDO KEO (Karta Ewidencji Odpadu)
create table if not exists bdo_keo (
  id uuid default gen_random_uuid() primary key,
  waste_code text not null,
  year integer not null,
  initial_mass decimal default 0,
  collected_mass decimal default 0,
  processed_mass decimal default 0,
  current_mass decimal default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(waste_code, year)
);

-- Enable RLS
alter table bdo_config enable row level security;
alter table bdo_kpo enable row level security;
alter table bdo_bales enable row level security;
alter table bdo_keo enable row level security;

-- Idempotent Policies
do $$ 
begin
  -- bdo_config
  if not exists (select 1 from pg_policies where policyname = 'Allow auth admin' and tablename = 'bdo_config') then
    create policy "Allow auth admin" on bdo_config for all using (auth.role() = 'authenticated');
  end if;

  -- bdo_kpo
  if not exists (select 1 from pg_policies where policyname = 'Allow auth kpo' and tablename = 'bdo_kpo') then
    create policy "Allow auth kpo" on bdo_kpo for all using (auth.role() = 'authenticated');
  end if;

  -- bdo_bales
  if not exists (select 1 from pg_policies where policyname = 'Allow auth bales' and tablename = 'bdo_bales') then
    create policy "Allow auth bales" on bdo_bales for all using (auth.role() = 'authenticated');
  end if;

  -- bdo_keo
  if not exists (select 1 from pg_policies where policyname = 'Allow auth keo' and tablename = 'bdo_keo') then
    create policy "Allow auth keo" on bdo_keo for all using (auth.role() = 'authenticated');
  end if;
end $$;
