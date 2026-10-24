const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});
 let checks=0;
 const team={id:'11111111-1111-4111-8111-111111111111',name:'Вечерняя группа',trainer_id:2,club_id:'22222222-2222-4222-8222-222222222222',enabled:true,invite_code:'a'.repeat(48)};
 const member={user_id:4,team_id:team.id,enabled:true,joined_at:'2026-10-19T11:00:00Z'};
 const base={botUsername:'trainer_test_bot',user:{telegram_id:1,display_name:'Назар'},role:'owner',allowed:true,teams:[team],clubs:[{id:team.club_id,name:'Grinder',enabled:true}],requests:[],memberships:[member],people:[{telegram_id:1,display_name:'Назар'},{telegram_id:2,display_name:'Алексей',username:'alex_trainer'},{telegram_id:4,display_name:'Михаил Соколов',username:'mikhail',last_seen_at:'2026-10-19T12:00:00Z'},{telegram_id:5,display_name:'Новый тренер'},{telegram_id:6,display_name:'Заблокированный',blocked:true}]};
 async function pageFor(state){
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/**',r=>r.abort());await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'mock',ready(){},expand(){}}};});
  await page.route('**/api/app',r=>r.fulfill({json:state}));
  await page.route('**/api/learning',r=>r.fulfill({json:r.request().postDataJSON().action==='learnManageGet'?{editor:{sections:[],lessons:[],questions:[]}}:{userId:4,sections:[],progress:[],attempts:[],grants:[]}}));
  await page.route('**/api/trainer',r=>{
   let src=fs.readFileSync(path.join(__dirname,'../server/trainer-source.txt'),'utf8');
   src='window.GreenderTraining=null;\n'+src;
   src=src.replace('  resetGame();\n  resetWinnerGame();\n  showScreen("menu");\n})();','  window.__qa={startWinnerGame,finishWinnerSuccess,finishWinnerError,nextWinnerDeal,resetWinnerGame,stopWinnerTimer,getCount:()=>winnerSolvedCount,stop:()=>{stopWinnerTimer();clearTimeout(winnerAutoNextId);},startTrainer,checkAnswer,getTask:()=>currentTask,getSolved:()=>solvedCount};\n  resetGame();\n  resetWinnerGame();\n  showScreen("menu");\n})();');
   return r.fulfill({contentType:'application/javascript',body:src});
  });await page.goto('http://127.0.0.1:3000');return {page,errors};
 }
 async function snapshot(page,label){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow: '+label);checks++;
  const content=await page.evaluate(()=>{const root=document.documentElement.cloneNode(true);root.querySelectorAll('script,link[rel=stylesheet]').forEach(n=>n.remove());return '<!DOCTYPE html>'+root.outerHTML;});
  fs.mkdirSync('/data/greender-ui-previews',{recursive:true});fs.writeFileSync('/data/greender-ui-previews/'+label+'.html',content.replace('</head>','<style>'+fs.readFileSync(path.join(__dirname,'../style.css'),'utf8')+'</style></head>'));
  await page.screenshot({path:'/data/greender-ui-previews/'+label+'.png',fullPage:true});
 }
 try{
  const {page,errors}=await pageFor(base);await page.locator('#screen-menu').waitFor({state:'visible'});checks++;
  await page.click('#btn-trainer');await page.locator('#screen-trainer-menu').waitFor({state:'visible'});checks++;
  await page.evaluate(()=>{__qa.startTrainer('easy');document.getElementById('answer-input').value=__qa.getTask().questions[0].answer;__qa.checkAnswer();});assert.equal(await page.evaluate(()=>__qa.getSolved()),1);checks++;
  await page.evaluate(()=>{__qa.startWinnerGame();__qa.finishWinnerError('Ошибка');__qa.stop();__qa.nextWinnerDeal();__qa.finishWinnerSuccess();__qa.stop();});assert.equal(await page.evaluate(()=>__qa.getCount()),1);checks++;
  await page.click('#platform-manage');await page.getByRole('heading',{name:'Управление платформой'}).waitFor();assert.equal(await page.locator('form').count(),0);checks++;await snapshot(page,'owner-clubs');
  await page.locator('.entity-card').click();await page.getByRole('heading',{name:'Grinder',exact:true}).waitFor();await snapshot(page,'club');
  await page.locator('.entity-card').click();await page.getByRole('heading',{name:'Вечерняя группа',exact:true}).waitFor();assert.match(await page.locator('.page-heading').textContent(),/Алексей/);checks++;await snapshot(page,'team');
  await page.locator('.person-link').click();await page.getByRole('heading',{name:'Михаил Соколов',exact:true}).waitFor();await page.getByRole('heading',{name:'Прогресс обучения'}).waitFor();checks++;await snapshot(page,'student-learning');
  await page.getByRole('button',{name:'Тренажёры',exact:true}).click();await snapshot(page,'student-training');
  await page.getByRole('button',{name:'Доступ',exact:true}).click();await snapshot(page,'student-access');
  let live=structuredClone(base);const actions=[];
  await page.route('**/api/app',r=>{const b=r.request().postDataJSON();actions.push(b);if(b.action==='manageMember'){if(b.operation==='remove')live.memberships=[];else live.memberships[0].enabled=b.operation==='resume';}return r.fulfill({json:{...live,notice:b.operation==='remove'?'Ученик убран из команды':'Доступ обновлён'}});});
  await page.getByRole('button',{name:'Приостановить доступ',exact:true}).click();await page.getByRole('button',{name:'Возобновить доступ',exact:true}).waitFor();assert.equal(actions.at(-1).operation,'pause');checks++;
  await page.getByRole('button',{name:'Возобновить доступ',exact:true}).click();await page.getByRole('button',{name:'Приостановить доступ',exact:true}).waitFor();checks++;
  await page.getByRole('button',{name:'Убрать из команды',exact:true}).click();await page.locator('dialog[open]').waitFor();await snapshot(page,'remove-confirm');
  await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(actions.length,2);checks++;
  await page.getByRole('button',{name:'Убрать из команды',exact:true}).click();await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await page.getByText('Первый ученик ещё впереди',{exact:true}).waitFor();assert.equal(actions.at(-1).operation,'remove');checks++;
  await page.getByRole('button',{name:'Участники',exact:true}).click();await page.locator('#people-search').fill('михаил');assert.equal(await page.locator('.searchable:visible').count(),1);checks++;
  await page.locator('#people-search').fill('');await snapshot(page,'people');
  await page.getByRole('button',{name:'Пригласить тренера',exact:true}).click();let fails=true;
  await page.route('**/api/app',r=>{if(fails)return r.fulfill({status:400,json:{error:'Человек должен сначала открыть бота'}});return r.fulfill({json:{...base,notice:'Приглашение отправлено'}});});
  await page.locator('[name=trainerId]').fill('42');await page.getByRole('button',{name:'Отправить приглашение'}).click();await page.locator('.form-feedback.is-error').waitFor();assert.equal(await page.locator('[name=trainerId]').inputValue(),'42');checks++;await snapshot(page,'invite-error');
  fails=false;await page.getByRole('button',{name:'Отправить приглашение'}).click();await page.getByText('Приглашение отправлено',{exact:true}).waitFor();checks++;
  await page.getByRole('button',{name:'Клубы',exact:true}).click();await page.locator('.entity-card').click();await page.getByRole('button',{name:'+ Добавить команду'}).click();assert.equal(await page.locator('select[name=trainerId] option').count(),3);assert(!/Михаил|Заблокированный|Назар/.test(await page.locator('select[name=trainerId]').textContent()));checks++;await snapshot(page,'new-team');
  await page.getByRole('button',{name:'Клубы',exact:true}).click();await page.getByRole('button',{name:'+ Создать клуб'}).click();await snapshot(page,'new-club');
  await page.getByRole('button',{name:'Обучение',exact:true}).click();await snapshot(page,'content-preview');
  await page.getByRole('button',{name:'Заявки',exact:true}).click();await snapshot(page,'requests-empty');
  await page.getByRole('button',{name:'Клубы',exact:true}).click();await page.setViewportSize({width:1280,height:900});await snapshot(page,'desktop-clubs');assert.deepEqual(errors,[]);checks++;await page.close();
  const trainer=await pageFor({...base,user:base.people[1],role:'trainer',people:base.people.filter(p=>[2,4].includes(p.telegram_id))});await trainer.page.locator('#screen-menu').waitFor({state:'visible'});await trainer.page.click('#platform-manage');await trainer.page.locator('.entity-card').click();await trainer.page.getByRole('button',{name:'Пригласить',exact:true}).click();assert.equal(await trainer.page.locator('input[readonly]').inputValue(),'https://t.me/trainer_test_bot?start='+team.invite_code);checks++;await snapshot(trainer.page,'trainer-invite');
  await trainer.page.getByRole('button',{name:'Ученики · 1',exact:true}).click();await trainer.page.locator('.person-link').click();await trainer.page.getByRole('button',{name:'Доступ',exact:true}).click();assert.equal(await trainer.page.getByRole('button',{name:'Убрать из команды',exact:true}).count(),1);assert.equal(await trainer.page.getByRole('button',{name:'Заблокировать аккаунт',exact:true}).count(),0);checks++;assert.deepEqual(trainer.errors,[]);await trainer.page.close();
  const student=await pageFor({...base,user:base.people[2],role:'student',people:[],teams:[{...team,invite_code:undefined}]});await student.page.locator('#screen-menu').waitFor({state:'visible'});await student.page.click('#platform-manage');assert.equal(await student.page.locator('[data-action=member]').count(),0);checks++;await snapshot(student.page,'learner-profile');await student.page.close();
  const pending=await pageFor({...base,user:{telegram_id:9,display_name:'Новый ученик'},role:'student',allowed:false,teams:[],clubs:[],memberships:[],people:[],requests:[{status:'pending'}]});await pending.page.getByText('Заявка: ожидает решения').waitFor();assert.equal(await pending.page.locator('script[src="/api/trainer"]').count(),0);checks++;await snapshot(pending.page,'pending');await pending.page.close();
  const reqPage=await pageFor({...base,requests:[{id:'33333333-3333-4333-8333-333333333333',team_id:team.id,user_id:5,status:'pending'}]});await reqPage.page.locator('#screen-menu').waitFor({state:'visible'});await reqPage.page.click('#platform-manage');await reqPage.page.getByRole('button',{name:'Заявки · 1',exact:true}).click();await snapshot(reqPage.page,'requests');await reqPage.page.close();
  console.log(`UI smoke: ${checks} checks passed (navigation, roles, learner previews, removal confirmation, pause/resume, invitation errors, mobile and desktop).`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
