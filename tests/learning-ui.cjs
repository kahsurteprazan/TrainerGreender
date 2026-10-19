const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const seed=require('../server/learning-seed.json');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});let checks=0;
 const team={id:'11111111-1111-4111-8111-111111111111',name:'Вечерняя группа',trainer_id:2,club_id:'22222222-2222-4222-8222-222222222222',enabled:true};
 const base={botUsername:'trainer_test_bot',user:{telegram_id:4,display_name:'Михаил'},role:'student',allowed:true,teams:[team],clubs:[{id:team.club_id,name:'Grinder',enabled:true}],requests:[],memberships:[{user_id:4,team_id:team.id,enabled:true}],people:[{telegram_id:4,display_name:'Михаил'},{telegram_id:2,display_name:'Алексей'}]};
 const initial=()=>({userId:4,sections:seed.sections.map(s=>({...s,lessons:seed.lessons.filter(l=>l.section_id===s.id).map(l=>({id:l.id,title:l.title,theory:l.theory,cards:l.cards,steps:l.steps,videoUrl:l.video_url}))})),progress:[],attempts:[],grants:[]});
 const calls=[],errors=[];let data=initial(),answers={},failSubmit=false;
 const editor={sections:seed.sections.map(s=>({...s,published:true,archived:false,everPublished:true})),lessons:seed.lessons.map(l=>({...l,sectionId:l.section_id,videoUrl:l.video_url,published:true,archived:false,everPublished:true})),questions:[]};
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',r=>r.abort());await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({body:'',contentType:'text/html'}));
 await page.addInitScript(()=>window.Telegram={WebApp:{initData:'mock',ready(){},expand(){}}});
 await page.route('**/api/app',r=>r.fulfill({json:base}));
 await page.route('**/api/trainer',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync('server/trainer-source.txt','utf8')}));
 await page.route('**/api/learning',async r=>{const b=r.request().postDataJSON();calls.push(b);let out;
  if(b.action==='learnManageGet')return r.fulfill({json:{editor}});
  if(b.action==='learnManage'){const l=editor.lessons.find(l=>l.id===b.id);Object.assign(l,{title:b.title,theory:b.theory,videoUrl:b.videoUrl});Object.assign(data.sections.flatMap(s=>s.lessons).find(l=>l.id===b.id),{title:b.title,theory:b.theory,videoUrl:b.videoUrl});return r.fulfill({json:{editor}});}
  if(b.action==='learnComplete')data.progress.push({lessonId:b.lessonId,completedAt:new Date().toISOString()});
  if(b.action==='learnStart'){const questions=seed.questions.filter(q=>q.section_id===b.sectionId).slice(0,2).map(q=>({id:q.id,prompt:q.prompt,options:q.options,cards:q.cards}));const id='aaaaaaaa-aaaa-4aaa-8aaa-'+String(data.attempts.length+1).padStart(12,'0');let a=data.attempts.find(a=>a.status==='open');if(!a){a={id,sectionId:b.sectionId,status:'open',passed:false};data.attempts.unshift(a);}out={...data,activeAttempt:{...a,questions}};}
  if(b.action==='learnSubmit'){const a=data.attempts.find(a=>a.id===b.attemptId);a.status='submitted';a.score=0;a.total=2;a.passed=false;out={...data,result:{...a}};if(failSubmit){failSubmit=false;return r.abort();}}
  if(b.action==='learnGrant')data.grants.push({sectionId:b.sectionId});
  if(b.action==='learnEdit'){const l=data.sections.flatMap(s=>s.lessons).find(l=>l.id===b.lessonId);Object.assign(l,{title:b.title,theory:b.theory,videoUrl:b.videoUrl});}
  await r.fulfill({json:out||data});
 });
 const dir='/data/greender-learning-previews';fs.mkdirSync(dir,{recursive:true});
 async function shot(name){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+name);checks++;await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});}
 async function click(action){await page.locator('[data-action="'+action+'"]').first().click();}
 try{
  await page.goto('http://localhost:3000');await page.locator('#screen-menu').waitFor({state:'visible'});await page.click('#btn-learn');await page.locator('.entity-card').first().waitFor();assert.equal(await page.locator('.entity-card').count(),4);checks++;await shot('catalog-mobile');
  await page.setViewportSize({width:1280,height:900});await shot('catalog-desktop');await page.setViewportSize({width:390,height:844});
  await click('studySection');assert(await page.locator('[data-action=studyStart]').isDisabled());checks++;await shot('section-locked');
  await click('studyLesson');await page.locator('#lesson-end').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!document.getElementById('complete-lesson').disabled);await shot('lesson');await click('studyComplete');await page.locator('[data-action=studyStart]').waitFor();assert.equal(calls.filter(c=>c.action==='learnComplete').length,1);checks++;
  const sec=data.sections[0];data.progress=sec.lessons.map(l=>({lessonId:l.id}));await click('studyCatalog');await click('studyExit');await page.click('#btn-learn');await page.locator('.entity-card').first().waitFor();await click('studySection');assert(!await page.locator('[data-action=studyStart]').isDisabled());checks++;
  await click('studyStart');await page.locator('.quiz-choice').first().waitFor();assert.equal(data.attempts.filter(a=>a.status==='submitted').length,0);checks++;
  await click('studyAnswer');await click('studyNext');await shot('quiz');await click('studyAnswer');
  await click('studyCatalog');await click('studySection');await click('studyStart');await page.locator('[data-action=studySubmit]').waitFor();assert.equal(await page.locator('.quiz-choice[aria-pressed=true]').count(),1);checks++;
  await click('studySubmit');await page.locator('.result-score').waitFor();await shot('result');assert.equal(data.attempts.filter(a=>a.status==='submitted').length,1);checks++;
  await click('studySection');await click('studyStart');await page.locator('.quiz-choice').first().waitFor();await click('studyAnswer');await click('studyNext');await click('studyAnswer');failSubmit=true;await click('studySubmit');await page.getByRole('button',{name:'Проверить состояние'}).click();await page.locator('.result-score').waitFor();assert.equal(calls.filter(c=>c.action==='learnSubmit').length,2);checks++;await click('studySection');assert(await page.locator('[data-action=studyStart]').isDisabled());checks++;await shot('attempts-exhausted');
  await click('studyCatalog');await click('studyExit');base.role='trainer';base.user={telegram_id:2,display_name:'Алексей'};await page.reload();await page.locator('#screen-menu').waitFor({state:'visible'});await page.click('#platform-manage');await page.locator('.entity-card').click();await page.locator('.person-link').click();await page.locator('[data-action=learningGrant]').waitFor();await shot('trainer-progress');await click('learningGrant');await page.getByText('Доступно попыток: 1',{exact:false}).first().waitFor();assert.equal(calls.filter(c=>c.action==='learnGrant').length,1);checks++;
  base.role='owner';base.user={telegram_id:1,display_name:'Назар'};await page.reload();await page.locator('#screen-menu').waitFor({state:'visible'});await page.click('#platform-manage');await page.getByRole('button',{name:'Обучение',exact:true}).click();await page.locator('details.settings-section').first().waitFor();await page.locator('details.settings-section').first().locator('summary').click();await click('lessonEdit');await page.locator('textarea[name=theory]').fill('Проверочная теория.');await page.locator('[name=videoUrl]').fill('https://youtu.be/dQw4w9WgXcQ');await page.getByRole('button',{name:'Сохранить урок',exact:true}).click();await page.getByText('Материал сохранён.',{exact:false}).waitFor();checks++;await shot('owner-editor');
  await click('contentBack');await click('studyOpen');await page.locator('.entity-card').first().waitFor();await click('studySection');await click('studyLesson');assert.equal(await page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]').count(),1);checks++;await shot('lesson-video');assert.deepEqual(errors,[]);checks++;
  console.log(`Learning UI: ${checks} checks passed (gating, drafts, limits, lost-response recovery, trainer grant, owner editing, video, mobile/desktop).`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
