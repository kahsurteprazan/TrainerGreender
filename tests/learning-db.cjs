const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();let checks=0;await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(const file of ['001_initial.sql','002_member_management.sql','003_learning.sql','004_content_editor.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
 const seed=require('../server/learning-seed.json'),section=seed.sections[0],lessons=seed.lessons.filter(l=>l.section_id===section.id);assert.equal(seed.lessons.length,53);assert.equal((await db.query('select * from learning_questions')).rows.length,52);checks++;
 await db.exec("insert into profiles(telegram_id,display_name) values(1,'Owner'),(2,'Trainer A'),(3,'Trainer B'),(4,'Student A'),(5,'Pending'),(6,'Blocked'),(7,'Student B');update profiles set blocked=true where telegram_id=6;");
 const club=(await db.query("insert into clubs(name) values('Club') returning id")).rows[0].id;const a=(await db.query("select * from create_team(1,$1,'Team A',2)",[club])).rows[0],b=(await db.query("select * from create_team(1,$1,'Team B',3)",[club])).rows[0];await db.query('insert into memberships(user_id,team_id) values(4,$1),(7,$2)',[a.id,b.id]);
 async function cmd(actor,action,payload={}){return(await db.query('select learning_command($1,1,$2,$3::jsonb) as data',[actor,action,JSON.stringify(payload)])).rows[0].data;}
 async function rejects(actor,action,payload={}){await assert.rejects(()=>cmd(actor,action,payload));checks++;}
 let data=await cmd(4,'get');assert.equal(data.sections.length,4);assert(!JSON.stringify(data).includes('correctIndex'));assert(!JSON.stringify(data).includes('correct_index'));checks++;
 await rejects(5,'get');await rejects(6,'get');await rejects(3,'get',{userId:4});await rejects(4,'get',{userId:7});assert.equal((await cmd(2,'get',{userId:4})).userId,4);checks++;
 await rejects(4,'start',{sectionId:section.id});await rejects(4,'edit',{lessonId:lessons[0].id,title:'x',theory:'y'});
 for(const l of lessons)await cmd(4,'complete',{lessonId:l.id});await cmd(4,'complete',{lessonId:lessons[0].id});assert.equal((await cmd(4,'get')).progress.length,lessons.length);checks++;
 data=await cmd(4,'start',{sectionId:section.id});const attempt=data.activeAttempt;assert.equal(attempt.questions.length,lessons.length);assert(!JSON.stringify(attempt).includes('correctIndex'));checks++;
 assert.equal((await cmd(4,'start',{sectionId:section.id})).activeAttempt.id,attempt.id);checks++;
 await rejects(4,'submit',{attemptId:attempt.id,answers:{}});assert.equal((await cmd(4,'get')).attempts.filter(a=>a.status==='submitted').length,0);checks++;
 const wrong={};for(const q of attempt.questions){const correct=seed.questions.find(x=>x.id===q.id).correct_index;wrong[q.id]=(correct+1)%q.options.length;}
 await rejects(7,'submit',{attemptId:attempt.id,answers:wrong});
 data=await cmd(4,'submit',{attemptId:attempt.id,answers:wrong,score:15,passed:true});assert.equal(data.result.passed,false);assert.equal(data.result.score,0);checks++;
 await cmd(4,'submit',{attemptId:attempt.id,answers:{}});assert.equal((await cmd(4,'get')).attempts.filter(a=>a.status==='submitted').length,1);checks++;
 const second=(await cmd(4,'start',{sectionId:section.id})).activeAttempt;await cmd(4,'submit',{attemptId:second.id,answers:wrong});await rejects(4,'start',{sectionId:section.id});
 await rejects(4,'grant',{userId:4,sectionId:section.id,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});await rejects(3,'grant',{userId:4,sectionId:section.id,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 const grant={userId:4,sectionId:section.id,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};await cmd(2,'grant',grant);await cmd(2,'grant',grant);assert.equal((await cmd(2,'get',{userId:4})).grants.length,1);checks++;
 await rejects(2,'grant',{...grant,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 const third=(await cmd(4,'start',{sectionId:section.id})).activeAttempt,correctAnswers=Object.fromEntries(third.questions.map(q=>[q.id,seed.questions.find(x=>x.id===q.id).correct_index]));data=await cmd(4,'submit',{attemptId:third.id,answers:correctAnswers});assert.equal(data.result.passed,true);assert.equal(data.result.score,15);checks++;
 await rejects(4,'start',{sectionId:section.id});await rejects(2,'grant',{...grant,requestId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});
 await db.query('update memberships set enabled=false where user_id=4');await rejects(4,'get');assert.equal((await cmd(2,'get',{userId:4})).progress.length,15);checks++;
 await db.query('update memberships set enabled=true where user_id=4');await cmd(1,'edit',{lessonId:lessons[0].id,title:'Новая версия',theory:'Теория владельца',videoUrl:'https://youtu.be/dQw4w9WgXcQ'});assert.equal((await cmd(4,'get')).sections[0].lessons[0].title,'Новая версия');assert.equal((await cmd(4,'get')).progress.length,15);checks++;
 await db.exec('set role anon;');await assert.rejects(()=>db.query('select * from learning_questions'));await assert.rejects(()=>db.query("select learning_command(1,1,'get','{}')"));checks++;await db.exec('reset role;set role authenticated;');await assert.rejects(()=>db.query('select * from learning_attempts'));checks++;await db.exec('reset role;');await db.close();console.log(`Learning PostgreSQL: ${checks} checks passed (seed, roles, completion, limits, grading, idempotency, grants, RLS).`);
})().catch(e=>{console.error(e);process.exit(1);});
