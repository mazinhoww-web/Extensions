-- Migration 002: usage tracking table
-- Records every ata generated — base for Free plan 5/month limit and analytics

create table if not exists public.usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  event      text not null default 'minutes_generated'
               check (event in ('minutes_generated', 'export_googledocs', 'export_notion', 'export_confluence', 'meeting_recorded')),
  meeting_id text,       -- local meeting ID for dedup
  platform   text,       -- 'google_meet' | 'teams' | 'zoom' | 'offline'
  duration_s int,        -- meeting duration in seconds
  metadata   jsonb,      -- additional context
  created_at timestamptz not null default now()
);

create index if not exists usage_user_month_idx
  on public.usage (user_id, created_at)
  where event = 'minutes_generated';

create index if not exists usage_user_event_idx
  on public.usage (user_id, event);

-- View: current month usage per user
create or replace view public.usage_current_month as
select
  user_id,
  count(*) filter (where event = 'minutes_generated')   as minutes_count,
  count(*) filter (where event = 'meeting_recorded')    as recordings_count,
  count(*) filter (where event = 'export_googledocs')   as googledocs_exports,
  count(*) filter (where event = 'export_notion')       as notion_exports,
  date_trunc('month', now())                            as month_start
from public.usage
where created_at >= date_trunc('month', now())
group by user_id;
