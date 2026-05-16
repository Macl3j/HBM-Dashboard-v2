-- Setup tables for Anker-Andersen HLZ Machine Logs

-- 1. Raw Batch Summaries (from .batch files)
create table if not exists anker_batches (
  id uuid default gen_random_uuid() primary key,
  machine_id text not null, -- e.g. "2024", "2025"
  batch_number text not null unique, -- The unique ID from filename/content
  shift_name text, -- zmiana1, zmiana2
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  total_count integer default 0,
  total_weight decimal(10,3), -- In Mg or Kg depending on config
  processing_time_seconds integer,
  raw_content text, -- Store full batch line for reference
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Detailed Item Logs (from .sls files)
create table if not exists anker_item_logs (
  id uuid default gen_random_uuid() primary key,
  batch_id uuid references anker_batches(id) on delete cascade,
  ean_code text,
  material_code text, -- e.g. "1", "41"
  volume_liters decimal(5,2),
  scanned_at timestamp with time zone,
  raw_line text
);

-- 3. Material Mapping (to help categorize BDO fractions)
create table if not exists anker_material_map (
  material_code text primary key,
  label text, -- "PET", "ALU", "Glass"
  bdo_waste_code text -- "15 01 02", "15 01 04"
);

-- Insert default mappings if they don't exist
insert into anker_material_map (material_code, label, bdo_waste_code)
values 
  ('1', 'PET', '15 01 02'),
  ('41', 'ALU', '15 01 04')
on conflict (material_code) do nothing;

-- Enable RLS
alter table anker_batches enable row level security;
alter table anker_item_logs enable row level security;

-- Simple policies (allow authenticated)
do $$ 
begin
  if not exists (select 1 from pg_policy where polname = 'Allow authenticated select anker_batches') then
    create policy "Allow authenticated select anker_batches" on anker_batches for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policy where polname = 'Allow authenticated select anker_item_logs') then
    create policy "Allow authenticated select anker_item_logs" on anker_item_logs for select to authenticated using (true);
  end if;
end $$;
