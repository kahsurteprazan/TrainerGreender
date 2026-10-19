const fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
async function fixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(const f of fs.readdirSync('supabase').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
 await db.exec("insert into profiles(telegram_id,display_name) values(1,'Назар'),(2,'Алексей'),(3,'Другой тренер'),(4,'Михаил Соколов'),(5,'Ученик другой команды'),(6,'Без доступа');");
 const club=(await db.query("insert into clubs(name) values('Grinder') returning *")).rows[0],ta=(await db.query("select * from create_team(1,$1,'Вечерняя группа',2)",[club.id])).rows[0],tb=(await db.query("select * from create_team(1,$1,'Другая группа',3)",[club.id])).rows[0];
 await db.query('insert into memberships(user_id,team_id) values(4,$1),(5,$2)',[ta.id,tb.id]);
 const command=async(user,action,p={})=>(await db.query('select exam_command($1,1,$2,$3::jsonb) x',[user,action,JSON.stringify(p)])).rows[0].x;
 async function complete(user=4){await db.query('insert into learning_progress(user_id,lesson_id) select $1,id from learning_lessons on conflict do nothing',[user]);await db.query("insert into learning_attempts(user_id,section_id,status,snapshot,passed,score,total,submitted_at) select $1,id,'submitted','[]',true,1,1,now() from learning_sections",[user]);}
 async function current(user=4){return(await db.query("select * from exam_attempts where user_id=$1 order by started_at desc,id desc limit 1",[user])).rows[0];}
 async function grant(user=4,trainer=2){return command(trainer,'grant',{userId:user,requestId:uuid()});}
 async function start(user=4){return command(user,'start',{attemptId:uuid(),tasks:require('../server/exam-tasks.cjs').generate()});}
 return{db,club,ta,tb,command,complete,current,grant,start};
}
module.exports=fixture;
