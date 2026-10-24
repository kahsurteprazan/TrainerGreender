// Diagnostic is preview-only and never returns credentials or application data.
const c=require('../server/core.cjs');
module.exports=async(req,res)=>{
 if(process.env.VERCEL_ENV!=='preview')return c.json(res,404,{error:'Not found'});
 if(req.method!=='GET')return c.json(res,405,{error:'Используйте GET'});
 let env;try{env=c.config();}catch(e){return c.json(res,503,{ok:false,configuration:e.message});}
 const checks=await Promise.allSettled([
  c.telegram('getMe',{}).then(bot=>{if(bot.username.toLowerCase()!==env.BOT_USERNAME.toLowerCase())throw new Error('Токен принадлежит другому боту');return {ok:true,username:bot.username};}),
  c.db('profiles?select=telegram_id&limit=1').then(()=>({ok:true}))
 ]);
 const telegram=checks[0].status==='fulfilled'?checks[0].value:{ok:false,error:'Токен не принят Telegram, не соответствует боту или сервис недоступен'};
 const database=checks[1].status==='fulfilled'?checks[1].value:{ok:false,error:'Supabase не подтвердил доступ к таблице profiles'};
 return c.json(res,telegram.ok&&database.ok?200:503,{ok:telegram.ok&&database.ok,telegram,database});
};
