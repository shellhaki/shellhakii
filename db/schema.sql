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

-- Social layer (specs/social-spec.md section 3).
alter table subscribers add column if not exists display_name text;
alter table subscribers add column if not exists email_verified_at timestamptz;

create table if not exists otp_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_email_idx on otp_codes (email, created_at desc);

create table if not exists sessions (
  id                uuid primary key default gen_random_uuid(),
  subscriber_id     uuid not null references subscribers (id) on delete cascade,
  family_id         uuid not null,
  refresh_hash      text not null unique,
  created_at        timestamptz not null default now(),
  family_created_at timestamptz not null default now(),
  expires_at        timestamptz not null,
  rotated_at        timestamptz,
  revoked_at        timestamptz,
  user_agent        text
);
create index if not exists sessions_family_idx on sessions (family_id);
create index if not exists sessions_subscriber_idx on sessions (subscriber_id);

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_created_idx on posts (created_at desc, id desc);

create table if not exists likes (
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  target_type   text not null check (target_type in ('post', 'project', 'article', 'gallery')),
  target_id     text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, target_type, target_id)
);
create index if not exists likes_target_idx on likes (target_type, target_id);

create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  target_type   text not null check (target_type in ('post', 'project', 'article', 'gallery')),
  target_id     text not null,
  body          text not null check (char_length(body) between 1 and 1000),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists comments_target_idx on comments (target_type, target_id, created_at desc, id desc);
