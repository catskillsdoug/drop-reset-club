create table contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('phone','email')),
  value text not null,
  source text not null check (source in ('save','share_recipient')),
  is_test boolean not null default false,
  klaviyo_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create table saved_drops (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  property_code text not null,
  arrival date not null,
  share_token text not null unique,
  shared_by_save_id uuid references saved_drops(id),
  status text not null default 'active' check (status in ('active','expired','booked')),
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table contacts enable row level security;
alter table saved_drops enable row level security;
-- no anon policies on purpose: only the service key (bypasses RLS) reads/writes
create index saved_drops_arrival_idx on saved_drops (arrival) where status = 'active';
