-- Invitation liée au numéro du client + traçage des essais (IP, échec) pour les plafonds.
alter table client_invites add column client_phone text;
alter table invite_attempts add column id bigserial;
alter table invite_attempts add column ip text;
alter table invite_attempts add column failed boolean not null default true;
create index invite_attempts_ip on invite_attempts (ip, at) where failed;
create index invite_attempts_failed on invite_attempts (at) where failed;
