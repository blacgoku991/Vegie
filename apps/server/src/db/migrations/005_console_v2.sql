-- Console v2 : fiches clients, notes internes, journal d'activité, annulation d'invitation.

-- Conseiller référent du client (celui qui a invité ou relié le client).
alter table user_banks add column referent_id uuid references advisors(id) on delete set null;

-- Notes internes : visibles seulement par l'équipe de la banque, jamais par le client.
create table client_notes (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  author_id uuid references advisors(id) on delete set null,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index client_notes_client on client_notes (bank_id, user_id, created_at desc);

-- Journal d'activité d'une banque. Les métadonnées ne contiennent jamais de téléphone, code ni secret.
create table audit_events (
  id bigserial primary key,
  bank_id uuid not null references banks(id) on delete cascade,
  actor_id uuid references advisors(id) on delete set null,
  actor_name text not null default '',
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_bank on audit_events (bank_id, created_at desc);
create index audit_events_target on audit_events (bank_id, target_type, target_id, created_at desc);

-- Annulation d'une invitation ouverte.
alter table client_invites add column cancelled_at timestamptz;
drop index if exists client_invites_open_code;
create unique index client_invites_open_code on client_invites (code_hash) where used_at is null and cancelled_at is null;
create index client_invites_bank on client_invites (bank_id, created_at desc);
