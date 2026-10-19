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
  if(b.action==='learnManageGet'||b.action==='learnManage'){
   c.assertOwner(actor);const operation=b.action==='learnManageGet'?'get':b.operation;
   if(!['get','save','publish','hide','archive','restore','delete','move'].includes(operation))throw new Error('Некорректное действие');
   let kind=null,id=null,p={};
   if(operation!=='get'){
    if(!['section','lesson','question'].includes(b.kind))throw new Error('Некорректный материал');kind=b.kind;id=c.uuid(b.id);
    if(operation==='save'){
     if(kind==='section'){p={title:c.text(b.title,200),description:typeof b.description==='string'?b.description.trim():'',clubId:b.clubId?c.uuid(b.clubId):null};if(p.description.length>2000)throw new Error('Слишком длинное описание');}
     if(kind==='lesson')p={sectionId:c.uuid(b.sectionId),title:c.text(b.title,200),theory:c.text(b.theory,20000),videoUrl:videoUrl(b.videoUrl)};
     if(kind==='question'){
      if(!Array.isArray(b.options)||b.options.length<2||b.options.length>6||!Number.isInteger(b.correctIndex)||b.correctIndex<0||b.correctIndex>=b.options.length)throw new Error('Нужны 2–6 вариантов и правильный ответ');
      const options=b.options.map(o=>c.text(o,500));if(new Set(options.map(o=>o.toLocaleLowerCase())).size!==options.length)throw new Error('Варианты не должны повторяться');
      p={lessonId:c.uuid(b.lessonId),prompt:c.text(b.prompt,2000),options,correctIndex:b.correctIndex};
     }
    }
    if(operation==='move'){if(!['up','down'].includes(b.direction))throw new Error('Неверное направление');p.direction=b.direction;}
   }
   const result=await c.db('rpc/learning_editor',{method:'POST',body:{p_actor:String(actor.telegram_id),p_owner:env.OWNER_TELEGRAM_ID,p_operation:operation,p_kind:kind,p_id:id,p_payload:p}});
   return c.json(res,200,result);
  }
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
