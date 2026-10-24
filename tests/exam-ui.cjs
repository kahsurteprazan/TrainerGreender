const{chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),fixture=require('./exam-fixture.cjs');
(async()=>{const f=await fixture(),{db,ta,tb,club,complete,current,command:cmd}=f;await complete(5);let checks=0;const errors=[],dir='/data/greender-exam-previews';fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});
 const state=(id,role='student')=>({botUsername:'trainer_test_bot',user:{telegram_id:id,display_name:id===4?'Михаил Соколов':'Алексей'},role,allowed:true,teams:[id===5?tb:ta],clubs:[club],requests:[],memberships:[{user_id:id===2?4:id,team_id:id===5?tb.id:ta.id,enabled:true}],people:[{telegram_id:2,display_name:'Алексей'},{telegram_id:4,display_name:'Михаил Соколов'}]});
 let loseAnswer=false;
 async function pageFor(id,role='student'){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://telegram.org/**',r=>r.abort());await page.addInitScript(()=>window.Telegram={WebApp:{initData:'mock',ready(){},expand(){}}});
  await page.route('**/api/app',r=>r.fulfill({json:state(id,role)}));await page.route('**/api/training',r=>r.fulfill({json:{summary:{},records:[],recent:[]}}));
  await page.route('**/api/learning',r=>r.fulfill({json:{userId:id,sections:[],progress:[],attempts:[],grants:[]}}));
  await page.route('**/api/trainer',r=>r.fulfill({body:fs.readFileSync('server/trainer-source.txt','utf8'),contentType:'application/javascript'}));
  await page.route('**/api/exam',async r=>{const b=r.request().postDataJSON(),action=b.action.replace('exam','').toLowerCase(),p={...b};delete p.action;if(action==='start')p.tasks=require('../server/exam-tasks.cjs').generate();try{const data=await cmd(id,action,p);if(action==='answer'&&loseAnswer){loseAnswer=false;return r.abort();}return r.fulfill({json:data});}catch(e){return r.fulfill({status:400,json:{error:e.message}});}});
  await page.goto('http://localhost:3000');await page.locator('#screen-menu').waitFor({state:'visible'});return page;
 }
 async function shot(page,name,width=390){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+name);checks++;await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});}
 const click=async(p,act)=>p.locator('[data-exam="'+act+'"]').first().click();
 try{
 const student=await pageFor(4),teacher=await pageFor(2,'trainer');await teacher.click('#platform-manage');await teacher.locator('[data-screen="exams"]').click();await teacher.getByRole('heading',{name:'Можно выдать доступ · 1'}).waitFor();checks++;await shot(teacher,'admission-queue');await click(teacher,'detail');await click(teacher,'grant');await teacher.getByRole('heading',{name:'Допуск выдан',exact:true}).waitFor();assert.equal((await cmd(4,'get')).readiness.eligible,false);assert.equal((await db.query('select count(*)::int n from learning_progress where user_id=4')).rows[0].n,0);checks++;
 await student.click('#btn-exam');await click(student,'rules');await student.getByRole('heading',{name:'Перед началом'}).waitFor();await shot(student,'exam-rules');await click(student,'start');await click(student,'question');await student.locator('#exam-timer').waitFor();checks++;
 await shot(student,'theory');const a=await current();loseAnswer=true;await student.locator('[data-exam="theory"]').nth(a.snapshot[0].answer).click();await student.getByRole('button',{name:'Проверить состояние',exact:true}).waitFor();await click(student,'retry');await click(student,'question');assert.equal((await current()).cursor,1);checks++;
 // Real client timer expires once; no invisible next question starts.
 await student.getByText('Ошибки: 1',{exact:true}).waitFor({timeout:22000});assert.equal((await current()).cursor,2);checks++;
 async function solve(i,wrong=false){await click(student,'question');await student.locator('#exam-timer').waitFor();const a=await current(),q=a.snapshot[i];assert.equal(a.cursor,i);
  if(q.kind==='theory')await student.locator('[data-exam="theory"]').nth(q.answer).click();
  if(q.kind==='winner'){for(const v of q.answer)await student.locator('[data-exam="winner"][data-choice="'+v+'"]').click();await click(student,'winnerSubmit');}
  if(q.kind==='sidepots'){for(let j=0;j<q.answer.length;j++)await student.locator('[name="pot'+j+'"]').fill(String(q.answer[j]+(wrong&&j===0?1:0)));await student.locator('#exam-answer-form button').click();}
  await student.locator('[data-exam="question"],[data-exam="abort"]').first().waitFor();await student.waitForFunction(()=>!document.querySelector('[data-exam="refresh"]')?.disabled);
 }
 for(let i=2;i<10;i++)await solve(i);
 await click(student,'question');await student.locator('.exam-players').waitFor();await shot(student,'winner-mobile');await shot(student,'winner-desktop',1280);await student.setViewportSize({width:390,height:844});let x=await current();for(const v of x.snapshot[10].answer)await student.locator('[data-exam="winner"][data-choice="'+v+'"]').click();await click(student,'winnerSubmit');
 for(let i=11;i<20;i++)await solve(i);
 await click(student,'question');await student.locator('#exam-answer-form').waitFor();await shot(student,'sidepots-mobile');await shot(student,'sidepots-desktop',1280);await student.setViewportSize({width:390,height:844});x=await current();for(let j=0;j<x.snapshot[20].answer.length;j++)await student.locator('[name="pot'+j+'"]').fill(String(x.snapshot[20].answer[j]+(j===0?1:0)));await student.locator('#exam-answer-form button').click();
 for(let i=21;i<30;i++)await solve(i);
 await student.getByText('Ответьте тренеру устно.',{exact:false}).waitFor();checks++;assert.equal((await current()).errors,2);checks++;assert(!await student.locator('.exam-criteria').count());checks++;
 await click(teacher,'refresh');await teacher.locator('.exam-criteria').waitFor();await shot(teacher,'oral-trainer');await shot(student,'oral-student');await teacher.locator('[data-exam="grade"][data-passed="false"]').click();await teacher.getByRole('heading',{name:'Не сдан',exact:true}).waitFor();await student.getByRole('heading',{name:'Не сдан',exact:true}).waitFor({timeout:6000});checks++;await shot(student,'failed-third-error');assert.equal((await current()).snapshot,null);checks++;
 await click(teacher,'grant');await student.locator('[data-exam="refresh"]').click();await click(student,'rules');await click(student,'start');await click(student,'question');await student.locator('#exam-timer').waitFor();await student.reload();await student.locator('#screen-menu').waitFor({state:'visible'});await student.click('#btn-exam');await student.getByRole('heading',{name:'Не сдан',exact:true}).waitFor();assert.equal((await current()).reason,'interrupted');checks++;
 // A new granted attempt succeeds after all three manual oral decisions, including two allowed mistakes.
 await click(teacher,'refresh');await click(teacher,'grant');await student.locator('[data-exam="refresh"]').click();await click(student,'rules');await click(student,'start');const final=(await current()).id;
 for(let i=0;i<30;i++){await cmd(4,'question',{attemptId:final,index:i});const a=await current();await cmd(4,'answer',{attemptId:final,index:i,answer:a.snapshot[i].answer});}
 await student.locator('[data-exam="refresh"]').click();await student.getByText('Ответьте тренеру устно.',{exact:false}).waitFor();await click(teacher,'refresh');await teacher.locator('[data-exam="grade"][data-passed="false"]').click();await teacher.waitForTimeout(180);await teacher.locator('[data-exam="grade"][data-passed="false"]').click();await teacher.waitForTimeout(180);await teacher.locator('[data-exam="grade"][data-passed="true"]').click();await teacher.getByRole('heading',{name:'Сдан',exact:true}).waitFor();await student.getByRole('heading',{name:'Сдан',exact:true}).waitFor({timeout:6000});checks++;await shot(student,'exam-passed');assert.equal((await current()).errors,2);assert.equal((await current()).snapshot,null);checks++;
 // Rules and data remain readable at the smallest supported phone width.
 await shot(student,'exam-passed-small',320);
 // Already-passed learner: cancel confirmation does nothing; approval opens a new independent attempt.
 await click(teacher,'refresh');await teacher.getByRole('button',{name:'Дать доступ к экзамену',exact:true}).waitFor();teacher.removeAllListeners('dialog');let confirmText='';teacher.once('dialog',async d=>{confirmText=d.message();await d.dismiss();});const oldCount=(await db.query('select count(*)::int n from exam_grants where user_id=4')).rows[0].n;await click(teacher,'grant');await teacher.waitForTimeout(100);assert(confirmText.includes('уже сдал'));assert.equal((await db.query('select count(*)::int n from exam_grants where user_id=4')).rows[0].n,oldCount);checks++;
 teacher.once('dialog',d=>d.accept());await click(teacher,'grant');await teacher.getByRole('heading',{name:'Допуск выдан',exact:true}).waitFor();assert.equal(await teacher.locator('[data-exam="grant"]').count(),0);checks++;
 await click(student,'refresh');await click(student,'rules');await click(student,'start');await student.getByRole('button',{name:'Открыть первый вопрос',exact:true}).waitFor();assert.equal((await current()).status,'active');assert.equal((await db.query('select status from exam_attempts where id=$1',[final])).rows[0].status,'passed');checks++;
 assert.deepEqual(errors,[]);checks++;
 console.log('Exam UI:',checks,'checks passed (two accounts, timer, lost reply, two-error limit, manual oral grading, reload failure, readmission, pass, mobile/desktop).');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exit(1);});
