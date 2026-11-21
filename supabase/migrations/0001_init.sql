-- Red Room initial schema (spec §6 + v3 overrides from spec §12).
-- Backend (service role key) is the ONLY database writer; the browser reads
-- and signs in only. Do not apply from the client.

-- players ------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  team text,
  xp int not null default 0,
  rank text,
  lives int not null default 3,
  lives_refill_at timestamptz,
  wallet_address text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- agents -------------------------------------------------------------------
create table if not exists public.agents (
  id text primary key,
  name text not null,
  domain text not null,
  stream text,                                -- v3: banking | support | assistant
  visibility text not null default 'public' check (visibility in ('public','private')),
  owner_id uuid references public.players(id),
  config jsonb not null default '{}'::jsonb,
  current_version int not null default 1,
  elo real,                                   -- legacy column kept from spec §6
  rating real not null default 1200,          -- v3: Glicko-style rating, never reset between versions
  rating_deviation real not null default 350, -- v3: resets to 200 after each new version
  guardian_enabled boolean not null default false, -- v3: off by default on creator agents, on for house agents
  first_blood_open boolean not null default true,
  created_at timestamptz not null default now()
);

-- agent_versions -------------------------------------------------------------
create table if not exists public.agent_versions (
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  status text not null default 'published' check (status in ('draft','published')), -- v3
  rulebook_rule_ids jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_from_run_id uuid,
  grade_score real,
  exam_catch_rate real,
  exam_false_block_rate real,
  unbeaten_since timestamptz,                 -- for the First Blood jackpot clock
  primary key (agent_id, version)
);

-- runs -----------------------------------------------------------------------
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id),
  agent_id text not null references public.agents(id),
  agent_version int not null,
  channel text not null default 'text' check (channel in ('text','voice')),
  mode text not null check (mode in ('ladder','arena','genuine','ai_scammer','exam')),
  mission_id text,
  wave int,
  language text not null default 'auto',
  transcript jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  outcome text check (outcome in ('win','block','step_up','timeout','abandoned','error')),
  how_close int not null default 0,
  points int not null default 0,
  elo_delta real not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- tactics --------------------------------------------------------------------
create table if not exists public.tactics (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  name text not null,
  family text not null,
  description text,
  first_run_id uuid,
  taught_by text,
  variant_of text references public.tactics(id),
  status text not null default 'open' check (status in ('open','patched'))
);

-- rules ----------------------------------------------------------------------
create table if not exists public.rules (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  title text not null,
  text text not null,
  tactic_id text references public.tactics(id),
  from_run_id uuid,
  version_added int,
  taught_by text,
  status text not null default 'active' check (status in ('active','rejected')),
  rejected_reason text
);

-- logbook (v3: every loss lands in the agent owner's logbook) -----------------
create table if not exists public.logbook_entries (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  run_id uuid not null references public.runs(id) on delete cascade,
  outcome text not null,
  stopped_by text check (stopped_by in ('agent','hard_limit','guardian','none')),
  family text,
  signals jsonb not null default '[]'::jsonb,
  how_close int not null default 0,
  open boolean not null default true,
  created_at timestamptz not null default now()
);

-- retest_results (v3: each logged failure replayed N times against a draft) ---
create table if not exists public.retest_results (
  id uuid primary key default gen_random_uuid(),
  draft_version int not null,
  log_entry_id uuid not null references public.logbook_entries(id) on delete cascade,
  blocked_count int not null default 0,   -- blocked 3/3 = fixed, 1-2/3 = flaky, 0/3 = still failing
  repeats int not null default 3,
  label text check (label in ('fixed','flaky','still_failing')),
  created_at timestamptz not null default now()
);

-- exam -----------------------------------------------------------------------
create table if not exists public.exam_cases (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  kind text not null check (kind in ('scam','genuine')),
  category text,
  language text not null default 'en',
  caller_turns jsonb not null default '[]'::jsonb,
  expected jsonb
);

create table if not exists public.exam_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  scams_caught int not null default 0,
  scams_total int not null default 0,
  genuine_blocked int not null default 0,
  genuine_total int not null default 0,
  run_at timestamptz not null default now()
);

-- retro_results (spec §6 retro-exam) ------------------------------------------
create table if not exists public.retro_results (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  run_id uuid not null references public.runs(id) on delete cascade,
  would_block boolean not null,
  created_at timestamptz not null default now()
);

-- graph_events -----------------------------------------------------------------
create table if not exists public.graph_events (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  type text not null,                          -- includes v3 "learned" nodes
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- payouts ----------------------------------------------------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id),
  run_id uuid references public.runs(id),
  amount numeric not null default 0,
  tx_hash text,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now()
);

-- waves ------------------------------------------------------------------------
create table if not exists public.waves (
  id int primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unlocks jsonb not null default '[]'::jsonb,
  pool numeric not null default 0
);

-- public_events: sanitized ticker events only (e.g. "version_published",
-- "agent_beaten" with tactic family). NEVER scripts, transcripts or private
-- data. The BACKEND (service role) is the only writer of public_events.
create table if not exists public.public_events (
  id bigserial primary key,
  type text not null,
  agent_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- leaderboard / public views --------------------------------------------------
-- Safe-column views: public pages must NEVER see wallet_address, is_admin,
-- lives, agents.config (owner prompts and Guardian rules) or rulebooks, so
-- the base tables below get NO public select policies; only these views are
-- exposed (views owned by the migration role read past RLS).
create or replace view public.leaderboard_players as
select id, handle, team, xp, rank
from public.players
order by xp desc;

create or replace view public.leaderboard_agents as
select id, name, domain, stream, rating, rating_deviation, current_version
from public.agents
order by rating desc;

create or replace view public.public_agent_versions as
select agent_id, version, status, grade_score, exam_catch_rate, exam_false_block_rate, created_at
from public.agent_versions
order by agent_id, version desc;

-- Row Level Security: public read on agents, agent_versions and leaderboard
-- data; NO client writes anywhere (the backend writes with the service key,
-- which bypasses RLS).
alter table public.players         enable row level security;
alter table public.agents          enable row level security;
alter table public.agent_versions  enable row level security;
alter table public.runs            enable row level security;
alter table public.tactics         enable row level security;
alter table public.rules           enable row level security;
alter table public.logbook_entries enable row level security;
alter table public.retest_results  enable row level security;
alter table public.exam_cases      enable row level security;
alter table public.exam_runs       enable row level security;
alter table public.retro_results   enable row level security;
alter table public.graph_events    enable row level security;
alter table public.payouts         enable row level security;
alter table public.waves           enable row level security;
alter table public.public_events   enable row level security;

-- Public (anon + authenticated) read-only access:
--  - NO select policies on the base tables players / agents / agent_versions
--    (they hold wallet_address, is_admin, lives, agents.config with prompts
--    and Guardian rules, and rulebooks). Safe columns are exposed only via
--    the views above.
--  - public_events carries only sanitized ticker events, so it is readable.
-- Deliberately no INSERT / UPDATE / DELETE policies for clients anywhere:
-- the backend is the only writer (service role bypasses RLS).
grant select on public.leaderboard_players to anon, authenticated;
grant select on public.leaderboard_agents to anon, authenticated;
grant select on public.public_agent_versions to anon, authenticated;

create policy "public read sanitized events" on public.public_events
  for select to anon, authenticated using (true);

-- Realtime: only sanitized ticker events and version rows are published.
-- runs, graph_events and payouts hold transcripts and private data and must
-- NEVER be published to the browser.
alter publication supabase_realtime add table public.public_events;
alter publication supabase_realtime add table public.agent_versions;
