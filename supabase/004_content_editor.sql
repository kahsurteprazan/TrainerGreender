begin;
alter table public.learning_sections add column club_id uuid references public.clubs(id), add column archived boolean not null default false, add column ever_published boolean not null default true;
alter table public.learning_lessons add column archived boolean not null default false, add column ever_published boolean not null default true;
alter table public.learning_questions add column published boolean not null default true, add column archived boolean not null default false, add column ever_published boolean not null default true;
create function public.learning_section_visible(p_user bigint,p_section uuid,p_owner bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.learning_sections s where s.id=p_section and s.published and not s.archived and (s.club_id is null or p_user=p_owner or exists(select 1 from public.memberships m join public.teams t on t.id=m.team_id where m.user_id=p_user and t.club_id=s.club_id) or exists(select 1 from public.teams t where t.trainer_id=p_user and t.club_id=s.club_id)));
$$;
-- Snapshots have no test keys. Club visibility is based on the target learner, not the viewer.
create or replace function public.learning_snapshot(p_user bigint) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('userId',p_user,
 'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'description',s.description,'slug',s.slug,'questionCount',(select count(*) from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id where q.section_id=s.id and q.published and not q.archived and l.published and not l.archived),'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'theory',l.theory,'videoUrl',l.video_url,'cards',l.cards,'steps',l.steps) order by l.sort_order,l.id) from public.learning_lessons l where l.section_id=s.id and l.published and not l.archived),'[]'::jsonb)) order by s.sort_order,s.id) from public.learning_sections s where s.published and not s.archived and (s.club_id is null or exists(select 1 from public.memberships m join public.teams t on t.id=m.team_id where m.user_id=p_user and t.club_id=s.club_id) or exists(select 1 from public.teams t where t.trainer_id=p_user and t.club_id=s.club_id) or p_user=nullif(current_setting('greender.owner',true),'')::bigint)),'[]'::jsonb),
 'progress',coalesce((select jsonb_agg(jsonb_build_object('lessonId',lesson_id,'completedAt',completed_at)) from public.learning_progress where user_id=p_user),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sectionId',section_id,'status',status,'score',score,'total',total,'passed',passed,'startedAt',started_at,'submittedAt',submitted_at) order by started_at desc,id) from public.learning_attempts where user_id=p_user),'[]'::jsonb),
 'grants',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sectionId',section_id,'grantedBy',granted_by,'createdAt',created_at)) from public.learning_grants where user_id=p_user),'[]'::jsonb));
$$;
create function public.learning_command_v1(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target_user bigint; section_uuid uuid; lesson_uuid uuid; attempt_uuid uuid; request_uuid uuid; a public.learning_attempts; g public.learning_grants; snapshot_json jsonb; question_json jsonb; answer_json jsonb; score_value int:=0; total_value int; used_value int; allowance_value int; completed_value int; section_value public.learning_sections;
begin
 target_user:=coalesce((p_payload->>'userId')::bigint,p_actor);
 if p_action not in ('get','grant') then target_user:=p_actor; end if;
 perform public.learning_scope(p_actor,p_owner,target_user);
 if p_action='get' then return public.learning_snapshot(target_user); end if;
 perform 1 from public.profiles where telegram_id=target_user for update;
 -- Recheck after the profile lock: membership operations use the same lock.
 perform public.learning_scope(p_actor,p_owner,target_user);
 if p_action='complete' then
  lesson_uuid:=(p_payload->>'lessonId')::uuid;
  if not exists(select 1 from public.learning_lessons l join public.learning_sections s on s.id=l.section_id where l.id=lesson_uuid and l.published and s.published) then raise exception 'Урок недоступен'; end if;
  insert into public.learning_progress(user_id,lesson_id) values(p_actor,lesson_uuid) on conflict do nothing;
 elsif p_action='start' then
  section_uuid:=(p_payload->>'sectionId')::uuid;
  select * into section_value from public.learning_sections where id=section_uuid and published;
  if not found then raise exception 'Раздел недоступен'; end if;
  if not exists(select 1 from public.learning_lessons where section_id=section_uuid and published) or exists(select 1 from public.learning_lessons l where l.section_id=section_uuid and l.published and not exists(select 1 from public.learning_progress p where p.user_id=p_actor and p.lesson_id=l.id)) then raise exception 'Сначала ознакомьтесь со всеми уроками раздела'; end if;
  if exists(select 1 from public.learning_attempts where user_id=p_actor and section_id=section_uuid and passed) then raise exception 'Тест раздела уже сдан'; end if;
  select * into a from public.learning_attempts where user_id=p_actor and section_id=section_uuid and status='open';
  if not found then
   select count(*) into used_value from public.learning_attempts where user_id=p_actor and section_id=section_uuid and status='submitted';
   select 2+count(*) into allowance_value from public.learning_grants where user_id=p_actor and section_id=section_uuid;
   if used_value>=allowance_value then raise exception 'Попытки закончились. Обратитесь к тренеру'; end if;
   select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'correctIndex',q.correct_index,'cards',q.cards) order by random()) into snapshot_json from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id where q.section_id=section_uuid and q.published and not q.archived and l.published and not l.archived;
   if snapshot_json is null then raise exception 'В разделе пока нет вопросов'; end if;
   insert into public.learning_attempts(user_id,section_id,snapshot) values(p_actor,section_uuid,snapshot_json) returning * into a;
  end if;
  return public.learning_snapshot(p_actor)||jsonb_build_object('activeAttempt',jsonb_build_object('id',a.id,'sectionId',a.section_id,'questions',(select jsonb_agg(q-'correctIndex') from jsonb_array_elements(a.snapshot) q)));
 elsif p_action='submit' then
  attempt_uuid:=(p_payload->>'attemptId')::uuid;
  select * into a from public.learning_attempts where id=attempt_uuid and user_id=p_actor for update;
  if not found then raise exception 'Попытка не найдена'; end if;
  if a.status='open' then
   answer_json:=p_payload->'answers';total_value:=jsonb_array_length(a.snapshot);
   if answer_json is null or jsonb_typeof(answer_json)<>'object' then raise exception 'Ответьте на все вопросы'; end if;
   if (select count(*) from jsonb_object_keys(answer_json))<>total_value then raise exception 'Ответьте на все вопросы'; end if;
   for question_json in select value from jsonb_array_elements(a.snapshot) loop
    if jsonb_typeof(answer_json->(question_json->>'id')) is distinct from 'number' or coalesce(answer_json->>(question_json->>'id'),'')!~'^[0-9]+$' then raise exception 'Некорректный ответ'; end if;
    if (answer_json->>(question_json->>'id'))::int<0 or (answer_json->>(question_json->>'id'))::int>=jsonb_array_length(question_json->'options') then raise exception 'Некорректный вариант ответа'; end if;
    if (answer_json->>(question_json->>'id'))::int=(question_json->>'correctIndex')::int then score_value:=score_value+1; end if;
   end loop;
   update public.learning_attempts set status='submitted',answers=answer_json,score=score_value,total=total_value,passed=(score_value=total_value),submitted_at=now() where id=a.id returning * into a;
   insert into public.audit_log(actor_id,action,target) values(p_actor,'learning.submitted',a.id::text);
  end if;
  return public.learning_snapshot(p_actor)||jsonb_build_object('result',jsonb_build_object('id',a.id,'sectionId',a.section_id,'score',a.score,'total',a.total,'passed',a.passed));
 elsif p_action='grant' then
  if p_actor=target_user and p_actor<>p_owner then raise exception 'Нельзя выдавать попытки самому себе'; end if;
  section_uuid:=(p_payload->>'sectionId')::uuid;request_uuid:=(p_payload->>'requestId')::uuid;
  select * into g from public.learning_grants where id=request_uuid;
  if found then
   if g.user_id<>target_user or g.section_id<>section_uuid or g.granted_by<>p_actor then raise exception 'Запрос уже использован'; end if;
   return public.learning_snapshot(target_user);
  end if;
  if not exists(select 1 from public.learning_sections where id=section_uuid and published) then raise exception 'Раздел недоступен'; end if;
  if exists(select 1 from public.learning_attempts where user_id=target_user and section_id=section_uuid and passed) then raise exception 'Тест уже сдан'; end if;
  select count(*) into used_value from public.learning_attempts where user_id=target_user and section_id=section_uuid and status='submitted';
  select 2+count(*) into allowance_value from public.learning_grants where user_id=target_user and section_id=section_uuid;
  if used_value<allowance_value then raise exception 'У ученика ещё есть доступные попытки'; end if;
  insert into public.learning_grants(id,user_id,section_id,granted_by) values(request_uuid,target_user,section_uuid,p_actor);
  insert into public.audit_log(actor_id,action,target) values(p_actor,'learning.granted',target_user::text||':'||section_uuid::text);
 elsif p_action='edit' then
  if p_actor<>p_owner then raise exception 'Редактирование доступно только владельцу'; end if;
  lesson_uuid:=(p_payload->>'lessonId')::uuid;
  update public.learning_lessons set title=trim(p_payload->>'title'),theory=trim(p_payload->>'theory'),video_url=nullif(p_payload->>'videoUrl',''),updated_at=now() where id=lesson_uuid;
  if not found then raise exception 'Урок не найден'; end if;
  insert into public.audit_log(actor_id,action,target) values(p_actor,'learning.edited',lesson_uuid::text);
 else raise exception 'Неизвестное действие';
 end if;
 return public.learning_snapshot(target_user);
end $$;
create or replace function public.learning_command(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; target_user bigint;
begin
 perform set_config('greender.owner',p_owner::text,true);
 if p_action in ('complete','start','grant') then
  if p_action='complete' then select section_id into sid from public.learning_lessons where id=(p_payload->>'lessonId')::uuid; else sid:=(p_payload->>'sectionId')::uuid; end if;
  target_user:=case when p_action='grant' then (p_payload->>'userId')::bigint else p_actor end;
  if not public.learning_section_visible(target_user,sid,p_owner) then raise exception 'Раздел недоступен этому пользователю'; end if;
 end if;
 return public.learning_command_v1(p_actor,p_owner,p_action,p_payload);
end $$;
create function public.learning_editor_snapshot() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('editor',jsonb_build_object(
 'sections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'clubId',club_id,'sortOrder',sort_order,'published',published,'archived',archived,'everPublished',ever_published) order by sort_order,id) from public.learning_sections),'[]'::jsonb),
 'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sectionId',section_id,'title',title,'theory',theory,'videoUrl',video_url,'sortOrder',sort_order,'published',published,'archived',archived,'everPublished',ever_published) order by sort_order,id) from public.learning_lessons),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sectionId',section_id,'lessonId',lesson_id,'prompt',prompt,'options',options,'correctIndex',correct_index,'sortOrder',sort_order,'published',published,'archived',archived,'everPublished',ever_published) order by sort_order,id) from public.learning_questions),'[]'::jsonb)));
$$;
create function public.learning_editor(p_actor bigint,p_owner bigint,p_operation text,p_kind text default null,p_id uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; lid uuid; club_uuid uuid; pub boolean; arch boolean; ever boolean; ids uuid[]; other uuid; pos int; idx int; row_json jsonb; options_json jsonb; correct_value int; n int;
begin
 if p_actor<>p_owner or not exists(select 1 from public.profiles where telegram_id=p_actor and not blocked) then raise exception 'Только владелец'; end if;
 perform set_config('greender.owner',p_owner::text,true);
 if p_operation='get' then return public.learning_editor_snapshot(); end if;
 if p_kind not in ('section','lesson','question') or p_id is null then raise exception 'Некорректный материал'; end if;
 perform pg_advisory_xact_lock(9042026);
 if p_operation='save' then
  if p_kind='section' then
   if coalesce(length(trim(p_payload->>'title')),0) not between 1 and 200 or length(coalesce(p_payload->>'description',''))>2000 then raise exception 'Проверьте название и описание'; end if;
   club_uuid:=nullif(p_payload->>'clubId','')::uuid;
   if club_uuid is not null and not exists(select 1 from public.clubs where id=club_uuid) then raise exception 'Клуб не найден'; end if;
   -- Publishing is separate and validated; a repeated create request only updates the same UUID.
   insert into public.learning_sections(id,slug,title,description,club_id,sort_order,published,ever_published) values(p_id,'custom-'||p_id::text,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),club_uuid,coalesce((select max(sort_order)+1 from public.learning_sections),0),false,false)
   on conflict(id) do update set title=excluded.title,description=excluded.description,club_id=excluded.club_id;
  elsif p_kind='lesson' then
   sid:=(p_payload->>'sectionId')::uuid;
   if not exists(select 1 from public.learning_sections where id=sid and not archived) then raise exception 'Раздел не найден или в архиве'; end if;
   if exists(select 1 from public.learning_lessons where id=p_id and section_id<>sid) then raise exception 'Перенос уроков между разделами пока недоступен'; end if;
   if coalesce(length(trim(p_payload->>'title')),0) not between 1 and 200 or coalesce(length(trim(p_payload->>'theory')),0) not between 1 and 20000 then raise exception 'Заполните название и теорию'; end if;
   if nullif(p_payload->>'videoUrl','') is not null and (p_payload->>'videoUrl'!~'^https://' or length(p_payload->>'videoUrl')>2048) then raise exception 'Нужна HTTPS-ссылка'; end if;
   insert into public.learning_lessons(id,section_id,title,theory,video_url,sort_order,published,ever_published) values(p_id,sid,trim(p_payload->>'title'),trim(p_payload->>'theory'),nullif(p_payload->>'videoUrl',''),coalesce((select max(sort_order)+1 from public.learning_lessons where section_id=sid),0),false,false)
   on conflict(id) do update set title=excluded.title,theory=excluded.theory,video_url=excluded.video_url,updated_at=now();
  else
   lid:=(p_payload->>'lessonId')::uuid; select section_id into sid from public.learning_lessons where id=lid and not archived;
   if sid is null or not exists(select 1 from public.learning_sections where id=sid and not archived) then raise exception 'Урок не найден или в архиве'; end if;
   if exists(select 1 from public.learning_questions where id=p_id and (section_id<>sid or lesson_id<>lid)) then raise exception 'Перенос вопросов между уроками пока недоступен'; end if;
   options_json:=p_payload->'options';correct_value:=(p_payload->>'correctIndex')::int;
   if coalesce(length(trim(p_payload->>'prompt')),0) not between 1 and 2000 or jsonb_typeof(options_json) is distinct from 'array' then raise exception 'Заполните вопрос и варианты'; end if;
   n:=jsonb_array_length(options_json);
   if n not between 2 and 6 or correct_value is null or correct_value<0 or correct_value>=n or exists(select 1 from jsonb_array_elements(options_json) v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 500) then raise exception 'Нужны 2–6 вариантов и один правильный ответ'; end if;
   if (select count(distinct lower(trim(v#>>'{}'))) from jsonb_array_elements(options_json) v)<>n then raise exception 'Варианты ответа не должны повторяться'; end if;
   insert into public.learning_questions(id,section_id,lesson_id,prompt,options,correct_index,sort_order,published,ever_published) values(p_id,sid,lid,trim(p_payload->>'prompt'),options_json,correct_value,coalesce((select max(sort_order)+1 from public.learning_questions where section_id=sid),0),false,false)
   on conflict(id) do update set prompt=excluded.prompt,options=excluded.options,correct_index=excluded.correct_index;
  end if;
 elsif p_operation in ('publish','hide','archive','restore','delete','move') then
  if p_kind='section' then select to_jsonb(s) into row_json from public.learning_sections s where id=p_id for update;sid:=p_id;
  elsif p_kind='lesson' then select to_jsonb(l) into row_json from public.learning_lessons l where id=p_id for update;sid:=(row_json->>'section_id')::uuid;
  else select to_jsonb(q) into row_json from public.learning_questions q where id=p_id for update;sid:=(row_json->>'section_id')::uuid; end if;
  if row_json is null then raise exception 'Материал не найден'; end if;
  pub:=(row_json->>'published')::boolean;arch:=(row_json->>'archived')::boolean;ever:=(row_json->>'ever_published')::boolean;
  if p_operation='publish' then
   if arch then raise exception 'Сначала восстановите материал из архива'; end if;
   if p_kind<>'section' and exists(select 1 from public.learning_sections where id=sid and archived) then raise exception 'Раздел находится в архиве'; end if;
   if p_kind='question' and not pub and (select count(*) from public.learning_questions where section_id=sid and published and not archived)>=100 then raise exception 'В разделе допускается до 100 опубликованных вопросов'; end if;
   if p_kind='question' and exists(select 1 from public.learning_lessons where id=(row_json->>'lesson_id')::uuid and archived) then raise exception 'Урок находится в архиве'; end if;
   if p_kind='section' and (not exists(select 1 from public.learning_lessons where section_id=p_id and published and not archived) or not exists(select 1 from public.learning_questions q join public.learning_lessons l on l.id=q.lesson_id where q.section_id=p_id and q.published and not q.archived and l.published and not l.archived)) then raise exception 'Для публикации раздела опубликуйте хотя бы один урок и вопрос теста'; end if;
  elsif p_operation='delete' then
   if ever or pub then raise exception 'Опубликованные ранее материалы можно только архивировать'; end if;
   if p_kind='section' then
    if exists(select 1 from public.learning_lessons where section_id=p_id and ever_published) or exists(select 1 from public.learning_questions where section_id=p_id and ever_published) or exists(select 1 from public.learning_attempts where section_id=p_id) or exists(select 1 from public.learning_grants where section_id=p_id) or exists(select 1 from public.learning_progress p join public.learning_lessons l on l.id=p.lesson_id where l.section_id=p_id) then raise exception 'Есть история использования: перенесите раздел в архив'; end if;
    delete from public.learning_questions where section_id=p_id;delete from public.learning_lessons where section_id=p_id;delete from public.learning_sections where id=p_id;
   elsif p_kind='lesson' then
    if exists(select 1 from public.learning_progress where lesson_id=p_id) or exists(select 1 from public.learning_questions where lesson_id=p_id and ever_published) or exists(select 1 from public.learning_attempts a cross join lateral jsonb_array_elements(a.snapshot) q where exists(select 1 from public.learning_questions where lesson_id=p_id and id=(q->>'id')::uuid)) then raise exception 'Есть история использования: перенесите урок в архив'; end if;
    delete from public.learning_questions where lesson_id=p_id;delete from public.learning_lessons where id=p_id;
   else
    if exists(select 1 from public.learning_attempts a cross join lateral jsonb_array_elements(a.snapshot) q where q->>'id'=p_id::text) then raise exception 'Вопрос уже использовался: перенесите его в архив'; end if;
    delete from public.learning_questions where id=p_id;
   end if;
  elsif p_operation='move' then
   if p_kind='section' then select array_agg(id order by sort_order,id) into ids from public.learning_sections where archived=arch;
   elsif p_kind='lesson' then select array_agg(id order by sort_order,id) into ids from public.learning_lessons where section_id=sid and archived=arch;
   else select array_agg(id order by sort_order,id) into ids from public.learning_questions where section_id=sid and archived=arch;end if;
   pos:=array_position(ids,p_id);idx:=pos+case when p_payload->>'direction'='up' then -1 when p_payload->>'direction'='down' then 1 else 0 end;
   if idx>=1 and idx<=array_length(ids,1) then other:=ids[idx];ids[idx]:=p_id;ids[pos]:=other;end if;
   for n in 1..coalesce(array_length(ids,1),0) loop
    if p_kind='section' then update public.learning_sections set sort_order=n-1 where id=ids[n];elsif p_kind='lesson' then update public.learning_lessons set sort_order=n-1 where id=ids[n];else update public.learning_questions set sort_order=n-1 where id=ids[n];end if;
   end loop;
  end if;
  if p_operation in ('publish','hide','archive','restore') then
   pub:=p_operation='publish';arch:=case when p_operation='archive' then true when p_operation='restore' then false else arch end;
   if p_kind='section' then update public.learning_sections set published=pub,archived=arch,ever_published=ever_published or pub where id=p_id;
   elsif p_kind='lesson' then update public.learning_lessons set published=pub,archived=arch,ever_published=ever_published or pub where id=p_id;
   else update public.learning_questions set published=pub,archived=arch,ever_published=ever_published or pub where id=p_id;end if;
  end if;
 else raise exception 'Неизвестное действие редактора'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'content.'||p_operation,p_kind||':'||p_id::text);
 return public.learning_editor_snapshot();
end $$;
revoke all on function public.learning_section_visible(bigint,uuid,bigint),public.learning_editor_snapshot(),public.learning_editor(bigint,bigint,text,text,uuid,jsonb),public.learning_command_v1(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.learning_section_visible(bigint,uuid,bigint),public.learning_editor_snapshot(),public.learning_editor(bigint,bigint,text,text,uuid,jsonb),public.learning_command_v1(bigint,bigint,text,jsonb) to service_role;
commit;
