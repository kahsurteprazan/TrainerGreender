begin;
-- An already-open attempt keeps its question snapshot even when lessons/questions change.
create or replace function public.learning_command(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; target_user bigint; a public.learning_attempts;
begin
 perform set_config('greender.owner',p_owner::text,true);
 if p_action in ('complete','start','grant') then
  if p_action='complete' then select section_id into sid from public.learning_lessons where id=(p_payload->>'lessonId')::uuid; else sid:=(p_payload->>'sectionId')::uuid; end if;
  target_user:=case when p_action='grant' then (p_payload->>'userId')::bigint else p_actor end;
  if not public.learning_section_visible(target_user,sid,p_owner) then raise exception 'Раздел недоступен этому пользователю'; end if;
 end if;
 if p_action='start' then
  perform public.learning_scope(p_actor,p_owner,p_actor);
  perform 1 from public.profiles where telegram_id=p_actor for update;
  perform public.learning_scope(p_actor,p_owner,p_actor);
  select * into a from public.learning_attempts where user_id=p_actor and section_id=sid and status='open' for update;
  if found then return public.learning_snapshot(p_actor)||jsonb_build_object('activeAttempt',jsonb_build_object('id',a.id,'sectionId',a.section_id,'questions',(select jsonb_agg(q-'correctIndex') from jsonb_array_elements(a.snapshot) q))); end if;
 end if;
 return public.learning_command_v1(p_actor,p_owner,p_action,p_payload);
end $$;
commit;
