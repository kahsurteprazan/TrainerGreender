const c=require('../server/core.cjs');
function options(b){
 if(b.game==='winner'&&b.difficulty==='standard'&&b.answerFormat==='selection')return{game:b.game,difficulty:b.difficulty,answerFormat:b.answerFormat};
 if(b.game==='sidepots'&&['easy','medium','hard'].includes(b.difficulty)&&['choice','input'].includes(b.answerFormat))return{game:b.game,difficulty:b.difficulty,answerFormat:b.answerFormat};
 throw new Error('Некорректный режим тренировки');
}
module.exports=async(req,res)=>{try{
 const env=c.config();if(req.method!=='POST')return c.json(res,405,{error:'Используйте POST'});
 if(req.headers.origin!==new URL(env.APP_URL).origin)return c.json(res,403,{error:'Недопустимый источник запроса'});
 const actor=await c.actor(req),b=await c.body(req);let action,p={};
 if(b.action==='trainingStart'){action='start';p={...options(b),id:c.uuid(b.id)};if(typeof b.timed!=='boolean')throw new Error('Некорректный режим времени');p.timed=b.timed;}
 else if(b.action==='trainingFinish'){action='finish';p={id:c.uuid(b.id)};for(const k of ['score','correct','errors','attempts','durationMs']){if(!Number.isSafeInteger(b[k])||b[k]<0||b[k]>86400000)throw new Error('Некорректный результат');p[k]=b[k];}}
 else if(b.action==='trainingBoard'){action='board';p=options(b);}
 else if(b.action==='trainingGet'){action='get';if(b.userId!==undefined){if(!/^[1-9][0-9]{0,15}$/.test(String(b.userId)))throw new Error('Некорректный пользователь');p.userId=String(b.userId);}}
 else throw new Error('Неизвестное действие');
 const data=await c.db('rpc/training_command',{method:'POST',body:{p_actor:String(actor.telegram_id),p_owner:env.OWNER_TELEGRAM_ID,p_action:action,p_payload:p}});return c.json(res,200,data);
 }catch(e){return c.json(res,e.status||400,{error:e.message||'Не удалось загрузить тренировки'});}};
module.exports.options=options;
