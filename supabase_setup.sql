-- Create table for monthly reports
create table opex_reports (
  id uuid default gen_random_uuid() primary key,
  month text not null unique,
  budget_total decimal not null default 0,
  actual_total decimal not null default 0,
  ksef_total decimal not null default 0,
  payroll_total decimal not null default 0,
  fee_percentage decimal default 12,
  budget_items jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create table for invoices
create table invoices (
  id text primary key,
  provider text not null,
  description text,
  amount decimal not null default 0,
  xml_content text,
  report_id uuid references opex_reports(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table opex_reports enable row level security;
alter table invoices enable row level security;

-- Full CRUD policies for authenticated users
create policy "Auth CRUD opex_reports" on opex_reports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth CRUD invoices" on invoices for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
