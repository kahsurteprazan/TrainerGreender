// Temporary preview-only bot setup. Signed POST authorization expires in five minutes.
const crypto=require('node:crypto');
const c=require('../server/core.cjs');
const {equal}=require('../server/security.cjs');
module.exports=async(req,res)=>{
 if(process.env.VERCEL_ENV!=='preview')return c.json(res,404,{error:'Not found'});
 if(req.method!=='POST')return c.json(res,405,{error:'Method not allowed'});
 try{
  const env=c.config(),body=await c.body(req),expiry=Number(body.expiry),action=body.action;
  const now=Math.floor(Date.now()/1000);
  if(!['status','connect'].includes(action)||!Number.isInteger(expiry)||expiry<now||expiry>now+300)return c.json(res,403,{error:'Invalid setup authorization'});
  const expected=crypto.createHmac('sha256',env.SESSION_SECRET).update(`bot-test-webhook-v1\n${expiry}\n${action}`).digest('hex');
  if(!equal(String(body.signature||''),expected))return c.json(res,403,{error:'Invalid setup authorization'});
  const app=new URL(env.APP_URL);
  if(app.protocol!=='https:'||app.username||app.password)return c.json(res,400,{error:'Invalid app URL'});
  const webhookUrl=app.origin+'/api/telegram';
  const me=await c.telegram('getMe',{});
  if(me.username.toLowerCase()!==env.BOT_USERNAME.replace(/^@/,'').toLowerCase())return c.json(res,400,{error:'Bot mismatch'});
  if(action==='connect'){
   if(!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET))return c.json(res,400,{error:'Invalid webhook secret'});
   const set=await c.telegram('setWebhook',{url:webhookUrl,secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query']});
   if(!set)throw new Error('Webhook setup failed');
   const menu=await c.telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Обучение',web_app:{url:env.APP_URL}}});
   if(!menu)throw new Error('Menu setup failed');
  }
  const info=await c.telegram('getWebhookInfo',{});
  const menu=await c.telegram('getChatMenuButton',{});
  return c.json(res,200,{ok:true,action,botUsername:me.username,webhookConfigured:!!info.url,webhookMatches:info.url===webhookUrl,pendingUpdates:info.pending_update_count||0,lastErrorDate:info.last_error_date||null,menuMatches:menu.type==='web_app'&&!!menu.web_app?.url&&new URL(menu.web_app.url).href===app.href});
 }catch{return c.json(res,502,{error:'Bot setup failed'});}
};
