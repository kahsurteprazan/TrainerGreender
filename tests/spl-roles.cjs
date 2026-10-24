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

 const out='/data/spl-redesign-implementation/previews';fs.mkdirSync(out,{recursive:true});
 async function capture(page,id){await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+id);await page.screenshot({path:out+'/'+id+'.png',fullPage:true});checks++;}
 try{
 for(const [role,id] of [['owner',1],['trainer',2],['student',4]]){
 const st=structuredClone(base);st.role=role;st.user={telegram_id:id,display_name:role==='student'?'Александр Константинопольский-Долгопрудный':'Михаил Орлов'};st.people.find(p=>p.telegram_id===id).display_name=st.user.display_name;
 const {page,errors}=await pageFor(st);await page.route('**/api/training',r=>r.fulfill({json:{summary:{runs:8,runs7d:6,runs30d:8,attempts:25,correct:22,lastTraining:'2026-10-23T12:00:00Z'},records:[],recent:[]}}));
 await page.locator('#screen-menu').waitFor({state:'visible'});await page.click('#platform-manage');
 if(role==='owner'){assert(await page.locator('[data-screen="newClub"]').count()===1);checks++;await capture(page,'owner-final');await page.locator('.entity-card').click();await capture(page,'club-final');await page.locator('.entity-card').click();await page.locator('.person-link').click();await capture(page,'student-final');await page.getByRole('button',{name:'Доступ',exact:true}).click();assert(await page.getByRole('button',{name:'Заблокировать аккаунт',exact:true}).count()===1);checks++;}
 if(role==='trainer'){assert(await page.locator('[data-screen="newClub"],[data-screen="people"]').count()===0);checks++;await capture(page,'trainer-final');await page.locator('.entity-card').click();await page.locator('.person-link').click();await page.getByRole('button',{name:'Доступ',exact:true}).click();assert(await page.getByRole('button',{name:'Заблокировать аккаунт',exact:true}).count()===0);checks++;await capture(page,'trainer-access-final');}
 if(role==='student'){assert(await page.locator('.management-nav').count()===0);assert(await page.locator('[data-operation="pause"],[data-kind="remove"]').count()===0);checks+=2;await capture(page,'profile-long-name');}
 for(const [width,height] of [[360,640],[390,844],[1280,900]]){await page.setViewportSize({width,height});await capture(page,role+'-responsive-'+width);}
 assert.deepEqual(errors,[]);checks++;await page.close();
 }
 console.log('SPL role layout:',checks,'checks passed: owner, trainer, learner, distinct controls, long name, mobile/desktop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
