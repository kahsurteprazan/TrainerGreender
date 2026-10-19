const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const handler=require('../api/setup-bot-test');const c=require('../server/core.cjs');
Object.assign(process.env,{VERCEL_ENV:'preview',BOT_TOKEN:'test-only',BOT_USERNAME:'GreenderTrainerBot',OWNER_TELEGRAM_ID:'737227669',APP_URL:'https://test.example',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',SESSION_SECRET:'s'.repeat(64),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(64)});
function req(action='connect',extra={}){const expiry=Math.floor(Date.now()/1000)+180;return{method:'POST',body:{action,expiry,signature:crypto.createHmac('sha256',process.env.SESSION_SECRET).update(`bot-test-webhook-v1\n${expiry}\n${action}`).digest('hex'),...extra}};}
function res(){return{setHeader(){},end(s){this.value=JSON.parse(s);}};}
test('bot setup requires signed short-lived POST and only changes preview bot endpoints',async()=>{
 const old=c.telegram,calls=[];
 c.telegram=async(method,body)=>{calls.push({method,body});if(method==='getMe')return{username:'GreenderTrainerBot'};if(method==='getWebhookInfo')return{url:'https://test.example/api/telegram',pending_update_count:0};if(method==='getChatMenuButton')return{type:'web_app',web_app:{url:'https://test.example/'}};return true;};
 try{
  let r=res();process.env.VERCEL_ENV='production';await handler(req(),r);assert.equal(r.statusCode,404);process.env.VERCEL_ENV='preview';
  r=res();await handler({...req(),method:'GET'},r);assert.equal(r.statusCode,405);
  r=res();await handler(req('connect',{signature:'bad'}),r);assert.equal(r.statusCode,403);
  r=res();await handler(req('connect',{expiry:1}),r);assert.equal(r.statusCode,403);assert.equal(calls.length,0);
  r=res();await handler(req('status'),r);assert.equal(r.statusCode,200);assert.equal(r.value.webhookMatches,true);assert(!calls.some(x=>x.method==='setWebhook'));
  calls.length=0;r=res();await handler(req(),r);assert.equal(r.statusCode,200);assert.equal(r.value.menuMatches,true);
  const setup=calls.find(x=>x.method==='setWebhook');assert.equal(setup.body.url,'https://test.example/api/telegram');assert.equal(setup.body.secret_token,process.env.TELEGRAM_WEBHOOK_SECRET);assert.deepEqual(setup.body.allowed_updates,['message','callback_query']);assert(!('drop_pending_updates' in setup.body));
  assert(!JSON.stringify(r.value).includes(process.env.TELEGRAM_WEBHOOK_SECRET));assert(!JSON.stringify(r.value).includes(process.env.SESSION_SECRET));
 }finally{c.telegram=old;}
});
