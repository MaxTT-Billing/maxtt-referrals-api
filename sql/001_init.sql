create table if not exists referrals (
  id bigserial primary key,
  referrer_customer_code varchar(32) not null,
  referred_invoice_code varchar(64) not null,
  franchisee_code varchar(32) not null,
  invoice_amount_inr numeric(12,2) not null,
  referral_reward_inr numeric(12,2) not null,
  invoice_date date not null,
  created_at timestamptz not null default now(),
  unique (referred_invoice_code)
);

create table if not exists api_keys (
  id bigserial primary key,
  name text not null unique,
  key_hash text not null,
  role text not null check (role in ('writer','admin','sa')),
  created_at timestamptz not null default now()
);

create table if not exists export_requests (
  id bigserial primary key,
  requested_by text not null,
  month char(7) not null, -- YYYY-MM
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
