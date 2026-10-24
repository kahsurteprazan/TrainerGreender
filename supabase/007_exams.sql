begin;
-- Only minimal outcomes are retained. The private task snapshot exists only during a live attempt.
create table public.exam_grants(
 id uuid primary key,user_id bigint not null references public.profiles(telegram_id),team_id uuid not null references public.teams(id),
 granted_by bigint not null references public.profiles(telegram_id),created_at timestamptz not null default now(),used_at timestamptz
);
create unique index one_unused_exam_grant on public.exam_grants(user_id) where used_at is null;
create table public.exam_attempts(
 id uuid primary key,grant_id uuid not null unique references public.exam_grants(id),user_id bigint not null references public.profiles(telegram_id),team_id uuid not null references public.teams(id),
 status text not null default 'active' check(status in ('active','oral','passed','failed')),
 errors int not null default 0 check(errors between 0 and 3),cursor int not null default 0 check(cursor between 0 and 33),
 snapshot jsonb,current_started_at timestamptz,started_at timestamptz not null default now(),finished_at timestamptz,reason text,
 check((status in ('active','oral') and snapshot is not null and finished_at is null) or (status in ('passed','failed') and snapshot is null and finished_at is not null))
);
create unique index one_live_exam on public.exam_attempts(user_id) where status in ('active','oral');
create index exam_attempt_history on public.exam_attempts(user_id,started_at desc);
create index exam_grants_team on public.exam_grants(team_id);
create index exam_attempt_team on public.exam_attempts(team_id);
create function public.exam_scope(p_actor bigint,p_owner bigint,p_target bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare team_uuid uuid;
begin
 if not exists(select 1 from public.profiles where telegram_id=p_actor and not blocked) then raise exception 'Доступ заблокирован'; end if;
 select m.team_id into team_uuid from public.memberships m join public.profiles p on p.telegram_id=m.user_id join public.teams t on t.id=m.team_id join public.clubs c on c.id=t.club_id
 where m.user_id=p_target and m.enabled and not p.blocked and t.enabled and c.enabled and (c.access_until is null or c.access_until>now());
 if team_uuid is null or p_target=p_owner or exists(select 1 from public.teams where trainer_id=p_target) then raise exception 'Экзамен доступен только ученику с открытым доступом'; end if;
 if p_actor<>p_target and p_actor<>p_owner and not exists(select 1 from public.teams where id=team_uuid and trainer_id=p_actor) then raise exception 'Нет доступа к этому ученику'; end if;
 return team_uuid;
end $$;
create function public.exam_readiness(p_user bigint,p_owner bigint) returns jsonb language sql stable security definer set search_path='' as $$
 with sections as (
  select s.id from public.learning_sections s where public.learning_section_visible(p_user,s.id,p_owner)
  and exists(select 1 from public.learning_lessons l where l.section_id=s.id and l.published and not l.archived)
 ), totals as (
  select count(*) total,count(*) filter(where exists(select 1 from public.learning_attempts a where a.user_id=p_user and a.section_id=s.id and a.passed)) passed from sections s
 ), lessons as (
  select count(*) total,count(*) filter(where exists(select 1 from public.learning_progress p where p.user_id=p_user and p.lesson_id=l.id)) done
  from public.learning_lessons l join sections s on s.id=l.section_id where l.published and not l.archived
 ), pool as (
  select count(*) total,count(*) filter(where s.slug='disputes') oral from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id join public.learning_sections s on s.id=q.section_id join sections v on v.id=s.id
  where q.published and not q.archived and l.published and not l.archived
 )
 select jsonb_build_object('sections',t.total,'passed',t.passed,'lessons',l.total,'completed',l.done,'questionCount',p.total,'oralCount',p.oral,
 'eligible',t.total>0 and t.total=t.passed and l.total=l.done,'configured',p.total>=10 and p.oral>=3)
 from totals t cross join lessons l cross join pool p;
$$;
create function public.exam_expire(p_user bigint) returns void language plpgsql security definer set search_path='' as $$
declare a public.exam_attempts;
begin
 select * into a from public.exam_attempts where user_id=p_user and status='active' for update;
 if found and not exists(select 1 from public.memberships m where m.user_id=p_user and m.team_id=a.team_id and m.enabled) then
  update public.exam_attempts set status='failed',finished_at=clock_timestamp(),reason='access_changed',snapshot=null,current_started_at=null where id=a.id;
  return;
 end if;
 if found and a.current_started_at is not null and clock_timestamp()>=a.current_started_at+interval '15 seconds' then
  update public.exam_attempts set errors=errors+1,cursor=cursor+1,current_started_at=null,
   status=case when errors>=2 then 'failed' when cursor=29 then 'oral' else 'active' end,
   snapshot=case when errors>=2 then null else snapshot end,finished_at=case when errors>=2 then clock_timestamp() else null end,
   reason=case when errors>=2 then 'third_error' else null end where id=a.id;
 end if;
end $$;
create function public.exam_state(p_user bigint,p_owner bigint,p_viewer bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.exam_attempts;g public.exam_grants;q jsonb;live_json jsonb;history_json jsonb;
begin
 select * into a from public.exam_attempts where user_id=p_user order by started_at desc,id desc limit 1;
 select g0.* into g from public.exam_grants g0 join public.memberships m on m.user_id=g0.user_id and m.team_id=g0.team_id where g0.user_id=p_user and g0.used_at is null;
 if a.id is not null then
  live_json:=jsonb_build_object('id',a.id,'status',a.status,'errors',a.errors,'index',a.cursor,'startedAt',a.started_at,'finishedAt',a.finished_at,'reason',a.reason,'teamId',a.team_id);
  if a.status in ('active','oral') and (a.current_started_at is not null or a.status='oral') then
   q:=(a.snapshot->a.cursor)-'answer'-'criteria';
   if p_viewer<>p_user and a.status='oral' then q:=q||jsonb_build_object('criteria',a.snapshot->a.cursor->>'criteria'); end if;
   live_json:=live_json||jsonb_build_object('question',q,'deadline',case when a.current_started_at is not null then a.current_started_at+interval '15 seconds' else null end);
  end if;
 end if;
 select coalesce(jsonb_agg(x.data order by x.started_at desc),'[]'::jsonb) into history_json from (
  select started_at,jsonb_build_object('id',id,'status',status,'startedAt',started_at,'finishedAt',finished_at,'reason',reason,'errors',errors) data
  from public.exam_attempts where user_id=p_user and finished_at is not null order by started_at desc limit 20
 ) x;
 return jsonb_build_object('userId',p_user,'readiness',public.exam_readiness(p_user,p_owner),'grant',case when g.id is not null then jsonb_build_object('id',g.id,'grantedAt',g.created_at,'grantedBy',g.granted_by) else null end,'attempt',live_json,'history',history_json,'serverNow',clock_timestamp());
end $$;
create function public.exam_command(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target_user bigint;team_uuid uuid; a public.exam_attempts;g public.exam_grants; ready_json jsonb;theory_json jsonb;oral_json jsonb;tasks_json jsonb;answer_json jsonb;wrong_value boolean;index_value int;rows_json jsonb;rec record;
begin
 if p_action='list' then
  if not exists(select 1 from public.profiles where telegram_id=p_actor and not blocked) or (p_actor<>p_owner and not exists(select 1 from public.teams where trainer_id=p_actor)) then raise exception 'Только тренер или владелец'; end if;
  rows_json:='[]'::jsonb;
  for rec in select m.user_id,p.display_name,t.name team_name from public.memberships m join public.profiles p on p.telegram_id=m.user_id join public.teams t on t.id=m.team_id join public.clubs c on c.id=t.club_id
   where (p_actor=p_owner or t.trainer_id=p_actor) and m.enabled and not p.blocked and t.enabled and c.enabled and (c.access_until is null or c.access_until>now()) order by p.display_name,m.user_id loop
   perform 1 from public.profiles where telegram_id=rec.user_id for update;
   perform public.exam_expire(rec.user_id);
   rows_json:=rows_json||jsonb_build_array(public.exam_state(rec.user_id,p_owner,p_actor)||jsonb_build_object('displayName',rec.display_name,'teamName',rec.team_name));
  end loop;
  return jsonb_build_object('rows',rows_json);
 end if;
 target_user:=coalesce((p_payload->>'userId')::bigint,p_actor);
 if p_action in ('start','question','answer','enter') then target_user:=p_actor; end if;
 perform 1 from public.profiles where telegram_id=target_user for update;
 team_uuid:=public.exam_scope(p_actor,p_owner,target_user);
 perform public.exam_expire(target_user);
 select * into a from public.exam_attempts where user_id=target_user order by started_at desc,id desc limit 1 for update;
 if p_action='enter' then
  -- A new page/session may not resume any live attempt, including the oral phase.
  if a.status in ('active','oral') then
   update public.exam_attempts set status='failed',finished_at=clock_timestamp(),reason='interrupted',snapshot=null,current_started_at=null where id=a.id;
  end if;
 elsif p_action='grant' then
  if p_actor=target_user then raise exception 'Нельзя допустить самого себя'; end if;
  ready_json:=public.exam_readiness(target_user,p_owner);
  if not (ready_json->>'eligible')::boolean then raise exception 'Сначала нужно сдать все тесты и пройти все обязательные уроки'; end if;
  if not (ready_json->>'configured')::boolean then raise exception 'Для экзамена нужны 10 опубликованных вопросов и 3 вопроса раздела «Спорные моменты»'; end if;
  if a.status in ('active','oral','passed') then raise exception 'Экзамен уже начат или сдан'; end if;
  select * into g from public.exam_grants where id=(p_payload->>'requestId')::uuid;
  if found then
   if g.user_id<>target_user or g.granted_by<>p_actor then raise exception 'Запрос уже использован'; end if;
  else
   update public.exam_grants set used_at=clock_timestamp() where user_id=target_user and used_at is null and team_id<>team_uuid;
   if exists(select 1 from public.exam_grants where user_id=target_user and used_at is null) then raise exception 'Допуск уже выдан'; end if;
   insert into public.exam_grants(id,user_id,team_id,granted_by) values((p_payload->>'requestId')::uuid,target_user,team_uuid,p_actor);
   insert into public.audit_log(actor_id,action,target) values(p_actor,'exam.granted',target_user::text);
  end if;
 elsif p_action='start' then
  select * into a from public.exam_attempts where id=(p_payload->>'attemptId')::uuid;
  if found then
   if a.user_id<>p_actor then raise exception 'Попытка недоступна'; end if;
   return public.exam_state(p_actor,p_owner,p_actor);
  end if;
  if exists(select 1 from public.exam_attempts where user_id=p_actor and status in ('active','oral','passed')) then raise exception 'Экзамен уже начат или сдан'; end if;
  ready_json:=public.exam_readiness(p_actor,p_owner);
  if not (ready_json->>'eligible')::boolean or not (ready_json->>'configured')::boolean then raise exception 'Условия допуска больше не выполнены'; end if;
  select * into g from public.exam_grants where user_id=p_actor and used_at is null and team_id=team_uuid for update;
  if not found then raise exception 'Требуется новый допуск тренера'; end if;
  select jsonb_agg(x.q) into theory_json from (
   select jsonb_build_object('kind','theory','prompt',q.prompt,'options',q.options,'cards',q.cards,'answer',q.correct_index) q
   from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id where q.published and not q.archived and l.published and not l.archived and public.learning_section_visible(p_actor,q.section_id,p_owner) order by random() limit 10
  ) x;
  select jsonb_agg(x.q) into oral_json from (
   select jsonb_build_object('kind','oral','prompt',q.prompt||' Объясните устно порядок действий дилера.','criteria',l.theory) q
   from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id join public.learning_sections s on s.id=q.section_id
   where s.slug='disputes' and q.published and not q.archived and l.published and not l.archived and public.learning_section_visible(p_actor,q.section_id,p_owner) order by random() limit 3
  ) x;
  tasks_json:=p_payload->'tasks';
  if jsonb_array_length(theory_json)<>10 or jsonb_array_length(oral_json)<>3 or jsonb_typeof(tasks_json) is distinct from 'array' or jsonb_array_length(tasks_json)<>20 then raise exception 'Не удалось подготовить задания'; end if;
  insert into public.exam_attempts(id,grant_id,user_id,team_id,snapshot) values((p_payload->>'attemptId')::uuid,g.id,p_actor,team_uuid,theory_json||tasks_json||oral_json);
  update public.exam_grants set used_at=clock_timestamp() where id=g.id;
  insert into public.audit_log(actor_id,action,target) values(p_actor,'exam.started',target_user::text);
 elsif p_action in ('question','answer','grade','abort') then
  if a.id is null or a.id<>(p_payload->>'attemptId')::uuid then raise exception 'Попытка не найдена'; end if;
  if a.team_id<>team_uuid then raise exception 'Состав команды изменился. Обратитесь к тренеру'; end if;
  if p_action='grade' and p_actor=target_user then raise exception 'Устный ответ оценивает только тренер'; end if;
  if a.status in ('passed','failed') then return public.exam_state(target_user,p_owner,p_actor); end if;
  if p_action='abort' then
   update public.exam_attempts set status='failed',finished_at=clock_timestamp(),reason='interrupted',snapshot=null,current_started_at=null where id=a.id;
  else
   if jsonb_typeof(p_payload->'index') is distinct from 'number' or (p_payload->>'index')!~'^[0-9]{1,2}$' then raise exception 'Неверный номер задания'; end if;
   index_value:=(p_payload->>'index')::int;
   if index_value<a.cursor then return public.exam_state(target_user,p_owner,p_actor); end if;
   if index_value<>a.cursor then raise exception 'Задания нужно проходить по порядку'; end if;
   if p_action='question' then
    if a.status='active' and a.current_started_at is null then update public.exam_attempts set current_started_at=clock_timestamp() where id=a.id; end if;
   elsif p_action='answer' then
    if a.status<>'active' or a.current_started_at is null then raise exception 'Сначала откройте вопрос'; end if;
    answer_json:=p_payload->'answer';
    if answer_json is null or answer_json='null'::jsonb then raise exception 'Время ещё не истекло'; end if;
    wrong_value:=answer_json is distinct from (a.snapshot->a.cursor->'answer');
   elsif p_action='grade' then
    if a.status<>'oral' or jsonb_typeof(p_payload->'passed') is distinct from 'boolean' then raise exception 'Сначала дождитесь устной части'; end if;
    wrong_value:=not (p_payload->>'passed')::boolean;
   end if;
   if p_action in ('answer','grade') then
    update public.exam_attempts set errors=errors+wrong_value::int,cursor=cursor+1,current_started_at=null,
     status=case when errors+wrong_value::int>=3 then 'failed' when cursor=32 then 'passed' when cursor>=29 then 'oral' else 'active' end,
     snapshot=case when errors+wrong_value::int>=3 or cursor=32 then null else snapshot end,
     finished_at=case when errors+wrong_value::int>=3 or cursor=32 then clock_timestamp() else null end,
     reason=case when errors+wrong_value::int>=3 then 'third_error' when cursor=32 then 'completed' else null end where id=a.id;
   end if;
  end if;
 elsif p_action<>'get' then raise exception 'Неизвестное действие';
 end if;
 return public.exam_state(target_user,p_owner,p_actor);
end $$;
alter table public.exam_grants enable row level security;
alter table public.exam_attempts enable row level security;
revoke all on public.exam_grants,public.exam_attempts from public,anon,authenticated;
grant all on public.exam_grants,public.exam_attempts to service_role;
revoke all on function public.exam_scope(bigint,bigint,bigint),public.exam_readiness(bigint,bigint),public.exam_expire(bigint),public.exam_state(bigint,bigint,bigint),public.exam_command(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.exam_command(bigint,bigint,text,jsonb) to service_role;
commit;
