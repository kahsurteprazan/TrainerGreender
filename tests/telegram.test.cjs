const {test}=require('node:test');const assert=require('node:assert/strict');const c=require('../server/core.cjs');const handler=require('../api/telegram');
Object.assign(process.env,{BOT_TOKEN:'test-only',BOT_USERNAME:'GreenderTrainerBot',OWNER_TELEGRAM_ID:'737227669',APP_URL:'https://test.example',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',SESSION_SECRET:'s'.repeat(64),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(64)});
function req(body,secret=process.env.TELEGRAM_WEBHOOK_SECRET){return{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body};}
function res(){return{setHeader(){},end(s){this.value=JSON.parse(s);}};}
test('Telegram webhook rejects unsigned requests and routes invitations and decisions',async()=>{
 const old={register:c.register,db:c.db,telegram:c.telegram,notifyRequest:c.notifyRequest,decide:c.decide};const calls=[];
 c.register=async(u)=>({telegram_id:u.id,blocked:false});c.db=async(path,o)=>{calls.push({method:'db',path,body:o.body});return{id:'11111111-1111-4111-8111-111111111111',user_id:'300',team_id:'team'};};
 c.telegram=async(method,body)=>{calls.push({method,body});return true;};c.notifyRequest=async(r)=>calls.push({method:'notify',request:r});c.decide=async(p,id,approve)=>{calls.push({method:'decide',actor:p.telegram_id,id,approve});return{user_id:'300'};};
 try{
  let r=res();await handler(req({},'bad'),r);assert.equal(r.statusCode,403);assert.equal(calls.length,0);
  r=res();await handler(req({message:{chat:{type:'private',id:300},from:{id:300},text:'/start '+ 'a'.repeat(48)}}),r);assert.equal(r.statusCode,200);assert.equal(calls.find(x=>x.method==='db').body.p_code,'a'.repeat(48));assert(calls.some(x=>x.method==='notify'));assert(calls.find(x=>x.method==='sendMessage').body.text.includes('Заявка отправлена'));
  calls.length=0;r=res();await handler(req({callback_query:{id:'callback',from:{id:200},data:'yes:11111111-1111-4111-8111-111111111111',message:{chat:{id:200},message_id:10}}}),r);assert.equal(r.statusCode,200);assert.equal(calls.find(x=>x.method==='decide').actor,200);assert.equal(calls.find(x=>x.method==='decide').approve,true);assert(calls.some(x=>x.method==='editMessageReplyMarkup'));assert(calls.some(x=>x.method==='sendMessage'&&x.body.chat_id==='300'));
  calls.length=0;c.decide=async()=>{throw new Error('Нет доступа');};r=res();await handler(req({callback_query:{id:'callback2',from:{id:999},data:'yes:11111111-1111-4111-8111-111111111111'}}),r);assert(calls.some(x=>x.method==='answerCallbackQuery'&&x.body.show_alert));assert(!calls.some(x=>x.method==='sendMessage'));
 }finally{Object.assign(c,old);}
});
