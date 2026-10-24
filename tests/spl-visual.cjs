const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});let checks=0;const errors=[];
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

 const dir='/data/spl-redesign-implementation/previews';fs.mkdirSync(dir,{recursive:true});
 try{
 await page.goto('http://localhost:3000');await page.locator('#screen-menu').waitFor({state:'visible'});await page.screenshot({path:dir+'/menu.png',fullPage:true});
 for(const [width,height] of [[360,640],[390,844],[1280,900]]){
 await page.setViewportSize({width,height});
 for(const [name,bets,mode] of [['choices',[1000,800,1000],'choice'],['manual',[1000,800,1000],'input'],['ten',[10000,20000,30000,40000,50000,60000,70000,80000,90000,90000],'choice']]){
 await page.evaluate(({bets,mode})=>__arena.fixture(bets,mode),{bets,mode});await page.waitForTimeout(350);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/'+name+'-'+width+'.png',fullPage:true});
 console.log(name,width,await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,viewport:innerHeight,answerBottom:document.getElementById('btn-check').classList.contains('hidden')?document.getElementById('answer-choices').getBoundingClientRect().bottom:document.getElementById('btn-check').getBoundingClientRect().bottom})));
 if(name==='choices'){
 await page.evaluate(()=>{document.getElementById('answer-input').value='1';__arena.checkAnswer();});await page.screenshot({path:dir+'/wrong-'+width+'.png',fullPage:true});
 await page.evaluate(()=>__arena.fixture([1000,800,1000]));await page.evaluate(()=>{document.getElementById('answer-input').value='2400';__arena.checkAnswer();});await page.screenshot({path:dir+'/next-bank-'+width+'.png',fullPage:true});await page.evaluate(()=>{document.getElementById('answer-input').value='400';__arena.checkAnswer();});await page.screenshot({path:dir+'/correct-'+width+'.png',fullPage:true});
 }
 }
 await page.evaluate(()=>{__arena.goToMenu();__arena.startWinnerGame();});await page.waitForFunction(()=>!__arena.winner().dealing);await page.evaluate(()=>__arena.stopWinnerTimer());await page.screenshot({path:dir+'/winner-'+width+'.png',fullPage:true});await page.evaluate(()=>{const w=__arena.winner();w.winners.forEach(i=>__arena.selectWinner(i,document.querySelector('[data-player-index="'+i+'"]')));});await page.screenshot({path:dir+'/winner-correct-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('No runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
