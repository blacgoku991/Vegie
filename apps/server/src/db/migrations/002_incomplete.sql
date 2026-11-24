-- Vérification incomplète : un contrôle important (liste noire, site, IA…) n'a pas pu être fait.
alter table alerts add column if not exists incomplete boolean not null default false;
alter table certified_calls add column if not exists matched_at timestamptz;
