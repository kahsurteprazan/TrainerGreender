const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});const errors=[];
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',r=>r.abort());await page.addInitScript(()=>window.Telegram={WebApp:{initData:'mock',ready(){},expand(){}}});
 await page.route('**/api/app',r=>r.fulfill({json:{user:{telegram_id:4,display_name:'Михаил'},role:'student',allowed:true,teams:[],clubs:[],requests:[],memberships:[],people:[]}}));
 await page.route('**/api/trainer',r=>{let src=fs.readFileSync('server/trainer-source.txt','utf8');src='window.GreenderTraining=null;\n'+src;const end='  resetGame();\n  resetWinnerGame();\n  showScreen("menu");\n})();';assert(src.includes(end));src=src.replace(end,`  window.__arena={startTrainer,checkAnswer,nextQuestion,onTimeout,endGame,stopTimer,goToMenu,startWinnerGame,stopWinnerTimer,selectWinner,
 state:()=>({lives,solvedCount,runBanks,runErrors,runAttempts,currentPotIndex,gameOver,answered}), task:()=>currentTask,
 fixture:(bets,mode='choice',timed=false)=>{timedMode=timed;document.querySelector('input[name="answer-format"][value="'+mode+'"]').checked=true;startTrainer('hard');stopTimer();const pots=calculatePots(bets);currentTask={bets,pots,questions:[pots.main,...pots.sides].map((answer,i)=>({answer,prompt:i?'Введите размер Сайд-пота '+i+':':'Введите размер Основного банка:'}))};currentPotIndex=0;taskTextEl.innerHTML=tableUI.renderTable(bets);setPlayingUi();updateQuestionPrompt();startTimer();},
 late:()=>timerDeadline=performance.now()-1,
 winner:()=>({dealing:winnerDealing,winners:winnerDeal.winners,answered:winnerAnswered,solved:winnerSolvedCount,round:winnerRound}),
 tie:()=>{stopWinnerTimer();const deck=createWinnerDeck();const pick=(rank,suit)=>deck.find(c=>c.rank===rank&&c.suit===suit);const board=[10,11,12,13,14].map(r=>pick(r,'hearts'));winnerDeal={board,players:[{name:'Игрок 1',cards:[pick(2,'clubs'),pick(3,'clubs')]},{name:'Игрок 2',cards:[pick(4,'spades'),pick(5,'spades')]}],winners:[0,1]};winnerDeal.players.forEach(p=>p.hand=bestWinnerHand([...board,...p.cards]));winnerAnswered=false;winnerSelected=new Set();renderWinnerDeal();readyWinnerCards();}
 };\n`+end);return r.fulfill({contentType:'application/javascript',body:src});});


 const dir='/data/spl-redesign-implementation/previews';fs.mkdirSync(dir,{recursive:true});const checks=[];
 function ok(v,label){assert(v,label);checks.push(label);}
 async function noOverflow(label){ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' no horizontal overflow');}
 async function reachable(selector,label){const el=page.locator(selector);await el.scrollIntoViewIfNeeded();const r=await el.boundingBox();ok(r&&r.y>=0&&r.y+r.height<=await page.evaluate(()=>innerHeight)+1,label+' reachable without overlay');}
 try{
 await page.goto('http://localhost:3000');await page.locator('#screen-menu').waitFor({state:'visible'});
 ok(await page.title()==='СПЛ — обучение дилеров','SPL metadata');ok(await page.locator('.spl-brand-logo').evaluate(i=>i.complete&&i.naturalWidth>0),'Original logo loaded');
 for(const [width,height] of [[360,640],[390,844],[1280,900]]){
 await page.setViewportSize({width,height});
 for(const mode of ['choice','input']){
 await page.evaluate(mode=>__arena.fixture([1000,800,1000],mode),mode);await page.waitForTimeout(300);await noOverflow(mode+' '+width);
 ok(await page.locator('.table-seat').count()===3,'three player amounts retained');
 if(mode==='choice'){
 ok(await page.locator('.pot-choice').count()===4,'four choices');await reachable('#answer-choices','choices '+width);
 await page.evaluate(()=>{document.getElementById('answer-input').value='2400';__arena.checkAnswer();});ok((await page.evaluate(()=>__arena.state())).currentPotIndex===1,'automatic next bank preserved');ok(await page.locator('.pot-choice').first().isVisible(),'next bank answer controls');
 await page.evaluate(()=>{document.getElementById('answer-input').value='400';__arena.checkAnswer();});ok(!await page.locator('#answer-choices').isVisible(),'used choices replaced');await reachable('#btn-next','next '+width);ok(await page.locator('#feedback').isVisible(),'result stays visible');await page.locator('.spl-pot-details summary').click();ok(await page.locator('#pot-review .pot-layer').count()===2,'both banks in optional review');await noOverflow('review '+width);
 }else{await reachable('#btn-check','manual confirm '+width);ok(await page.locator('#pot-keypad button').count()===12,'numeric keypad retained');ok(await page.locator('#pot-keypad button').first().evaluate(e=>e.getBoundingClientRect().height>=44),'keypad minimum 44px target');}
 }
 await page.evaluate(()=>__arena.fixture([10000,20000,30000,40000,50000,60000,70000,80000,90000,90000]));ok(await page.locator('.table-seat').count()===10,'maximum ten players');await noOverflow('ten players '+width);const seats=await page.locator('.table-seat').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));ok(seats.every((a,i)=>seats.every((b,j)=>i===j||a.x+a.w<=b.x+1||b.x+b.w<=a.x+1||a.y+a.h<=b.y+1||b.y+b.h<=a.y+1)),'ten seats do not overlap');
 await page.evaluate(()=>{__arena.fixture([1000,800,1000],'choice',true);__arena.late();__arena.onTimeout();});ok((await page.evaluate(()=>__arena.state())).lives===1,'timeout loses one life');ok(await page.locator('#feedback').isVisible(),'timeout feedback');await reachable('#btn-next','timeout next '+width);
 await page.evaluate(()=>{__arena.nextQuestion();document.getElementById('answer-input').value='1';__arena.checkAnswer();});ok((await page.evaluate(()=>__arena.state())).gameOver,'second error ends session');await reachable('#btn-over-menu','session result '+width);
 await page.evaluate(()=>{__arena.goToMenu();__arena.startWinnerGame();});await page.waitForFunction(()=>!__arena.winner().dealing);await page.evaluate(()=>__arena.stopWinnerTimer());await noOverflow('winner '+width);ok(await page.locator('#winner-board img').count()===5,'five board cards');
 await page.evaluate(()=>__arena.tie());await page.waitForFunction(()=>!__arena.winner().dealing);await page.locator('[data-player-index="0"]').click();ok(!await page.evaluate(()=>__arena.winner().answered),'split pot awaits all winners');await page.locator('[data-player-index="1"]').click();ok(await page.evaluate(()=>__arena.winner().answered),'split pot accepted');await reachable('#btn-winner-next','winner next '+width);await page.locator('.spl-winner-review summary').click();ok(await page.locator('.winner-best-five img').count()===10,'both winning hands retained');
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__arena.fixture([1000,800,1000],'input'));await page.locator('#answer-input').focus();await page.evaluate(()=>{window.__keyboardHeight=400;Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>window.__keyboardHeight});window.visualViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);ok(await page.locator('body').evaluate(e=>e.classList.contains('spl-keyboard-open')),'simulated keyboard reduces layout');ok(!await page.locator('#pot-keypad').isVisible(),'duplicate keypad hidden only during OS keyboard simulation');await reachable('#btn-check','keyboard simulation confirm');ok(await page.locator('.table-seat').count()===3,'keyboard simulation retains all contributions');await page.screenshot({path:dir+'/keyboard-simulation.png',fullPage:true});await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
 // Increased system text approximation: no scroll lock, answer remains reachable.
 await page.addStyleTag({content:'.screen{font-size:20px}.arena-answer-area .question{font-size:27px}.table-seat strong{font-size:23px}'});await noOverflow('large text');await reachable('#btn-check','large text confirm');
 ok(errors.length===0,'no browser runtime errors');fs.writeFileSync('/data/spl-redesign-implementation/layout-checks.json',JSON.stringify(checks,null,2));console.log('SPL redesign:',checks.length,'checks passed. Keyboard is simulated, not a physical-device test.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
