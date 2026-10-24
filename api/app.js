const c=require('../server/core.cjs');
const {validateInitData,signSession}=require('../server/security.cjs');
module.exports=async(req,res)=>{
 try {
  const env=c.config();
  if(req.method!=='POST') return c.json(res,405,{error:'Используйте POST'});
  // Browser writes are same-origin only. Bot webhook has its own secret endpoint.
  if(req.headers.origin!==new URL(env.APP_URL).origin) return c.json(res,403,{error:'Недопустимый источник запроса'});
  const b=await c.body(req);
  if(b.action==='login') {
   const user=validateInitData(b.initData,env.BOT_TOKEN),p=await c.register(user);
   if(p.blocked) return c.json(res,403,{error:'Доступ заблокирован'});
   const s=await c.state(p);
   res.setHeader('Set-Cookie',`greender_session=${signSession(user.id,env.SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);
   return c.json(res,200,s);
  }
  const p=await c.actor(req);
  if(b.action==='state') return c.json(res,200,await c.state(p));
  if(b.action==='request') {
   if(String(p.telegram_id)===env.OWNER_TELEGRAM_ID) throw new Error('Владельцу заявка не нужна');
   if(!/^[a-f0-9]{48}$/.test(b.code||'')) throw new Error('Нужна ссылка-приглашение тренера');
   const r=await c.db('rpc/request_access',{method:'POST',body:{p_user:String(p.telegram_id),p_code:b.code}});
   let warning;try {await c.notifyRequest(r);} catch {warning='Заявка сохранена. Уведомление не доставлено — тренер увидит её в панели.';}
   return c.json(res,200,{...await c.state(p),warning});
  }
  if(b.action==='decide') {
   if(typeof b.approve!=='boolean') throw new Error('Некорректное решение');
   const r=await c.decide(p,b.id,b.approve);
   try{await c.telegram('sendMessage',{chat_id:r.user_id,text:b.approve?'Заявка одобрена! Откройте приложение.':'Заявка отклонена. Свяжитесь с тренером.'});}catch{}
   return c.json(res,200,await c.state(p));
  }
  if(b.action==='manageMember') {
   if(!/^[1-9][0-9]{0,15}$/.test(String(b.userId))||!['pause','resume','remove'].includes(b.operation)) throw new Error('Некорректное действие с учеником');
   await c.db('rpc/manage_member',{method:'POST',body:{p_actor:String(p.telegram_id),p_owner:env.OWNER_TELEGRAM_ID,p_team:c.uuid(b.teamId),p_user:String(b.userId),p_action:b.operation}});
   return c.json(res,200,{...await c.state(p),notice:{pause:'Доступ приостановлен. Ученик остаётся в команде',resume:'Доступ ученика возобновлён',remove:'Ученик убран из команды. Аккаунт и история сохранены'}[b.operation]});
  }
  c.assertOwner(p);
  let notice,warning,nextView;
  if(b.action==='inviteTrainer') {
   const id=String(b.trainerId||'').trim();
   if(!/^[1-9][0-9]{0,15}$/.test(id)||!Number.isSafeInteger(Number(id))) throw new Error('Укажите настоящий числовой Telegram ID тренера');
   if(id===env.OWNER_TELEGRAM_ID) throw new Error('Вы уже владелец. Пригласите другой Telegram-аккаунт');
   try {
    await c.telegram('sendMessage',{chat_id:Number(id),text:'Вас приглашают зарегистрироваться в СПЛ. Откройте приложение кнопкой ниже. После регистрации владелец сможет назначить вас тренером. Само приглашение не выдаёт доступ и права.',reply_markup:{inline_keyboard:[[{text:'Зарегистрироваться',web_app:{url:env.APP_URL}}]]}});
   } catch {throw new Error('Не удалось доставить приглашение. Проверьте ID: этот человек должен сначала открыть @'+env.BOT_USERNAME+' и нажать «Запустить» / отправить /start. Затем повторите отправку');}
   return c.json(res,200,{...await c.state(p),notice:'Приглашение отправлено. Дождитесь, пока человек откроет приложение, затем нажмите «Обновить данные»'});
  }
  if(b.action==='createClub') {const club=(await c.db('clubs',{method:'POST',body:{name:c.text(b.name)}}))[0];nextView={screen:'club',id:club.id};notice='Клуб создан и сохранён';}
  else if(b.action==='createTeam') {
   if(!/^\d+$/.test(String(b.trainerId))) throw new Error('Нужен числовой Telegram ID тренера');
   const team=await c.db('rpc/create_team',{method:'POST',body:{p_owner:env.OWNER_TELEGRAM_ID,p_club:c.uuid(b.clubId),p_name:c.text(b.name),p_trainer:String(b.trainerId)}});
   notice='Команда «'+team.name+'» создана. Тренер назначен';nextView={screen:'team',id:team.id};
   try {await c.telegram('sendMessage',{chat_id:Number(b.trainerId),text:'Вы назначены тренером команды «'+team.name+'». Откройте приложение заново, затем «Моя команда».',reply_markup:{inline_keyboard:[[{text:'Открыть мою команду',web_app:{url:env.APP_URL}}]]}});}catch{warning='Команда сохранена, но уведомление не доставлено. Тренер может открыть ранее полученное приглашение заново';}
  } else if(b.action==='setClub') {
   if(typeof b.enabled!=='boolean') throw new Error('Некорректный статус');
   let until=null;if(b.accessUntil) {if(!/^\d{4}-\d{2}-\d{2}$/.test(b.accessUntil)) throw new Error('Неверная дата');until=new Date(b.accessUntil+'T23:59:59.999Z').toISOString();}
   await c.db('clubs?id=eq.'+c.uuid(b.id),{method:'PATCH',body:{enabled:b.enabled,access_until:until}});notice='Настройки доступа клуба сохранены';
  } else if(b.action==='setTeam') {
   if(typeof b.enabled!=='boolean') throw new Error('Некорректный статус');
   await c.db('teams?id=eq.'+c.uuid(b.id),{method:'PATCH',body:{enabled:b.enabled}});notice='Доступ команды обновлён';
  } else if(b.action==='blockUser') {
   if(!/^\d+$/.test(String(b.id))||String(b.id)===env.OWNER_TELEGRAM_ID||typeof b.blocked!=='boolean') throw new Error('Нельзя изменить этого пользователя');
   await c.db('profiles?telegram_id=eq.'+b.id,{method:'PATCH',body:{blocked:b.blocked}});notice=b.blocked?'Пользователь заблокирован':'Пользователь разблокирован';
  } else throw new Error('Неизвестное действие');
  return c.json(res,200,{...await c.state(p),notice,warning,nextView});
 }catch(e){return c.json(res,e.status||400,{error:e.message||'Ошибка запроса'});}
};
