-- Renvois de SMS d'activation : comptés avec les créations dans le plafond quotidien du conseiller.
create table activation_sends (
  id bigserial primary key,
  advisor_id uuid not null references advisors(id) on delete cascade,
  at timestamptz not null default now()
);
create index activation_sends_advisor on activation_sends (advisor_id, at);
