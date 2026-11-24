-- Console multi-banques : rôles, agences, activation de compte, invitations client.

create table agencies (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (bank_id, name)
);

alter table advisors add column role text not null default 'advisor' check (role in ('superadmin', 'bank_admin', 'advisor'));
alter table advisors add column active boolean not null default true;
alter table advisors add column agency_id uuid references agencies(id) on delete set null;
-- Le superadmin (équipe SmartSecure) n'appartient à aucune banque ; tous les autres en ont une.
alter table advisors alter column bank_id drop not null;
alter table advisors add constraint advisors_bank_by_role check ((role = 'superadmin') = (bank_id is null));
-- Un compte créé par un responsable n'a pas de mot de passe tant qu'il n'est pas activé.
alter table advisors alter column password_hash drop not null;
alter table advisors alter column agency set default '';

-- Jetons d'activation : à usage unique, hachés, 72 h.
create table activation_tokens (
  token_hash text primary key,
  advisor_id uuid not null references advisors(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index activation_tokens_advisor on activation_tokens (advisor_id);

-- Invitations client : le conseiller donne un code à 6 chiffres (ou un QR), valable 15 min, à usage unique.
create table client_invites (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id) on delete cascade,
  advisor_id uuid not null references advisors(id) on delete cascade,
  code_hash text not null,
  token_hash text not null unique,
  customer_ref text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index client_invites_open_code on client_invites (code_hash) where used_at is null;

-- Essais de code par utilisateur (limite : 5 sur 15 minutes).
create table invite_attempts (
  user_id uuid not null references users(id) on delete cascade,
  at timestamptz not null default now()
);
create index invite_attempts_user on invite_attempts (user_id, at desc);
