const assert=require('node:assert/strict'),{randomUUID:uuid}=require('node:crypto'),fixture=require('./exam-fixture.cjs');
(async()=>{const{db,club,ta,tb,command:cmd,complete,current,grant,start}=await fixture();let n=0;const ok=(v)=>{assert(v);n++;},reject=async fn=>{await assert.rejects(fn);n++;};
 try{
 await reject(()=>cmd(6,'get'));await reject(()=>cmd(3,'get',{userId:4}));await reject(()=>cmd(4,'get',{userId:5}));await reject(()=>cmd(4,'list'));await reject(()=>cmd(2,'get'));await reject(()=>grant());
 ok(!(await cmd(4,'get')).readiness.eligible);await complete();ok((await cmd(4,'get')).readiness.eligible);ok((await cmd(2,'list')).rows.length===1);ok((await cmd(1,'list')).rows.length===2);
 await reject(()=>grant(4,4));await reject(()=>grant(4,3));
 const requestId=uuid();await cmd(2,'grant',{userId:4,requestId});await cmd(2,'grant',{userId:4,requestId});ok((await db.query('select count(*)::int n from exam_grants')).rows[0].n===1);await reject(()=>grant());
 const id=uuid(),tasks=require('../server/exam-tasks.cjs').generate();let d=await cmd(4,'start',{attemptId:id,tasks});ok(d.attempt.status==='active'&&d.attempt.index===0&&!d.attempt.question);await cmd(4,'start',{attemptId:id,tasks});ok((await db.query('select count(*)::int n from exam_attempts')).rows[0].n===1);await reject(()=>start());
 await reject(()=>cmd(4,'answer',{attemptId:id,index:0,answer:0}));await reject(()=>cmd(4,'question',{attemptId:id,index:2}));
 d=await cmd(4,'question',{attemptId:id,index:0});ok(d.attempt.question.kind==='theory'&&!JSON.stringify(d).includes('"answer"'));ok(!JSON.stringify(d).includes('criteria'));
 const wrong=async()=>{let a=await current();await cmd(4,'question',{attemptId:a.id,index:a.cursor});a=await current();return cmd(4,'answer',{attemptId:a.id,index:a.cursor,answer:(a.snapshot[a.cursor].answer+1)%a.snapshot[a.cursor].options.length});};
 d=await wrong();ok(d.attempt.errors===1&&d.attempt.status==='active');await cmd(4,'answer',{attemptId:id,index:0,answer:0});ok((await current()).errors===1);
 d=await wrong();ok(d.attempt.errors===2&&d.attempt.status==='active');d=await wrong();ok(d.attempt.errors===3&&d.attempt.status==='failed');ok((await current()).snapshot===null);await reject(()=>start());
 await grant();d=await start();const next=d.attempt.id;await cmd(4,'question',{attemptId:next,index:0});await reject(()=>cmd(4,'answer',{attemptId:next,index:0,answer:null}));await db.query("update exam_attempts set current_started_at=clock_timestamp()-interval '16 seconds' where id=$1",[next]);
 d=await cmd(4,'answer',{attemptId:next,index:0,answer:0});ok(d.attempt.errors===1&&d.attempt.index===1);d=await cmd(2,'get',{userId:4});ok(d.attempt.errors===1);await cmd(4,'enter');ok((await current()).status==='failed');ok((await current()).reason==='interrupted');
 // Real 30-task automatic phase: two errors may be in different blocks; third oral failure fails the whole attempt.
 await grant();d=await start();const run=d.attempt.id;for(let i=0;i<30;i++){await cmd(4,'question',{attemptId:run,index:i});const a=await current();let answer=a.snapshot[i].answer;if(i===0)answer=(answer+1)%a.snapshot[i].options.length;if(i===10)answer=[];d=await cmd(4,'answer',{attemptId:run,index:i,answer});}
 ok(d.attempt.status==='oral'&&d.attempt.errors===2&&d.attempt.index===30);ok(!JSON.stringify(d).includes('criteria'));d=await cmd(2,'get',{userId:4});ok(!!d.attempt.question.criteria);
 await reject(()=>cmd(4,'grade',{attemptId:run,userId:4,index:30,passed:true}));await reject(()=>cmd(3,'grade',{attemptId:run,userId:4,index:30,passed:true}));await reject(()=>cmd(4,'answer',{attemptId:run,index:30,answer:0}));
 d=await cmd(2,'grade',{attemptId:run,userId:4,index:30,passed:false});ok(d.attempt.status==='failed'&&d.attempt.errors===3);ok((await current()).snapshot===null);
 // Successful result with two oral mistakes, duplicate rating is ignored.
 await grant();d=await start();const pass=d.attempt.id;for(let i=0;i<30;i++){await cmd(4,'question',{attemptId:pass,index:i});const a=await current();d=await cmd(4,'answer',{attemptId:pass,index:i,answer:a.snapshot[i].answer});}
 await cmd(2,'grade',{attemptId:pass,userId:4,index:30,passed:false});await cmd(2,'grade',{attemptId:pass,userId:4,index:30,passed:false});ok((await current()).errors===1);await cmd(2,'grade',{attemptId:pass,userId:4,index:31,passed:false});d=await cmd(2,'grade',{attemptId:pass,userId:4,index:32,passed:true});ok(d.attempt.status==='passed'&&d.attempt.errors===2);ok((await current()).snapshot===null);await reject(()=>grant());
 // Team changes close old attempts and invalidate an unused grant without stranding admission.
 await complete(5);await grant(5,3);await db.query('update memberships set team_id=$1 where user_id=5',[ta.id]);ok(!(await cmd(2,'get',{userId:5})).grant);await grant(5,2);d=await start(5);await db.query('update memberships set team_id=$1 where user_id=5',[tb.id]);d=await cmd(3,'get',{userId:5});ok(d.attempt.status==='failed'&&d.attempt.reason==='access_changed');
 await db.query('update exam_grants set used_at=clock_timestamp() where user_id=5 and used_at is null');
 // Published club-specific section and unread new lesson prevent admission.
 await complete(5);ok((await cmd(5,'get')).readiness.eligible);await db.query("update learning_progress set completed_at=now() where user_id=5");const lesson=(await db.query('select id from learning_lessons limit 1')).rows[0].id;await db.query('delete from learning_progress where user_id=5 and lesson_id=$1',[lesson]);ok(!(await cmd(5,'get')).readiness.eligible);await reject(()=>grant(5,3));await db.query('insert into learning_progress(user_id,lesson_id) values(5,$1)',[lesson]);await grant(5,3);
 await db.query('update memberships set enabled=false where user_id=5');await reject(()=>start(5));await db.query('update memberships set enabled=true where user_id=5');d=await start(5);await cmd(5,'enter');ok((await current(5)).reason==='interrupted');
 await db.exec('set role anon');await reject(()=>db.query('select * from exam_attempts'));await reject(()=>db.query("select exam_command(4,1,'get','{}')"));await reject(()=>db.query('select exam_state(4,1,2)'));await db.exec('reset role');
 console.log('Exam PostgreSQL:',n,'checks passed.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exit(1);});
