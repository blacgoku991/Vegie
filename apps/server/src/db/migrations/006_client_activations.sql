-- Liaison d'un client à sa banque par lien d'activation (SMS), sans code à saisir.
create table client_activations (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id) on delete cascade,
  advisor_id uuid references advisors(id) on delete set null,
  phone text not null,
  first_name text not null,
  customer_ref text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  user_id uuid references users(id) on delete set null
);
-- Une seule activation ouverte par (banque, numéro).
create unique index client_activations_open on client_activations (bank_id, phone) where used_at is null and cancelled_at is null;
create index client_activations_advisor on client_activations (advisor_id, created_at);
create index client_activations_bank on client_activations (bank_id, created_at desc);

-- Échecs d'activation par IP (plafond horaire).
create table activation_attempts (
  id bigserial primary key,
  ip text,
  at timestamptz not null default now()
);
create index activation_attempts_ip on activation_attempts (ip, at);
