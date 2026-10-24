const {readSession}=require('./security.cjs');
function config() {
 const keys=['BOT_TOKEN','BOT_USERNAME','OWNER_TELEGRAM_ID','APP_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET','TELEGRAM_WEBHOOK_SECRET'];
 for(const k of keys) if(!process.env[k]) throw new Error('Сервер не настроен: '+k);
 if(process.env.SESSION_SECRET.length<32||process.env.TELEGRAM_WEBHOOK_SECRET.length<32) throw new Error('Секреты должны содержать минимум 32 символа');
 if(!/^\d+$/.test(process.env.OWNER_TELEGRAM_ID)) throw new Error('Некорректный ID владельца');
 return process.env;
}
async function db(path,{method='GET',body,prefer}={}) {
 const env=config();
 const r=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}),'Content-Type':'application/json',Prefer:prefer||'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const text=await r.text(); const value=text?JSON.parse(text):null;
 if(!r.ok) { const e=new Error(r.status<500&&value?.code==='P0001'?value.message:'Ошибка базы данных. Попробуйте ещё раз'); e.status=400; throw e; }
 return path.startsWith('rpc/') && Array.isArray(value) ? value[0] : value;
}
async function register(user) {
 // Upsert only Telegram-supplied display fields; blocked is never reset on login.
 return (await db('profiles?on_conflict=telegram_id',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',body:{telegram_id:String(user.id),display_name:[user.first_name,user.last_name].filter(Boolean).join(' ').slice(0,200)||'Участник',username:user.username||null,last_seen_at:new Date().toISOString()}}))[0];
}
async function actor(req) {
 const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
 let id; try {id=readSession(cookies.greender_session,config().SESSION_SECRET);} catch {throw Object.assign(new Error('Войдите через Telegram заново'),{status:401});}
 const p=(await db('profiles?telegram_id=eq.'+id))[0];
 if(!p||p.blocked) throw Object.assign(new Error('Доступ заблокирован'),{status:403});
 return p;
}
async function state(p) {
 const owner=String(p.telegram_id)===config().OWNER_TELEGRAM_ID;
 const ownTeams=await db('teams?trainer_id=eq.'+p.telegram_id);
 const member=(await db('memberships?user_id=eq.'+p.telegram_id))[0];
 const teams=owner?await db('teams?order=created_at.desc'):ownTeams.length?ownTeams:member?await db('teams?id=eq.'+member.team_id):[];
 const clubIds=[...new Set(teams.map(t=>t.club_id))];
 const clubs=owner?await db('clubs?order=created_at.desc'):clubIds.length?await db('clubs?id=in.('+clubIds.join(',')+')'):[];
 const active=(owner||ownTeams.length>0||member?.enabled!==false)&&teams.some(t=>{const c=clubs.find(c=>c.id===t.club_id);return t.enabled&&c?.enabled&&(!c.access_until||new Date(c.access_until)>new Date());});
 const role=owner?'owner':ownTeams.length?'trainer':'student';
 const requests=owner?await db('access_requests?status=eq.pending&order=created_at.desc'):ownTeams.length?await db('access_requests?status=eq.pending&team_id=in.('+ownTeams.map(t=>t.id).join(',')+')&order=created_at.desc'):await db('access_requests?user_id=eq.'+p.telegram_id+'&order=created_at.desc&limit=5');
 const memberships=owner?await db('memberships'):ownTeams.length?await db('memberships?team_id=in.('+ownTeams.map(t=>t.id).join(',')+')'):member?[member]:[];
 const userIds=[...new Set([...requests.map(r=>r.user_id),...memberships.map(m=>m.user_id),...teams.map(t=>t.trainer_id)])];
 const people=owner?await db('profiles?select=telegram_id,display_name,username,blocked,last_seen_at&order=created_at.desc'):ownTeams.length&&userIds.length?await db('profiles?select=telegram_id,display_name,username,blocked,last_seen_at&telegram_id=in.('+userIds.join(',')+')'):[];
 return {botUsername:config().BOT_USERNAME,user:p,role,allowed:owner||active,teams:teams.map(t=>role==='student'?{id:t.id,name:t.name,club_id:t.club_id}:t),clubs,requests,memberships,people};
}
function assertOwner(p) {if(String(p.telegram_id)!==config().OWNER_TELEGRAM_ID) throw Object.assign(new Error('Только владелец'),{status:403});}
function text(v,max=100) {if(typeof v!=='string'||!v.trim()||v.trim().length>max) throw new Error('Проверьте введённые данные');return v.trim();}
function uuid(v) {if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new Error('Неверный идентификатор');return v;}
async function telegram(method,body) {
 const r=await fetch(`https://api.telegram.org/bot${config().BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const result=await r.json(); if(!result.ok) throw new Error('Не удалось отправить сообщение Telegram'); return result.result;
}
async function notifyRequest(request) {
 const team=(await db('teams?id=eq.'+request.team_id))[0];
 await telegram('sendMessage',{chat_id:team.trainer_id,text:'Новая заявка в команду «'+team.name+'». ID ученика: '+request.user_id,reply_markup:{inline_keyboard:[[{text:'Принять',callback_data:'yes:'+request.id},{text:'Отклонить',callback_data:'no:'+request.id}]]}});
}
async function decide(p,id,approve) {return db('rpc/decide_request',{method:'POST',body:{p_actor:String(p.telegram_id),p_owner:config().OWNER_TELEGRAM_ID,p_request:uuid(id),p_approve:approve}});}
async function body(req) {
 if(req.body!==undefined) return typeof req.body==='string'?JSON.parse(req.body):req.body;
 let raw='';for await(const chunk of req) {raw+=chunk;if(raw.length>32768) throw new Error('Слишком большой запрос');} return raw?JSON.parse(raw):{};
}
function json(res,status,value) {res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));}
module.exports={config,db,register,actor,state,assertOwner,text,uuid,telegram,notifyRequest,decide,body,json};
