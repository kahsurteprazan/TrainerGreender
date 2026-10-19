const crypto = require('node:crypto');
function equal(a,b) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function validateInitData(raw, token, now=Math.floor(Date.now()/1000)) {
  if(typeof raw!=='string'||raw.length>16000) throw new Error('Откройте приложение через Telegram');
  const p=new URLSearchParams(raw), seen=new Set();
  for(const [k] of p) { if(seen.has(k)) throw new Error('Некорректные данные входа'); seen.add(k); }
  const hash=p.get('hash'); p.delete('hash');
  const data=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const key=crypto.createHmac('sha256','WebAppData').update(token).digest();
  const expected=crypto.createHmac('sha256',key).update(data).digest('hex');
  if(!hash || !equal(hash,expected)) throw new Error('Подпись Telegram не прошла проверку');
  const date=Number(p.get('auth_date'));
  if(!Number.isInteger(date)||date<=0||now-date>3600||date>now+30) throw new Error('Вход устарел. Закройте и откройте приложение');
  const user=JSON.parse(p.get('user')||'null');
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0) throw new Error('Нет пользователя Telegram');
  return user;
}
function signSession(id,secret,now=Math.floor(Date.now()/1000)) {
  const payload=Buffer.from(JSON.stringify({id:String(id),exp:now+43200})).toString('base64url');
  return payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
}
function readSession(token,secret,now=Math.floor(Date.now()/1000)) {
  if(typeof token!=='string'||token.length>2048) throw new Error('Требуется вход');
  const [p,s,extra]=token.split('.');
  if(!p||!s||extra||!equal(s,crypto.createHmac('sha256',secret).update(p).digest('base64url'))) throw new Error('Требуется вход');
  const value=JSON.parse(Buffer.from(p,'base64url').toString());
  if(!/^\d+$/.test(value.id)||!Number.isInteger(value.exp)||value.exp<=now) throw new Error('Сессия истекла');
  return value.id;
}
module.exports={validateInitData,signSession,readSession,equal};
