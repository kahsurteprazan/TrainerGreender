const c=require('../server/core.cjs');
const {equal}=require('../server/security.cjs');
module.exports=async(req,res)=>{
 try {
  const env=c.config();
  if(req.method!=='POST'||!equal(String(req.headers['x-telegram-bot-api-secret-token']||''),env.TELEGRAM_WEBHOOK_SECRET)) return c.json(res,403,{error:'Нет доступа'});
  const update=await c.body(req);
  if(update.callback_query) {
   const q=update.callback_query;
   try {
    const p=await c.register(q.from);
    if(p.blocked) throw new Error('Доступ заблокирован');
    const match=/^(yes|no):([0-9a-f-]{36})$/.exec(q.data||'');
    if(!match) throw new Error('Неизвестное действие');
    const r=await c.decide(p,match[2],match[1]==='yes');
    await c.telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Решение сохранено'});
    if(q.message) await c.telegram('editMessageReplyMarkup',{chat_id:q.message.chat.id,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}});
    try{await c.telegram('sendMessage',{chat_id:r.user_id,text:match[1]==='yes'?'Доступ одобрен! Откройте приложение.':'Заявка отклонена.'});}catch{}
   }catch(e){await c.telegram('answerCallbackQuery',{callback_query_id:q.id,text:e.message.slice(0,190),show_alert:true});}
  }else if(update.message?.chat.type==='private'&&update.message.from&&!update.message.from.is_bot) {
   const m=update.message,p=await c.register(m.from);
   if(p.blocked) {await c.telegram('sendMessage',{chat_id:m.chat.id,text:'Доступ заблокирован.'});return c.json(res,200,{ok:true});}
   const match=/^\/start(?:@\w+)?(?:\s+([a-f0-9]{48}))?$/.exec(m.text||'');
   let message='Ваш Telegram ID: '+p.telegram_id+'.\nОткройте приложение. Для вступления нужна ссылка тренера.';
   if(match?.[1]&&String(p.telegram_id)!==env.OWNER_TELEGRAM_ID) {
    try {const r=await c.db('rpc/request_access',{method:'POST',body:{p_user:String(p.telegram_id),p_code:match[1]}});message='Заявка отправлена тренеру. После одобрения откройте приложение.';try{await c.notifyRequest(r);}catch{message+=' Тренер увидит заявку в панели.';}}
    catch(e){message=e.message;}
   }
   await c.telegram('sendMessage',{chat_id:m.chat.id,text:message,reply_markup:{inline_keyboard:[[{text:'Открыть Greender Trainer',web_app:{url:env.APP_URL}}]]}});
  }
  return c.json(res,200,{ok:true});
 }catch {return c.json(res,500,{error:'Не удалось обработать обновление'});}
};
