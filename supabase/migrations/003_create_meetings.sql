-- Migration 003: meetings + transcripts tables (cloud sync)
-- Stores meeting data and transcriptions for cross-device access

create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  local_id     text,             -- ID from extension localStorage (for sync)
  title        text,
  platform     text,             -- 'google_meet' | 'teams' | 'zoom' | 'offline'
  started_at   timestamptz,
  ended_at     timestamptz,
  duration_s   int,
  participants jsonb,            -- [{name, speakerId, talkTime}]
  minutes      text,            -- generated ata (markdown)
  minutes_html text,            -- HTML version for export
  status       text not null default 'recorded'
                 check (status in ('recording', 'recorded', 'transcribed', 'minutes_generated', 'failed')),
  storage_path text,            -- Supabase Storage path for audio (future)
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists meetings_user_idx on public.meetings (user_id, created_at desc);
create index if not exists meetings_local_id_idx on public.meetings (user_id, local_id);

drop trigger if exists meetings_updated_at on public.meetings;
create trigger meetings_updated_at
  before update on public.meetings
  for each row execute function public.handle_updated_at();

-- Transcript segments — stored separately for full-text search and analytics
create table if not exists public.transcript_segments (
  id          bigint generated always as identity primary key,
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  speaker     text,
  text        text not null,
  start_ms    int,              -- start time in milliseconds
  end_ms      int,
  confidence  float4,
  created_at  timestamptz not null default now()
);

create index if not exists transcript_meeting_idx on public.transcript_segments (meeting_id, start_ms);
