// Run locally: node --env-file=.env scripts/setup-bot.cjs
const c=require('../server/core.cjs');
(async()=>{
 const env=c.config();const u=new URL(env.APP_URL);
 if(u.protocol!=='https:')throw new Error('APP_URL должен начинаться с https://');
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET))throw new Error('Webhook secret: 32–256 латинских букв, цифр, _ или -');
 const me=await c.telegram('getMe',{});
 if(me.username.toLowerCase()!==env.BOT_USERNAME.replace(/^@/,'').toLowerCase())throw new Error('BOT_USERNAME не соответствует BOT_TOKEN');
 await c.telegram('setWebhook',{url:u.origin+'/api/telegram',secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query']});
 await c.telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Обучение',web_app:{url:env.APP_URL}}});
 console.log('Webhook и кнопка меню настроены. Отправьте боту /start. Секреты не выводились.');
})().catch(e=>{console.error(e.message);process.exit(1);});
