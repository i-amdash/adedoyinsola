-- Run once in this project's Supabase SQL Editor. All application writes and
-- private reads go through the Express API using a server-only secret key.
begin;
create table if not exists public.portfolio_content (
  id text primary key check (id = 'main'),
  revision integer not null check (revision > 0),
  document jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.portfolio_players (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  username_key text generated always as (lower(username)) stored,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists portfolio_players_username_unique on public.portfolio_players (username_key);
create table if not exists public.portfolio_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.portfolio_players(id) on delete cascade,
  game text not null check (game in ('memory', 'sprint')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  unique (player_id, game)
);
create index if not exists portfolio_attempts_expiry on public.portfolio_attempts (expires_at);
create table if not exists public.portfolio_scores (
  id uuid primary key,
  player_id uuid not null references public.portfolio_players(id) on delete cascade,
  game text not null check (game in ('memory', 'sprint')),
  duration_ms integer not null check (duration_ms between 1000 and 3600000),
  moves integer,
  completed_at timestamptz not null default now(),
  check ((game = 'memory' and moves is not null and moves between 6 and 10000) or (game = 'sprint' and moves is null and duration_ms >= 15000))
);
create index if not exists portfolio_scores_best on public.portfolio_scores (game, player_id, moves, duration_ms, completed_at);
create table if not exists public.portfolio_sessions (
  token_hash text primary key,
  kind text not null check (kind in ('admin', 'player')),
  player_id uuid references public.portfolio_players(id) on delete cascade,
  expires_at timestamptz not null,
  check ((kind = 'admin' and player_id is null) or (kind = 'player' and player_id is not null))
);
create index if not exists portfolio_sessions_expiry on public.portfolio_sessions (expires_at);
create index if not exists portfolio_sessions_player on public.portfolio_sessions (player_id);
create table if not exists public.portfolio_rate_limits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index if not exists portfolio_rate_limits_expiry on public.portfolio_rate_limits (expires_at);

alter table public.portfolio_content enable row level security;
alter table public.portfolio_players enable row level security;
alter table public.portfolio_attempts enable row level security;
alter table public.portfolio_scores enable row level security;
alter table public.portfolio_sessions enable row level security;
alter table public.portfolio_rate_limits enable row level security;
revoke all on public.portfolio_content, public.portfolio_players, public.portfolio_attempts,
  public.portfolio_scores, public.portfolio_sessions, public.portfolio_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.portfolio_content, public.portfolio_players,
  public.portfolio_attempts, public.portfolio_scores, public.portfolio_sessions, public.portfolio_rate_limits to service_role;

-- Atomic attempt completion prevents duplicate/replayed results across functions.
create or replace function public.portfolio_finish_game(p_player uuid, p_attempt uuid, p_game text, p_duration integer, p_moves integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.portfolio_attempts; s public.portfolio_scores;
begin
  -- Serialize submissions for this attempt, including retries arriving together.
  perform pg_advisory_xact_lock(hashtextextended(p_attempt::text, 0));
  select * into s from public.portfolio_scores where id = p_attempt and player_id = p_player;
  if found then return to_jsonb(s); end if;
  select * into a from public.portfolio_attempts where id = p_attempt and player_id = p_player and game = p_game for update;
  if not found or a.expires_at <= clock_timestamp() then
    raise sqlstate 'PT409' using message = 'This ranked attempt has expired. Start a new game.';
  end if;
  if extract(epoch from (clock_timestamp() - a.starts_at)) * 1000 + 500 < p_duration then
    raise sqlstate 'PT400' using message = 'The game has not run long enough for this result.';
  end if;
  insert into public.portfolio_scores(id, player_id, game, duration_ms, moves)
    values (p_attempt, p_player, p_game, p_duration, p_moves) returning * into s;
  delete from public.portfolio_attempts where id = p_attempt;
  return to_jsonb(s);
end $$;

create or replace function public.portfolio_leaderboard(p_game text, p_player uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with best as (
    select distinct on (s.player_id) s.*, p.username
    from public.portfolio_scores s join public.portfolio_players p on p.id = s.player_id
    where s.game = p_game
    order by s.player_id, coalesce(s.moves, 0), s.duration_ms, s.completed_at, s.id
  ), ranked as (
    select *, rank() over (order by coalesce(moves, 0), duration_ms) as rank from best
  ), display as (
    select player_id, rank, completed_at, jsonb_build_object('id', id, 'playerId', player_id, 'username', username,
      'game', game, 'durationMs', duration_ms, 'completedAt', completed_at, 'rank', rank) ||
      case when moves is null then '{}'::jsonb else jsonb_build_object('moves', moves) end as entry from ranked
  ) select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(entry order by rank, completed_at, player_id) from (select * from display order by rank, completed_at, player_id limit 50) top_scores), '[]'::jsonb),
    'total', (select count(*) from display),
    'me', (select entry from display where player_id = p_player)
  );
$$;

create or replace function public.portfolio_rate_hit(p_key text, p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.portfolio_rate_limits;
begin
  delete from public.portfolio_rate_limits where key in (select key from public.portfolio_rate_limits where expires_at < now() - interval '1 day' limit 100);
  insert into public.portfolio_rate_limits(key, hits, expires_at)
    values (p_key, 1, now() + p_window_ms * interval '1 millisecond')
    on conflict (key) do update set
      hits = case when portfolio_rate_limits.expires_at <= now() then 1 else portfolio_rate_limits.hits + 1 end,
      expires_at = case when portfolio_rate_limits.expires_at <= now() then now() + p_window_ms * interval '1 millisecond' else portfolio_rate_limits.expires_at end
    returning * into r;
  return jsonb_build_object('totalHits', r.hits, 'resetTime', r.expires_at);
end $$;
revoke all on function public.portfolio_finish_game(uuid, uuid, text, integer, integer), public.portfolio_leaderboard(text, uuid), public.portfolio_rate_hit(text, integer) from public, anon, authenticated;
grant execute on function public.portfolio_finish_game(uuid, uuid, text, integer, integer), public.portfolio_leaderboard(text, uuid), public.portfolio_rate_hit(text, integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('project-covers', 'project-covers', true, 8388608, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;
-- No client write policies: only the admin API issues signed upload URLs.
notify pgrst, 'reload schema';
commit;
