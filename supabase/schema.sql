-- ============================================================
-- Employee Verification Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- Employees table (pre-populated by HR admin)
create table if not exists employees (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  id_number        text unique not null,
  email            text not null,
  phone            text not null,

  -- Extra verification fields (3 random ones are chosen per session)
  -- Add more columns here in the future as needed
  marital_status   text check (marital_status in ('רווק', 'נשוי', 'גרוש', 'אלמן', 'רווקה', 'נשואה', 'גרושה', 'אלמנה')),
  building_number  text,
  oldest_son_id    text,
  department       text,
  birth_city       text,

  -- Verification state
  attempts_count   integer not null default 0,
  is_blocked       boolean not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Successful verifications log (one row per successful submission)
create table if not exists verifications (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references employees(id) on delete cascade,
  employee_name       text not null,
  employee_id_number  text not null,
  verified_at         timestamptz not null default now(),
  ip_address          text
);

-- Indexes for fast lookups
create index if not exists idx_employees_id_number   on employees(id_number);
create index if not exists idx_verifications_date     on verifications(verified_at);
create index if not exists idx_verifications_employee on verifications(employee_id);

-- Auto-update updated_at on employees
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at
  before update on employees
  for each row execute function update_updated_at_column();

-- ============================================================
-- Sample test employee (remove in production)
-- Password: all fields below must match exactly on the form
-- ============================================================
-- insert into employees (name, id_number, email, phone, marital_status, building_number, oldest_son_id, department, birth_city)
-- values ('ישראל ישראלי', '123456789', 'israel@example.com', '0501234567', 'נשוי', '12', '987654321', 'פיתוח', 'תל אביב');
