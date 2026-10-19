'use strict';
const c=require('../server/core.cjs'),tasks=require('../server/exam-tasks.cjs');
module.exports=async(req,res)=>{try{
 const env=c.config();if(req.method!=='POST')return c.json(res,405,{error:'Используйте POST'});
 if(req.headers.origin!==new URL(env.APP_URL).origin)return c.json(res,403,{error:'Недопустимый источник запроса'});
 const actor=await c.actor(req),b=await c.body(req);const actions={examGet:'get',examList:'list',examEnter:'enter',examGrant:'grant',examStart:'start',examQuestion:'question',examAnswer:'answer',examGrade:'grade',examAbort:'abort'};
 const action=actions[b.action];if(!action)throw new Error('Неизвестное действие');const p={};
 if(['get','grant','grade','abort'].includes(action)&&b.userId!==undefined){if(!/^[1-9][0-9]{0,15}$/.test(String(b.userId)))throw new Error('Некорректный ученик');p.userId=String(b.userId);}
 if(action==='grant'){if(!p.userId)throw new Error('Выберите ученика');p.requestId=c.uuid(b.requestId);}
 if(['start','question','answer','grade','abort'].includes(action))p.attemptId=c.uuid(b.attemptId);
 if(['question','answer','grade'].includes(action)){if(!Number.isInteger(b.index)||b.index<0||b.index>32)throw new Error('Неверный номер задания');p.index=b.index;}
 if(action==='start')p.tasks=tasks.generate();
 if(action==='answer'){
  if(b.answer===null)p.answer=null;
  else if(Number.isInteger(b.answer)&&b.answer>=0&&b.answer<=10)p.answer=b.answer;
  else if(Array.isArray(b.answer)&&b.answer.length<=7&&b.answer.every(v=>Number.isInteger(v)&&v>=0&&v<=1000000))p.answer=b.answer;
  else throw new Error('Некорректный ответ');
 }
 if(action==='grade'){if(typeof b.passed!=='boolean'||!p.userId)throw new Error('Нужна оценка тренера');p.passed=b.passed;}
 const data=await c.db('rpc/exam_command',{method:'POST',body:{p_actor:String(actor.telegram_id),p_owner:env.OWNER_TELEGRAM_ID,p_action:action,p_payload:p}});return c.json(res,200,data);
 }catch(e){return c.json(res,e.status||400,{error:e.message||'Не удалось выполнить действие экзамена'});}};
