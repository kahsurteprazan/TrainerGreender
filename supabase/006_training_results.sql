begin;
create table public.training_runs(
 id uuid primary key, user_id bigint not null references public.profiles(telegram_id), team_id uuid references public.teams(id),
 game text not null check(game in ('sidepots','winner')), difficulty text not null, answer_format text not null, timed boolean not null,
 started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 score int, correct int, errors int, attempts int, duration_ms int,
 check((game='sidepots' and difficulty in ('easy','medium','hard') and answer_format in ('choice','input')) or (game='winner' and difficulty='standard' and answer_format='selection')),
 check(finished_at is null or (score between 0 and 2000 and correct between 0 and 8003 and errors between 0 and 2 and attempts=correct+errors and score<=correct and duration_ms between 0 and 86400000))
);
create index training_user_history on public.training_runs(user_id,finished_at desc) where finished_at is not null;
create index training_leaderboard on public.training_runs(game,difficulty,answer_format,score desc,user_id) where timed and finished_at is not null;
create index training_team on public.training_runs(team_id);
alter table public.training_runs enable row level security;
revoke all on public.training_runs from public,anon,authenticated;
grant all on public.training_runs to service_role;

create function public.training_result(p_run public.training_runs) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p_run.id,'game',p_run.game,'difficulty',p_run.difficulty,'answerFormat',p_run.answer_format,'timed',p_run.timed,'startedAt',p_run.started_at,'finishedAt',p_run.finished_at,'score',p_run.score,'correct',p_run.correct,'errors',p_run.errors,'attempts',p_run.attempts,'durationMs',p_run.duration_ms);
$$;
create function public.training_command(p_actor bigint,p_owner bigint,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.training_runs; target_user bigint; team_uuid uuid; game_value text; difficulty_value text; format_value text; timed_value boolean; score_value int; correct_value int; errors_value int; attempts_value int; duration_value int; rows_json jsonb; mine_json jsonb;
begin
 target_user:=case when p_action='get' then coalesce((p_payload->>'userId')::bigint,p_actor) else p_actor end;
 perform public.learning_scope(p_actor,p_owner,target_user);
 if p_action='get' then
  return jsonb_build_object('userId',target_user,'summary',(select jsonb_build_object('runs',count(*),'runs7d',count(*) filter(where finished_at>=now()-interval '7 days'),'runs30d',count(*) filter(where finished_at>=now()-interval '30 days'),'lastTraining',max(finished_at),'correct',coalesce(sum(correct),0),'attempts',coalesce(sum(attempts),0),'errors',coalesce(sum(errors),0)) from public.training_runs where user_id=target_user and finished_at is not null),
   'records',coalesce((select jsonb_agg(x.data order by x.game,x.difficulty,x.answer_format,x.timed desc) from (select distinct on(game,difficulty,answer_format,timed) game,difficulty,answer_format,timed,public.training_result(t) data from public.training_runs t where user_id=target_user and finished_at is not null order by game,difficulty,answer_format,timed,score desc,finished_at asc,id) x),'[]'::jsonb),
   'recent',coalesce((select jsonb_agg(public.training_result(x) order by x.finished_at desc,x.id) from (select * from public.training_runs where user_id=target_user and finished_at is not null order by finished_at desc,id limit 20) x),'[]'::jsonb));
 end if;
 if p_action in ('start','finish') then
  perform 1 from public.profiles where telegram_id=p_actor for update;
  perform public.learning_scope(p_actor,p_owner,p_actor);
  select * into r from public.training_runs where id=(p_payload->>'id')::uuid for update;
  if found and r.user_id<>p_actor then raise exception 'Забег недоступен'; end if;
  if p_action='start' then
   game_value:=p_payload->>'game';difficulty_value:=p_payload->>'difficulty';format_value:=p_payload->>'answerFormat';
   if jsonb_typeof(p_payload->'timed') is distinct from 'boolean' then raise exception 'Неверный режим'; end if;
   timed_value:=(p_payload->>'timed')::boolean;
   if r.id is not null then
    if r.game<>game_value or r.difficulty<>difficulty_value or r.answer_format<>format_value or r.timed<>timed_value then raise exception 'Параметры забега уже заданы'; end if;
    return jsonb_build_object('run',public.training_result(r));
   end if;
   if game_value is null or difficulty_value is null or format_value is null or not ((game_value='sidepots' and difficulty_value in ('easy','medium','hard') and format_value in ('choice','input')) or (game_value='winner' and difficulty_value='standard' and format_value='selection')) then raise exception 'Неверные параметры забега'; end if;
   if (select count(*) from public.training_runs where user_id=p_actor and started_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'Слишком много запусков. Подождите минуту'; end if;
   select m.team_id into team_uuid from public.memberships m where m.user_id=p_actor and m.enabled;
   -- Only actual student runs participate in the public leaderboard.
   if p_actor=p_owner or exists(select 1 from public.teams where trainer_id=p_actor) then team_uuid:=null; end if;
   insert into public.training_runs(id,user_id,team_id,game,difficulty,answer_format,timed) values((p_payload->>'id')::uuid,p_actor,team_uuid,game_value,difficulty_value,format_value,timed_value) returning * into r;
   return jsonb_build_object('run',public.training_result(r));
  end if;
  if r.id is null then raise exception 'Сначала начните забег'; end if;
  if r.finished_at is not null then return jsonb_build_object('run',public.training_result(r)); end if;
  if r.team_id is not null and not exists(select 1 from public.memberships where user_id=p_actor and team_id=r.team_id and enabled) then raise exception 'Состав команды изменился'; end if;
  if clock_timestamp()-r.started_at>interval '24 hours' then raise exception 'Забег устарел (больше суток)'; end if;
  if exists(select 1 from unnest(array['score','correct','errors','attempts','durationMs']) k where jsonb_typeof(p_payload->k) is distinct from 'number' or (p_payload->>k)!~'^[0-9]{1,9}$') then raise exception 'Некорректный результат'; end if;
  score_value:=(p_payload->>'score')::int;correct_value:=(p_payload->>'correct')::int;errors_value:=(p_payload->>'errors')::int;attempts_value:=(p_payload->>'attempts')::int;duration_value:=(p_payload->>'durationMs')::int;
  if score_value>2000 or correct_value>8003 or errors_value>2 or attempts_value<>correct_value+errors_value or attempts_value=0 or score_value>correct_value or duration_value>86400000 or duration_value<attempts_value*100 or duration_value>extract(epoch from (clock_timestamp()-r.started_at))*1000+2500 then raise exception 'Результат не соответствует забегу'; end if;
  if (r.game='winner' or r.difficulty<>'hard') and score_value<>correct_value then raise exception 'Некорректный счёт'; end if;
  if r.game='sidepots' and r.difficulty='hard' and (correct_value>score_value*4+(errors_value+1)*3 or correct_value<score_value*2) then raise exception 'Некорректное число банков'; end if;
  update public.training_runs set finished_at=clock_timestamp(),score=score_value,correct=correct_value,errors=errors_value,attempts=attempts_value,duration_ms=duration_value where id=r.id returning * into r;
  return jsonb_build_object('run',public.training_result(r));
 end if;
 if p_action='board' then
  game_value:=p_payload->>'game';difficulty_value:=p_payload->>'difficulty';format_value:=p_payload->>'answerFormat';
  if game_value is null or difficulty_value is null or format_value is null or not ((game_value='sidepots' and difficulty_value in ('easy','medium','hard') and format_value in ('choice','input')) or (game_value='winner' and difficulty_value='standard' and format_value='selection')) then raise exception 'Неверный рейтинг'; end if;
  with best as (
   select distinct on(t.user_id) t.user_id,t.score,t.finished_at,p.display_name,tm.name team_name
   from public.training_runs t join public.profiles p on p.telegram_id=t.user_id join public.memberships m on m.user_id=t.user_id and m.team_id=t.team_id join public.teams tm on tm.id=m.team_id join public.clubs c on c.id=tm.club_id
   where t.finished_at is not null and t.timed and t.score>0 and t.game=game_value and t.difficulty=difficulty_value and t.answer_format=format_value and not p.blocked and m.enabled and tm.enabled and c.enabled and (c.access_until is null or c.access_until>now())
   order by t.user_id,t.score desc,t.finished_at asc,t.id
  ), ranked as (select *,rank() over(order by score desc) place,row_number() over(order by score desc,finished_at,user_id) row_no from best), formatted as (
   select row_no,user_id,jsonb_build_object('place',place,'displayName',display_name,'teamName',team_name,'score',score,'isMe',user_id=p_actor) data from ranked
  ) select coalesce(jsonb_agg(data order by row_no) filter(where row_no<=10),'[]'::jsonb),(jsonb_agg(data) filter(where user_id=p_actor))->0 into rows_json,mine_json from formatted;
  return jsonb_build_object('rows',rows_json,'me',mine_json,'game',game_value,'difficulty',difficulty_value,'answerFormat',format_value);
 end if;
 raise exception 'Неизвестное действие';
end $$;
revoke all on function public.training_result(public.training_runs),public.training_command(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.training_result(public.training_runs),public.training_command(bigint,bigint,text,jsonb) to service_role;
commit;
