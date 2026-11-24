-- Schéma initial Vigie.
-- Principe de minimisation : on ne stocke jamais le corps des mails, seulement
-- l'expéditeur, l'objet, le verdict et l'explication.

create table users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  first_name text,
  settings jsonb not null default '{"autoHangup": false, "notifyContactOnScam": true}',
  blocked_count int not null default 0,
  last_contact_alert_at timestamptz,
  created_at timestamptz not null default now()
);

create table otp_codes (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now()
);

create table banks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  partner boolean not null default false,
  official_phone text,
  official_numbers text[] not null default '{}',
  official_domains text[] not null default '{}'
);

create table advisors (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id),
  email text not null unique,
  name text not null,
  agency text not null,
  outbound_number text,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id uuid references users(id) on delete cascade,
  advisor_id uuid references advisors(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((user_id is null) <> (advisor_id is null))
);

create table push_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text not null,
  updated_at timestamptz not null default now()
);
create index push_tokens_user on push_tokens (user_id);

create table user_banks (
  user_id uuid not null references users(id) on delete cascade,
  bank_id uuid not null references banks(id),
  status text not null check (status in ('basic', 'pending', 'certified')),
  customer_ref text,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, bank_id)
);

create table certified_calls (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id),
  advisor_id uuid not null references advisors(id),
  user_id uuid not null references users(id) on delete cascade,
  reason text not null,
  caller_number text,
  status text not null default 'announced'
    check (status in ('announced', 'seen', 'confirmed', 'ended', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  seen_at timestamptz,
  confirmed_at timestamptz,
  ended_at timestamptz
);
create index certified_calls_user on certified_calls (user_id, created_at desc);
create index certified_calls_bank on certified_calls (bank_id, created_at desc);

create table call_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bank_id uuid references banks(id),
  number text,
  action text not null,
  certified_call_id uuid references certified_calls(id) on delete set null,
  created_at timestamptz not null default now()
);
create index call_reports_bank on call_reports (bank_id, created_at desc);

create table reported_numbers (
  number text primary key,
  reports int not null default 0,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now()
);

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('outlook', 'imap', 'gmail')),
  email text not null,
  label text not null,
  status text not null default 'active' check (status in ('active', 'error', 'paused')),
  -- Mot de passe IMAP ou jeton OAuth, chiffré en AES-256-GCM (clé hors base).
  secret_enc text not null,
  -- Curseurs : dernier UID IMAP, abonnement Graph, historyId Gmail…
  state jsonb not null default '{}',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  verdict text not null check (verdict in ('safe', 'suspicious', 'scam')),
  title text not null,
  explanation text not null,
  advice text not null,
  sender text,
  origin text,
  checks jsonb not null default '[]',
  links jsonb not null default '[]',
  fingerprint text,
  received_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index alerts_user on alerts (user_id, received_at desc);

create table trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table oauth_states (
  state text primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

-- Cache des informations de domaine (âge RDAP, réputation) pour limiter les appels externes.
create table domain_intel (
  domain text primary key,
  registered_at timestamptz,
  checked_at timestamptz not null default now()
);

-- File de tâches minimaliste (SELECT … FOR UPDATE SKIP LOCKED).
create table jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index jobs_ready on jobs (run_at);
