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
