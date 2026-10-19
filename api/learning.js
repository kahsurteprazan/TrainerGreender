const c=require('../server/core.cjs');
function videoUrl(value){
 if(!value)return null;const text=c.text(value,2048);let u;try{u=new URL(text);}catch{throw new Error('Нужна полная HTTPS-ссылка на видео');}
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Для видео используйте HTTPS-ссылку без логина и пароля');
 return u.href;
}
module.exports=async(req,res)=>{
 try{
  const env=c.config();if(req.method!=='POST')return c.json(res,405,{error:'Используйте POST'});
  if(req.headers.origin!==new URL(env.APP_URL).origin)return c.json(res,403,{error:'Недопустимый источник запроса'});
  const actor=await c.actor(req),b=await c.body(req);let action,payload={};
  if(b.action==='learnGet'){action='get';if(b.userId!==undefined){if(!/^[1-9][0-9]{0,15}$/.test(String(b.userId)))throw new Error('Некорректный пользователь');payload.userId=String(b.userId);}}
  else if(b.action==='learnComplete'){action='complete';payload.lessonId=c.uuid(b.lessonId);}
  else if(b.action==='learnStart'){action='start';payload.sectionId=c.uuid(b.sectionId);}
  else if(b.action==='learnSubmit'){action='submit';payload.attemptId=c.uuid(b.attemptId);if(!b.answers||Array.isArray(b.answers)||typeof b.answers!=='object'||Object.keys(b.answers).length>100)throw new Error('Некорректные ответы');for(const [id,choice] of Object.entries(b.answers)){c.uuid(id);if(!Number.isInteger(choice)||choice<0||choice>20)throw new Error('Некорректный ответ');}payload.answers=b.answers;}
  else if(b.action==='learnGrant'){action='grant';if(!/^[1-9][0-9]{0,15}$/.test(String(b.userId)))throw new Error('Некорректный пользователь');payload={userId:String(b.userId),sectionId:c.uuid(b.sectionId),requestId:c.uuid(b.requestId)};}
  else if(b.action==='learnEdit'){c.assertOwner(actor);action='edit';payload={lessonId:c.uuid(b.lessonId),title:c.text(b.title,200),theory:c.text(b.theory,20000),videoUrl:videoUrl(b.videoUrl)};}
  else throw new Error('Неизвестное действие');
  const result=await c.db('rpc/learning_command',{method:'POST',body:{p_actor:String(actor.telegram_id),p_owner:env.OWNER_TELEGRAM_ID,p_action:action,p_payload:payload}});
  return c.json(res,200,result);
 }catch(e){return c.json(res,e.status||400,{error:e.message||'Не удалось загрузить обучение'});}
};
module.exports.videoUrl=videoUrl;
