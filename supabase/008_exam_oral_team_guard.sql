begin;
-- Moving a learner also invalidates an ongoing oral phase.
create or replace function public.exam_expire(p_user bigint) returns void language plpgsql security definer set search_path='' as $$
declare a public.exam_attempts;
begin
 select * into a from public.exam_attempts where user_id=p_user and status in ('active','oral') for update;
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
commit;
