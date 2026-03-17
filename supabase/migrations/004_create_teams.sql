-- Migration 004: teams (Team plan — Sprint 6)
-- Created now to avoid destructive migration later

create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  owner_id   uuid not null references public.users(id),
  plan       text not null default 'team',
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id   uuid references public.teams(id) on delete cascade,
  user_id   uuid references public.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);
