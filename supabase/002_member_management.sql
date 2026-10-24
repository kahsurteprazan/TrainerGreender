begin;
alter table public.memberships add column enabled boolean not null default true;
create function public.manage_member(p_actor bigint,p_owner bigint,p_team uuid,p_user bigint,p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.teams; m public.memberships;
begin
 if p_action not in ('pause','resume','remove') then raise exception 'Неизвестное действие'; end if;
 select * into t from public.teams where id=p_team;
 if not found then raise exception 'Команда не найдена'; end if;
 if p_actor<>p_owner and p_actor<>t.trainer_id then raise exception 'Нет доступа к этой команде'; end if;
 if not exists(select 1 from public.profiles where telegram_id=p_actor and not blocked) then raise exception 'Нет доступа'; end if;
 perform 1 from public.profiles where telegram_id=p_user for update;
 select * into m from public.memberships where user_id=p_user and team_id=p_team for update;
 if not found then raise exception 'Ученик больше не состоит в этой команде. Обновите данные'; end if;
 if p_action='remove' then
  delete from public.memberships where user_id=p_user and team_id=p_team;
 else
  update public.memberships set enabled=(p_action='resume') where user_id=p_user and team_id=p_team;
 end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'member.'||p_action,p_team::text||':'||p_user::text);
end $$;
revoke all on function public.manage_member(bigint,bigint,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.manage_member(bigint,bigint,uuid,bigint,text) to service_role;
commit;
