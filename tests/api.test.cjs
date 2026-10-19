const {test}=require('node:test');const assert=require('node:assert/strict');
const {signSession}=require('../server/security.cjs');
Object.assign(process.env,{BOT_TOKEN:'test-token',BOT_USERNAME:'test_bot',OWNER_TELEGRAM_ID:'1',APP_URL:'https://example.com',SUPABASE_URL:'https://db.example.com',SUPABASE_SERVICE_ROLE_KEY:'test-service',SESSION_SECRET:'s'.repeat(40),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(40)});
const handler=require('../api/app.js');const trainer=require('../api/trainer.js');const webhook=require('../api/telegram.js');
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.text=v;this.value=(()=>{try{return JSON.parse(v);}catch{return v;}})();}};}
const cookie=id=>'greender_session='+signSession(id,process.env.SESSION_SECRET);
async function call(body,{id='2',origin='https://example.com',target=handler,method='POST',headers={}}={}){const r=res();await target({method,headers:{origin,cookie:cookie(id),...headers},body},r);return r;}
test('server authorization checks',async(t)=>{
 const original=global.fetch;let queries=[];let blocked=false;let trained=false;
 global.fetch=async(url,options)=>{
  queries.push({url,options});let value=[];
  if(url.includes('/profiles?telegram_id=eq.'))value=[{telegram_id:2,display_name:'Student',blocked}];
  if(url.includes('/teams?trainer_id='))value=trained?[{id:'aaa',trainer_id:2,club_id:'ccc',enabled:true}]:[];
  if(url.includes('/clubs?id='))value=[{id:'ccc',enabled:false}];
  return {ok:true,status:200,text:async()=>JSON.stringify(value)};
 };
 try{
  await t.test('reject foreign browser origin',async()=>{const r=await call({action:'state'},{origin:'https://evil.example'});assert.equal(r.statusCode,403);assert.equal(queries.length,0);});
  await t.test('reject missing session',async()=>{const r=await call({action:'state'},{headers:{cookie:''}});assert.equal(r.statusCode,401);});
  await t.test('student cannot create club',async()=>{const r=await call({action:'createClub',name:'X'});assert.equal(r.statusCode,403);assert.ok(!queries.some(q=>q.options.method==='POST'));});
  await t.test('owner-only team change',async()=>{const r=await call({action:'setTeam',id:'x',enabled:true});assert.equal(r.statusCode,403);});
  await t.test('pending student cannot load training code',async()=>{const r=await call({}, {target:trainer,method:'GET'});assert.equal(r.statusCode,403);});
  await t.test('blocked session is revoked immediately',async()=>{blocked=true;const r=await call({action:'state'});assert.equal(r.statusCode,403);blocked=false;});
  await t.test('disabled club denies trainer training access',async()=>{trained=true;const r=await call({}, {target:trainer,method:'GET'});assert.equal(r.statusCode,403);trained=false;});
  await t.test('webhook rejects missing secret',async()=>{const r=await call({}, {target:webhook});assert.equal(r.statusCode,403);});
  await t.test('webhook accepts empty authenticated update',async()=>{const r=await call({}, {target:webhook,headers:{'x-telegram-bot-api-secret-token':process.env.TELEGRAM_WEBHOOK_SECRET}});assert.equal(r.statusCode,200);});
 }finally{global.fetch=original;}
});
test('RPC composite response works as array or object',async()=>{
 const original=global.fetch;const {db}=require('../server/core.cjs');
 try{
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify([{id:'request-1'}])});
  assert.equal((await db('rpc/request_access',{method:'POST',body:{}})).id,'request-1');
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({id:'request-2'})});
  assert.equal((await db('rpc/request_access',{method:'POST',body:{}})).id,'request-2');
 }finally{global.fetch=original;}
});
