-- Migration 005: Row Level Security policies

-- Enable RLS on all public tables
alter table public.users enable row level security;
alter table public.usage enable row level security;
alter table public.meetings enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- ============================================================
-- users
-- ============================================================
drop policy if exists "users: select own" on public.users;
create policy "users: select own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users: update own" on public.users;
create policy "users: update own" on public.users
  for update using (auth.uid() = id);

-- ============================================================
-- usage
-- ============================================================
drop policy if exists "usage: select own" on public.usage;
create policy "usage: select own" on public.usage
  for select using (auth.uid() = user_id);

drop policy if exists "usage: insert own" on public.usage;
create policy "usage: insert own" on public.usage
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- meetings
-- ============================================================
drop policy if exists "meetings: select own" on public.meetings;
create policy "meetings: select own" on public.meetings
  for select using (auth.uid() = user_id);

drop policy if exists "meetings: insert own" on public.meetings;
create policy "meetings: insert own" on public.meetings
  for insert with check (auth.uid() = user_id);

drop policy if exists "meetings: update own" on public.meetings;
create policy "meetings: update own" on public.meetings
  for update using (auth.uid() = user_id);

drop policy if exists "meetings: delete own" on public.meetings;
create policy "meetings: delete own" on public.meetings
  for delete using (auth.uid() = user_id);

-- ============================================================
-- transcript_segments
-- ============================================================
drop policy if exists "transcripts: select own" on public.transcript_segments;
create policy "transcripts: select own" on public.transcript_segments
  for select using (auth.uid() = user_id);

drop policy if exists "transcripts: insert own" on public.transcript_segments;
create policy "transcripts: insert own" on public.transcript_segments
  for insert with check (auth.uid() = user_id);

drop policy if exists "transcripts: delete own" on public.transcript_segments;
create policy "transcripts: delete own" on public.transcript_segments
  for delete using (auth.uid() = user_id);

-- ============================================================
-- teams (team members can see their team)
-- ============================================================
drop policy if exists "teams: select member" on public.teams;
create policy "teams: select member" on public.teams
  for select using (
    id in (select team_id from public.team_members where user_id = auth.uid())
  );

drop policy if exists "team_members: select own team" on public.team_members;
create policy "team_members: select own team" on public.team_members
  for select using (
    team_id in (select team_id from public.team_members where user_id = auth.uid())
  );

-- service_role bypasses RLS automatically — used by backend proxy
