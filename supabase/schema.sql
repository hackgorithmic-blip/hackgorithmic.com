-- hackgorithmic: esquema de cuentas y generador 3D.
-- Pegar COMPLETO en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin problema.

create extension if not exists pgcrypto;

-- ============ Modelos guardados por cada persona ============
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 120),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and pg_column_size(spec) <= 2048)
);
create index if not exists models_user_created on public.models (user_id, created_at desc);

alter table public.models enable row level security;
drop policy if exists "ver mis modelos" on public.models;
drop policy if exists "guardar mis modelos" on public.models;
drop policy if exists "borrar mis modelos" on public.models;
create policy "ver mis modelos"     on public.models for select to authenticated using ((select auth.uid()) = user_id);
create policy "guardar mis modelos" on public.models for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "borrar mis modelos"  on public.models for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.models from anon;
revoke update on public.models from authenticated;

-- Máximo 200 modelos guardados por persona (evita llenar la base de datos).
create or replace function public.models_quota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('models:' || new.user_id::text));
  if (select count(*) from public.models where user_id = new.user_id) >= 200 then
    raise exception 'models_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists models_quota on public.models;
create trigger models_quota before insert on public.models for each row execute function public.models_quota();

-- ============ Trabajos del generador con IA (solo el servidor escribe) ============
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'reserved',
  task_id text unique check (task_id is null or task_id ~ '^[A-Za-z0-9_-]{6,80}$'),
  prompt text not null check (char_length(prompt) between 3 and 400)
);
-- Columnas nuevas / versión anterior de la tabla:
alter table public.ai_jobs add column if not exists status text not null default 'running';
alter table public.ai_jobs alter column task_id drop not null;
alter table public.ai_jobs alter column user_id drop default;
alter table public.ai_jobs add column if not exists ip text;
alter table public.ai_jobs add column if not exists polled_at timestamptz;
alter table public.ai_jobs add column if not exists polls int not null default 0;
alter table public.ai_jobs add column if not exists downloads int not null default 0;
alter table public.ai_jobs add column if not exists model_path text;
alter table public.ai_jobs add column if not exists signed_at timestamptz;
alter table public.ai_jobs drop constraint if exists ai_jobs_status_check;
alter table public.ai_jobs add constraint ai_jobs_status_check check (status in ('reserved', 'running', 'success', 'failed'));
create index if not exists ai_jobs_user_created on public.ai_jobs (user_id, created_at desc);
create index if not exists ai_jobs_created on public.ai_jobs (created_at desc);
create index if not exists ai_jobs_ip_created on public.ai_jobs (ip, created_at desc);

alter table public.ai_jobs enable row level security;
drop policy if exists "ver mis trabajos" on public.ai_jobs;
drop policy if exists "crear mis trabajos" on public.ai_jobs;
create policy "ver mis trabajos" on public.ai_jobs for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.ai_jobs from anon;
revoke insert, update, delete on public.ai_jobs from authenticated;

-- Modelos terminados: bucket PRIVADO; solo el servidor escribe y entrega enlaces firmados de 5 minutos.
insert into storage.buckets (id, name, public) values ('ai-models', 'ai-models', false) on conflict (id) do nothing;

-- Reserva atómica de cupo, ANTES de gastar créditos. Bloquea y cuenta (últimas 24 h, fallidos incluidos):
-- global, por persona y por IP. Las cuentas con menos de 24 h no pueden usar la IA (frena cuentas desechables).
drop function if exists public.reserve_ai_job(uuid, text, int, int);
create or replace function public.reserve_ai_job(p_user uuid, p_prompt text, p_ip text, p_user_limit int, p_global_limit int, p_ip_limit int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_created timestamptz;
begin
  if p_user is null or coalesce(p_user_limit, 0) < 1 or coalesce(p_global_limit, 0) < 1 or coalesce(p_ip_limit, 0) < 1 then
    raise exception 'bad_limits';
  end if;
  select created_at into v_created from auth.users where id = p_user;
  if v_created is null or v_created > now() - interval '24 hours' then
    raise exception 'limit_new';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_jobs'));
  if (select count(*) from public.ai_jobs where created_at > now() - interval '24 hours') >= p_global_limit then
    raise exception 'limit_global';
  end if;
  if (select count(*) from public.ai_jobs where user_id = p_user and created_at > now() - interval '24 hours') >= p_user_limit then
    raise exception 'limit_user';
  end if;
  if (select count(*) from public.ai_jobs where ip = coalesce(nullif(p_ip, ''), 'unknown') and created_at > now() - interval '24 hours') >= p_ip_limit then
    raise exception 'limit_ip';
  end if;
  insert into public.ai_jobs (user_id, prompt, ip) values (p_user, p_prompt, coalesce(nullif(p_ip, ''), 'unknown')) returning id into v_id;
  return v_id;
end $$;

-- Medidor por trabajo: consultas máx. 1 cada 2 s y 400 por trabajo; descarga desde Tripo máx. 5 intentos;
-- enlaces firmados de un modelo ya guardado: máx. 1 cada 2 s (sin límite de por vida). Sin fila = "throttle" (429).
create or replace function public.touch_ai_job(p_user uuid, p_task text, p_file boolean)
returns table (job_status text, job_model_path text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.ai_jobs j
     set polled_at = case when p_file then j.polled_at else now() end,
         polls     = j.polls + case when p_file then 0 else 1 end,
         downloads = j.downloads + case when p_file and j.model_path is null then 1 else 0 end,
         signed_at = case when p_file and j.model_path is not null then now() else j.signed_at end
   where j.task_id = p_task and j.user_id = p_user
     and (
       (not p_file and (j.polled_at is null or j.polled_at < now() - interval '2 seconds') and j.polls < 400)
       or (p_file and j.model_path is null and j.downloads < 5)
       or (p_file and j.model_path is not null and (j.signed_at is null or j.signed_at < now() - interval '2 seconds'))
     )
  returning j.status, j.model_path;
end $$;

revoke all on function public.reserve_ai_job(uuid, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.reserve_ai_job(uuid, text, text, int, int, int) to service_role;
revoke all on function public.touch_ai_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.touch_ai_job(uuid, text, boolean) to service_role;
revoke all on function public.models_quota() from public, anon, authenticated;
