-- Run once in Supabase SQL Editor. This schema is server-only: no public client access.
begin;
create table public.profiles (
 telegram_id bigint primary key, display_name text not null, username text,
 blocked boolean not null default false, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create table public.clubs (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 enabled boolean not null default true, access_until timestamptz,
 created_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
 name text not null check(length(name) between 1 and 100), trainer_id bigint not null references public.profiles(telegram_id),
 invite_code text not null unique default (replace(gen_random_uuid()::text,'-','') || substr(replace(gen_random_uuid()::text,'-',''),1,16)), enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.memberships (
 user_id bigint primary key references public.profiles(telegram_id),
 team_id uuid not null references public.teams(id), joined_at timestamptz not null default now()
);
create table public.access_requests (
 id uuid primary key default gen_random_uuid(), user_id bigint not null references public.profiles(telegram_id),
 team_id uuid not null references public.teams(id), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), decided_at timestamptz, decided_by bigint references public.profiles(telegram_id)
);
create unique index one_pending_request_per_user on public.access_requests(user_id) where status='pending';
create index requests_by_team on public.access_requests(team_id,status);
create index members_by_team on public.memberships(team_id);
create index teams_by_trainer on public.teams(trainer_id);
create table public.audit_log (
 id bigint generated always as identity primary key, actor_id bigint not null references public.profiles(telegram_id),
 action text not null, target text not null, created_at timestamptz not null default now()
);
-- Concurrent requests for one user are serialized. A trainer cannot join as a student.
create function public.request_access(p_user bigint,p_code text) returns public.access_requests
language plpgsql security definer set search_path = '' as $$
declare t public.teams; r public.access_requests;
begin
 perform 1 from public.profiles where telegram_id=p_user and not blocked for update;
 if not found then raise exception 'Пользователь заблокирован'; end if;
 if exists(select 1 from public.memberships where user_id=p_user) or exists(select 1 from public.teams where trainer_id=p_user) then raise exception 'У вас уже есть команда или роль тренера'; end if;
 select tm.* into t from public.teams tm join public.clubs c on c.id=tm.club_id where tm.invite_code=p_code and tm.enabled and c.enabled and (c.access_until is null or c.access_until>now());
 if not found then raise exception 'Приглашение недоступно'; end if;
 select * into r from public.access_requests where user_id=p_user and status='pending';
 if found then
   if r.team_id<>t.id then raise exception 'Сначала дождитесь решения по текущей заявке'; end if;
   return r;
 end if;
 insert into public.access_requests(user_id,team_id) values(p_user,t.id) returning * into r;
 return r;
end $$;
create function public.decide_request(p_actor bigint,p_owner bigint,p_request uuid,p_approve boolean) returns public.access_requests
language plpgsql security definer set search_path = '' as $$
declare r public.access_requests; t public.teams; c public.clubs;
begin
 select * into r from public.access_requests where id=p_request;
 if not found then raise exception 'Заявка не найдена'; end if;
 perform 1 from public.profiles where telegram_id=r.user_id for update;
 select * into r from public.access_requests where id=p_request for update;
 select * into t from public.teams where id=r.team_id for share;
 if p_actor<>p_owner and p_actor<>t.trainer_id then raise exception 'Нет доступа'; end if;
 if not exists(select 1 from public.profiles where telegram_id=p_actor and not blocked) then raise exception 'Нет доступа'; end if;
 if r.status<>'pending' then raise exception 'Заявка уже обработана'; end if;
 if p_approve then
  select * into c from public.clubs where id=t.club_id for share;
  if not t.enabled or not c.enabled or (c.access_until is not null and c.access_until<=now()) then raise exception 'Доступ клуба отключён'; end if;
  if exists(select 1 from public.profiles where telegram_id=r.user_id and blocked) then raise exception 'Ученик заблокирован'; end if;
  if exists(select 1 from public.teams where trainer_id=r.user_id) then raise exception 'Пользователь уже тренер'; end if;
  insert into public.memberships(user_id,team_id) values(r.user_id,r.team_id);
 end if;
 update public.access_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=p_actor where id=r.id returning * into r;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'request.'||r.status,r.id::text);
 return r;
end $$;
create function public.create_team(p_owner bigint,p_club uuid,p_name text,p_trainer bigint) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare t public.teams;
begin
 perform 1 from public.profiles where telegram_id=p_trainer and not blocked for update;
 if not found then raise exception 'Тренер должен сначала запустить бота и не быть заблокирован'; end if;
 if p_trainer=p_owner or exists(select 1 from public.memberships where user_id=p_trainer) then raise exception 'Нельзя назначить владельца или ученика тренером'; end if;
 insert into public.teams(club_id,name,trainer_id) values(p_club,p_name,p_trainer) returning * into t;
 update public.access_requests set status='rejected',decided_at=now(),decided_by=p_owner where user_id=p_trainer and status='pending';
 insert into public.audit_log(actor_id,action,target) values(p_owner,'team.created',t.id::text);
 return t;
end $$;
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.access_requests enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles,public.clubs,public.teams,public.memberships,public.access_requests,public.audit_log from anon,authenticated;
revoke all on function public.request_access(bigint,text),public.decide_request(bigint,bigint,uuid,boolean),public.create_team(bigint,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.request_access(bigint,text),public.decide_request(bigint,bigint,uuid,boolean),public.create_team(bigint,uuid,text,bigint) to service_role;
grant all on public.profiles,public.clubs,public.teams,public.memberships,public.access_requests,public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
commit;
