const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const handler=require('../api/setup-owner-test');
Object.assign(process.env,{VERCEL_ENV:'preview',BOT_TOKEN:'test-only',BOT_USERNAME:'GreenderTrainerBot',OWNER_TELEGRAM_ID:'737227669',APP_URL:'https://test.example',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',SESSION_SECRET:'s'.repeat(64),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(64)});
function req({expiry=Math.floor(Date.now()/1000)+180,launchUrl='https://test.example/?_vercel_share=test',badSignature=false}={}){const signature=crypto.createHmac('sha256',process.env.SESSION_SECRET).update(`owner-test-menu-v1\n${expiry}\n${launchUrl}`).digest('hex');return{method:'GET',url:'/api/setup-owner-test?'+new URLSearchParams({expiry,launchUrl,signature:badSignature?'bad':signature})};}
function res(){return{setHeader(){},end(s){this.value=JSON.parse(s);}};}
test('owner test setup is preview-only, signed, limited to owner and expected origin',async()=>{
 const old=global.fetch;const calls=[];
 global.fetch=async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return{json:async()=>({ok:true,result:url.endsWith('/getMe')?{username:'GreenderTrainerBot'}:true})};};
 try{
  let r=res();process.env.VERCEL_ENV='production';await handler(req(),r);assert.equal(r.statusCode,404);process.env.VERCEL_ENV='preview';
  r=res();await handler(req({badSignature:true}),r);assert.equal(r.statusCode,403);
  r=res();await handler(req({expiry:1}),r);assert.equal(r.statusCode,403);
  r=res();await handler(req({launchUrl:'https://other.example/'}),r);assert.equal(r.statusCode,400);
  assert.equal(calls.length,0);
  r=res();await handler(req(),r);assert.equal(r.statusCode,200);assert.equal(r.value.ownerOnly,true);
  const menu=calls.find(c=>c.url.endsWith('/setChatMenuButton'));assert.equal(menu.body.chat_id,737227669);
  assert(!calls.some(c=>c.url.endsWith('/setWebhook')));
 }finally{global.fetch=old;}
});
