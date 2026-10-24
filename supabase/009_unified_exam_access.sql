begin;
-- One explicit manager grant opens one attempt, regardless of study completion or past outcomes.
-- No course, progress, grant, or attempt rows are reset or deleted by this migration.
-- Scope/blocked/club checks, profile row locks, unique indexes, request-id deduplication,
-- server timing, answer secrecy and existing audit events are retained.
create or replace function public.exam_command(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not (ready_json->>'configured')::boolean then raise exception 'Для экзамена нужны 10 опубликованных вопросов и 3 вопроса раздела «Спорные моменты»'; end if;
  if a.status in ('active','oral') then raise exception 'Экзамен уже идёт. Дождитесь завершения текущей попытки'; end if;
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
  if exists(select 1 from public.exam_attempts where user_id=p_actor and status in ('active','oral')) then raise exception 'Экзамен уже идёт'; end if;
  ready_json:=public.exam_readiness(p_actor,p_owner);
  if not (ready_json->>'configured')::boolean then raise exception 'Экзамен ещё не настроен: недостаточно опубликованных вопросов'; end if;
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
revoke all on function public.exam_command(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.exam_command(bigint,bigint,text,jsonb) to service_role;
commit;
