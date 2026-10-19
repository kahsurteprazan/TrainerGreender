const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});
 let checks=0;
 const team={id:'11111111-1111-1111-1111-111111111111',name:'Команда А',trainer_id:2,club_id:'22222222-2222-2222-2222-222222222222',enabled:true,invite_code:'a'.repeat(48)};
 const base={botUsername:'trainer_test_bot',user:{telegram_id:1,display_name:'Тест'},role:'owner',allowed:true,teams:[team],clubs:[{id:team.club_id,name:'Клуб',enabled:true}],requests:[],memberships:[],people:[]};
 async function pageFor(state){
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/**',r=>r.abort());
  await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'mock',ready(){},expand(){}}};});
  await page.route('**/api/app',r=>r.fulfill({json:state}));
  await page.route('**/api/trainer',r=>{
   let src=fs.readFileSync(path.join(__dirname,'../server/trainer-source.txt'),'utf8');
   src=src.replace('  resetGame();\n  resetWinnerGame();\n  showScreen("menu");\n})();','  window.__qa={startWinnerGame,finishWinnerSuccess,finishWinnerError,nextWinnerDeal,resetWinnerGame,stopWinnerTimer,getCount:()=>winnerSolvedCount,stop:()=>{stopWinnerTimer();clearTimeout(winnerAutoNextId);},startTrainer,checkAnswer,getTask:()=>currentTask,getSolved:()=>solvedCount};\n  resetGame();\n  resetWinnerGame();\n  showScreen("menu");\n})();');
   return r.fulfill({contentType:'application/javascript',body:src});
  });
  await page.goto('http://127.0.0.1:3000');return {page,errors};
 }
 try{
  const {page,errors}=await pageFor(base);
  await page.locator('#screen-menu').waitFor({state:'visible'});checks++;
  await page.click('#btn-trainer');await page.locator('#screen-trainer-menu').waitFor({state:'visible'});checks++;
  await page.evaluate(()=>{__qa.startTrainer('easy');const input=document.getElementById('answer-input');input.value=__qa.getTask().questions[0].answer;__qa.checkAnswer();});
  assert.equal(await page.evaluate(()=>__qa.getSolved()),1);checks++;
  await page.evaluate(()=>{__qa.startWinnerGame();__qa.finishWinnerError('Ошибка');__qa.stop();__qa.nextWinnerDeal();__qa.finishWinnerSuccess();__qa.stop();});
  assert.equal(await page.evaluate(()=>__qa.getCount()),1);checks++;
  await page.evaluate(()=>{__qa.nextWinnerDeal();__qa.finishWinnerError('Ошибка');__qa.stop();});
  assert.match(await page.locator('#winner-final-score').textContent(),/1$/);checks++;
  await page.click('#platform-manage');await page.getByRole('heading',{name:'Управление платформой'}).waitFor();
  assert.equal(await page.locator('form[data-form=club]').count(),1);checks++;
  await page.screenshot({path:'/data/greender-owner-qa.png',fullPage:true});
  assert.deepEqual(errors,[]);checks++;await page.close();
  const pending=await pageFor({...base,user:{telegram_id:4,display_name:'Ученик'},role:'student',allowed:false,teams:[],clubs:[],requests:[{id:'r',status:'pending'}]});
  await pending.page.getByText('Заявка: ожидает решения').waitFor();
  assert.equal(await pending.page.locator('script[src="/api/trainer"]').count(),0);checks++;
  assert.equal(await pending.page.locator('[data-form=club]').count(),0);checks++;assert.deepEqual(pending.errors,[]);await pending.page.close();
  const trainer=await pageFor({...base,user:{telegram_id:2,display_name:'Тренер'},role:'trainer'});
  await trainer.page.locator('#screen-menu').waitFor({state:'visible'});await trainer.page.click('#platform-manage');
  await trainer.page.getByRole('heading',{name:'Моя команда',exact:true}).waitFor();assert.equal(await trainer.page.locator('[data-form=club]').count(),0);checks++;
  assert.equal(await trainer.page.locator('input[readonly]').inputValue(),'https://t.me/trainer_test_bot?start='+team.invite_code);checks++;
  assert.deepEqual(trainer.errors,[]);checks++;await trainer.page.close();
  console.log(`UI smoke: ${checks} checks passed (mobile UI, roles, existing trainers, winner score).`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
