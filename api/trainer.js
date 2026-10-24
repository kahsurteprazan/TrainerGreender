const fs=require('node:fs');const path=require('node:path');const c=require('../server/core.cjs');
module.exports=async(req,res)=>{
 try{
  if(req.method!=='GET') return c.json(res,405,{error:'Используйте GET'});
  const p=await c.actor(req),s=await c.state(p);
  if(!s.allowed) return c.json(res,403,{error:'Доступ не одобрен или приостановлен'});
  res.setHeader('Content-Type','application/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.end(fs.readFileSync(path.join(__dirname,'../server/trainer-source.txt'),'utf8'));
 }catch(e){return c.json(res,e.status||401,{error:e.message});}
};
