-- ============================================================================
-- Cybersprouts — progress storage
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → Run.
--
-- Read this file before you trust it. The anon key in assets/js/supabase-config.js
-- is public by design; the only thing standing between one learner's progress and
-- another's is the Row Level Security (RLS) policies at the bottom of this file.
-- If RLS is off or the policies are wrong, every row is readable by anyone who
-- views the page source. If RLS is on and the policies are right, the public key
-- is harmless.
-- ============================================================================

-- ------------------------------------------------------------------- table
create table if not exists public.progress (
  -- One row per learner. Using the auth user id as the primary key makes it
  -- structurally impossible to own two conflicting rows.
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Completed lessons as "moduleId/lessonId" strings — the same keys key()
  -- builds in app.js.
  completed jsonb not null default '[]'::jsonb,

  -- Chosen specialization: 'red', 'yellow', 'blue', or null.
  team text,
  team_updated_at timestamptz,

  -- Placement test result: { correct, of, cleared, rechecked, takenAt }.
  placement jsonb,

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Cheap integrity guards. The client is untrusted — it is code running on
  -- someone else's computer, and they can edit it. Anything that must be true
  -- has to be enforced here, not in JavaScript.
  constraint team_is_known check (team is null or team in ('red', 'yellow', 'blue')),
  constraint completed_is_array check (jsonb_typeof(completed) = 'array'),
  -- Keeps a hostile client from using a progress row as free unlimited storage.
  constraint completed_is_sane check (jsonb_array_length(completed) <= 2000)
);

-- ------------------------------------------------------------ row security
alter table public.progress enable row level security;

-- Each policy is scoped `to authenticated`, so the anonymous role the public
-- key uses before sign-in matches no policy at all and sees nothing.
--
-- USING  decides which existing rows a statement may touch.
-- WITH CHECK decides what the resulting row is allowed to look like — without
-- it on insert/update, someone could write a row stamped with another user's
-- id, or re-point their own row at someone else's.

drop policy if exists "read own progress" on public.progress;
create policy "read own progress"
  on public.progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "create own progress" on public.progress;
create policy "create own progress"
  on public.progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update own progress" on public.progress;
create policy "update own progress"
  on public.progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete own progress" on public.progress;
create policy "delete own progress"
  on public.progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------- updated_at
-- Set server-side so the merge logic in sync.js compares timestamps the client
-- cannot backdate to win a conflict it should lose.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists progress_touch_updated_at on public.progress;
create trigger progress_touch_updated_at
  before update on public.progress
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Verify it works. With RLS correct, this returns zero rows for a signed-out
-- visitor and only their own row for a signed-in one:
--
--   select * from public.progress;
--
-- And this should FAIL for any authenticated user (it tries to claim a row for
-- somebody else), which is the check actually worth running:
--
--   insert into public.progress (user_id) values (gen_random_uuid());
-- ============================================================================
