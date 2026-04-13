-- ============================================================
-- Employee Verification Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- Drop old tables (clean migration from dummy schema)
drop table if exists verifications cascade;
drop table if exists children cascade;
drop table if exists employees cascade;

-- Employees table (populated via the importData.js script)
create table employees (
  id                     uuid primary key default gen_random_uuid(),

  -- Login key: Israeli national ID (9 digits)
  id_number              text unique not null,

  -- School / unit
  unit_number            text,
  unit_name              text,

  -- Personal info
  first_name             text not null,
  last_name              text not null,
  birth_date             date,
  aliya_date             date,           -- NULL = born in Israel

  -- Address
  street                 text,
  house_number           text,
  city                   text,
  postal_code            text,

  -- Contact
  phone                  text,
  mobile_phone           text,

  -- Family
  marital_status         text,
  health_fund            text,

  -- Spouse (all nullable — not all employees have a spouse)
  spouse_id_number       text,
  spouse_passport_number text,
  spouse_birth_date      date,
  spouse_aliya_date      date,

  -- Verification state
  attempts_count         integer not null default 0,
  is_blocked             boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Children table (populated via the importData.js script)
create table children (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,

  child_name       text not null,
  child_id_number  text,           -- nullable: may be missing
  child_birth_date date,           -- nullable: may be missing

  unit_number      text,
  unit_name        text,

  created_at       timestamptz not null default now()
);

-- Successful verifications log
create table verifications (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references employees(id) on delete cascade,
  employee_name       text not null,
  employee_id_number  text not null,
  verified_at         timestamptz not null default now(),
  ip_address          text
);

-- Indexes
create index idx_employees_id_number    on employees(id_number);
create index idx_children_employee_id   on children(employee_id);
create index idx_verifications_date        on verifications(verified_at);
create index idx_verifications_employee    on verifications(employee_id);

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
