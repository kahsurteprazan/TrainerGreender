const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID:uuid}=require('node:crypto');
(async()=>{const fixture=require('./exam-fixture.cjs');const {db,command:exam,grant,start,current}=await fixture();let checks=0;const ok=v=>{assert(v);checks++;};
try{
 const sql=fs.readFileSync(process.env.SPL_COURSE_SQL||path.join(__dirname,'../scripts/publish-spl-course-v3.sql'),'utf8');
 const old=(await db.query('select id from learning_sections order by sort_order')).rows;const oldLesson=(await db.query('select id from learning_lessons limit 1')).rows[0].id;
 await db.query('insert into learning_progress(user_id,lesson_id) values(4,$1)',[oldLesson]);
 await db.query("insert into learning_attempts(user_id,section_id,status,snapshot,score,total,passed,submitted_at) values(4,$1,'submitted','[]',1,1,true,now())",[old[0].id]);
 await db.query('insert into learning_grants(id,user_id,section_id,granted_by) values($1,4,$2,2)',[uuid(),old[0].id]);
 const profileCount=(await db.query('select count(*)::int n from profiles')).rows[0].n;
 await db.exec(sql);
 const cmd=async(user,action,p={})=>(await db.query('select learning_command($1,1,$2,$3::jsonb) x',[user,action,JSON.stringify(p)])).rows[0].x;
 let data=await cmd(4,'get');ok(data.sections.length===11);ok(data.sections.reduce((n,s)=>n+s.lessons.length,0)===51);ok(data.sections.reduce((n,s)=>n+s.questionCount,0)===250);ok(data.progress.length===0&&data.attempts.length===0&&data.grants.length===0);
 ok(!JSON.stringify(data).includes('correct_index')&&!JSON.stringify(data).includes('correctIndex'));
 ok((await db.query('select count(*)::int n from profiles')).rows[0].n===profileCount);
 ok((await db.query('select count(*)::int n from learning_sections where archived')).rows[0].n===4);
 const read=(await exam(4,'get')).readiness;ok(read.sections===11&&read.lessons===51&&read.questionCount===250&&read.oralCount===25&&read.configured&&!read.eligible);
 const privateQuestions=new Map((await db.query('select id,correct_index from learning_questions where published and not archived')).rows.map(q=>[q.id,q]));
 for(let i=0;i<data.sections.length;i++){
  const block=data.sections[i];await assert.rejects(()=>cmd(4,'start',{sectionId:block.id}));checks++;
  // A single unread topic still locks the test.
  for(const topic of block.lessons.slice(0,-1))await cmd(4,'complete',{lessonId:topic.id});
  await assert.rejects(()=>cmd(4,'start',{sectionId:block.id}));checks++;
  await cmd(4,'complete',{lessonId:block.lessons.at(-1).id});
  const run=(await cmd(4,'start',{sectionId:block.id})).activeAttempt;ok(run.questions.length===block.questionCount);
  ok(!JSON.stringify(run).includes('correctIndex'));
  const answers=Object.fromEntries(run.questions.map(q=>[q.id,privateQuestions.get(q.id).correct_index]));
  const out=await cmd(4,'submit',{attemptId:run.id,answers});ok(out.result.passed&&out.result.total===block.questionCount&&out.result.score===block.questionCount);
  if(i<10)ok(!(await exam(4,'get')).readiness.eligible);
 }
 ok((await exam(4,'get')).readiness.eligible);
 // New tests keep existing two-attempt / trainer-grant semantics.
 const first=data.sections[0];for(const topic of first.lessons)await cmd(5,'complete',{lessonId:topic.id});
 for(let i=0;i<2;i++){const run=(await cmd(5,'start',{sectionId:first.id})).activeAttempt;const answers=Object.fromEntries(run.questions.map(q=>[q.id,(privateQuestions.get(q.id).correct_index+1)%4]));ok(!(await cmd(5,'submit',{attemptId:run.id,answers})).result.passed);}
 await assert.rejects(()=>cmd(5,'start',{sectionId:first.id}));checks++;
 await cmd(3,'grant',{userId:5,sectionId:first.id,requestId:uuid()});ok(!!(await cmd(5,'start',{sectionId:first.id})).activeAttempt);
 await grant();const run=(await start()).attempt.id;
 for(let i=0;i<30;i++){await exam(4,'question',{attemptId:run,index:i});const a=await current();await exam(4,'answer',{attemptId:run,index:i,answer:a.snapshot[i].answer});}
 const oral=await exam(2,'get',{userId:4});ok(oral.attempt.status==='oral'&&oral.attempt.index===30);ok(typeof oral.attempt.question.criteria==='string'&&oral.attempt.question.criteria.length>100);
 ok(!(await exam(4,'get')).attempt.question.criteria);
 for(let i=30;i<33;i++)await exam(2,'grade',{attemptId:run,userId:4,index:i,passed:true});ok((await current()).status==='passed');
 await assert.rejects(()=>db.exec(sql));await db.exec('rollback;');checks++;ok((await cmd(4,'get')).sections.length===11);
 console.log('SPL curriculum DB:',checks,'checks passed; 11 blocks / 51 topics / 250 questions; all tests and 33-task exam passed.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1);});
