// For a bot with NO webhook. Send it /start first, then run locally.
(async()=>{
 if(!process.env.BOT_TOKEN)throw new Error('Заполните BOT_TOKEN в .env');
 const r=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getUpdates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_updates:['message'],limit:100,timeout:0}),signal:AbortSignal.timeout(10000)});
 const data=await r.json();
 if(!data.ok)throw new Error('Не удалось получить сообщения. Если у бота уже есть webhook, не удаляйте его без проверки: ID можно посмотреть в действующем обработчике бота.');
 const users=new Map();for(const u of data.result){const p=u.message?.from;if(p)users.set(p.id,{id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(' '),username:p.username||''});}
 if(!users.size)console.log('Нет сообщений. Отправьте боту /start и повторите.');
 else for(const p of users.values())console.log(JSON.stringify(p));
})().catch(e=>{console.error(e.message);process.exit(1);});
