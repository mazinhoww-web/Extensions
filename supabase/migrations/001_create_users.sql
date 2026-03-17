-- Migration 001: users table
-- Extends auth.users with MeetScribe-specific fields

create table if not exists public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null,
  name                   text,
  avatar_url             text,
  plan                   text not null default 'free'
                           check (plan in ('free','pro','team','enterprise')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plan_expires_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- Auto-create user record when auth.users gets a new entry
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
