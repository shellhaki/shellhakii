-- Featured projects, written via /api/admin/projects.
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text not null,
  url           text,
  repo_url      text,
  thumbnail_key text,
  tags          text[] not null default '{}',
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Migration for earlier draft that stored a full thumbnail URL.
alter table projects add column if not exists thumbnail_key text;
alter table projects drop column if exists thumbnail_url;

create index if not exists projects_position_idx on projects (position, created_at desc);

-- Gallery media, written via /api/admin/media. `key` is the R2 object key.
create table if not exists gallery_media (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('image', 'video')),
  key        text not null unique,
  width      integer,
  height     integer,
  caption    text,
  created_at timestamptz not null default now()
);

create index if not exists gallery_media_created_idx on gallery_media (created_at desc);

-- Newsletter subscribers (double opt-in). Tokens are random hex strings.
create table if not exists subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  status          text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_token   text,
  unsubscribe_token text not null,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);

create unique index if not exists subscribers_confirm_token_idx on subscribers (confirm_token) where confirm_token is not null;
create unique index if not exists subscribers_unsub_token_idx on subscribers (unsubscribe_token);

-- One row per digest sent; the next digest covers content newer than the latest sent_at.
create table if not exists digests (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  recipients integer not null,
  sent_at    timestamptz not null default now()
);
