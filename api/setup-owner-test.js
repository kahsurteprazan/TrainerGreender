// Temporary preview-only setup operation. Does not grant a user session or change global bot settings.
const crypto=require('node:crypto');
const c=require('../server/core.cjs');
const {equal}=require('../server/security.cjs');
module.exports=async(req,res)=>{
 if(process.env.VERCEL_ENV!=='preview')return c.json(res,404,{error:'Not found'});
 if(req.method!=='GET')return c.json(res,405,{error:'Method not allowed'});
 const q=new URL(req.url,'https://setup.invalid').searchParams;
 const expiry=Number(q.get('expiry')),launchUrl=q.get('launchUrl')||'',signature=q.get('signature')||'';
 const now=Math.floor(Date.now()/1000);
 if(!Number.isInteger(expiry)||expiry<now||expiry>now+300)return c.json(res,403,{error:'Expired setup authorization'});
 let env;try{env=c.config();}catch{return c.json(res,503,{error:'Configuration incomplete'});}
 const expected=crypto.createHmac('sha256',env.SESSION_SECRET).update(`owner-test-menu-v1\n${expiry}\n${launchUrl}`).digest('hex');
 if(!equal(signature,expected))return c.json(res,403,{error:'Invalid setup authorization'});
 let url;try{url=new URL(launchUrl);}catch{return c.json(res,400,{error:'Invalid launch URL'});}
 if(url.protocol!=='https:'||url.origin!==new URL(env.APP_URL).origin||url.pathname!=='/'||url.username||url.password)return c.json(res,400,{error:'Invalid launch URL'});
 try{
  const me=await c.telegram('getMe',{});
  if(me.username.toLowerCase()!==env.BOT_USERNAME.toLowerCase())return c.json(res,400,{error:'Bot mismatch'});
  // chat_id makes this a per-user override, not the default menu for other users.
  await c.telegram('setChatMenuButton',{chat_id:Number(env.OWNER_TELEGRAM_ID),menu_button:{type:'web_app',text:'Тест приложения',web_app:{url:launchUrl}}});
  let messageSent=true;
  try{await c.telegram('sendMessage',{chat_id:Number(env.OWNER_TELEGRAM_ID),text:'Тестовая версия СПЛ готова. Откройте приложение кнопкой ниже. Вход должен произойти через Telegram без пароля. Затем нажмите «Моя команда», чтобы открыть панель владельца. Это тестовая версия; основной сайт не изменён.',reply_markup:{inline_keyboard:[[{text:'Открыть тестовую версию',web_app:{url:launchUrl}}]]}});}catch{messageSent=false;}
  return c.json(res,200,{ok:true,ownerOnly:true,menuUpdated:true,messageSent});
 }catch{return c.json(res,502,{ok:false,error:'Telegram setup failed. Owner may need to send /start to the bot first.'});}
};
