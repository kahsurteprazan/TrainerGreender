const {test}=require('node:test'),assert=require('node:assert/strict'),{signSession}=require('../server/security.cjs'),tasks=require('../server/exam-tasks.cjs');
Object.assign(process.env,{BOT_TOKEN:'test',BOT_USERNAME:'test_bot',OWNER_TELEGRAM_ID:'1',APP_URL:'https://example.com',SUPABASE_URL:'https://db.example.com',SUPABASE_SERVICE_ROLE_KEY:'test-service',SESSION_SECRET:'s'.repeat(40),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(40)});
const handler=require('../api/exam.js');
test('exam API checks origin, session, payload and generates private tasks on server',async()=>{
 const original=global.fetch,calls=[];let blocked=false;global.fetch=async(url,options)=>{calls.push({url,options});return{ok:true,status:200,text:async()=>JSON.stringify(url.includes('/profiles?')?[{telegram_id:4,blocked}]:{ok:true})};};
 async function call(body,origin='https://example.com',cookie='greender_session='+signSession('4',process.env.SESSION_SECRET),method='POST'){const r={setHeader(){},end(v){this.data=JSON.parse(v);}};await handler({method,headers:{origin,cookie},body},r);return r;}
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 try{
 assert.equal((await call({},'https://evil.example')).statusCode,403);assert.equal(calls.length,0);assert.equal((await call({},undefined,'')).statusCode,401);assert.equal((await call({},undefined,undefined,'GET')).statusCode,405);
 for(const b of [{action:'other'},{action:'examGrant',userId:'4&x=1',requestId:id},{action:'examStart',attemptId:'bad'},{action:'examAnswer',attemptId:id,index:-1,answer:0},{action:'examAnswer',attemptId:id,index:0,answer:{passed:true}},{action:'examGrade',attemptId:id,index:30,userId:4,passed:'true'}])assert.equal((await call(b)).statusCode,400);
 assert.equal((await call({action:'examStart',attemptId:id,tasks:[{answer:'hacked'}],userId:5})).statusCode,200);const p=JSON.parse(calls.at(-1).options.body);assert.equal(p.p_actor,'4');assert.equal(p.p_owner,'1');assert.equal(p.p_action,'start');assert.equal(p.p_payload.tasks.length,20);assert.equal(p.p_payload.tasks[0].kind,'winner');assert.equal(p.p_payload.tasks[10].kind,'sidepots');assert(!('userId' in p.p_payload));
 blocked=true;assert.equal((await call({action:'examGet'})).statusCode,403);
 }finally{global.fetch=original;}
});
test('exam winner evaluator handles wheel, tie, kickers and category order',()=>{
 const c=(r,s='spades')=>({rank:r,suit:s});assert.deepEqual(tasks.evaluateFiveCards([14,2,3,4,5].map(r=>c(r))),[8,5]);assert.equal(tasks.bestWinnerHand([c(14),c(14,'hearts'),c(14,'clubs'),c(13),c(13,'hearts'),c(2),c(3)]).score[0],6);
 assert(tasks.compareWinnerScores([1,14,13,10,8],[1,14,12,11,9])>0);assert.equal(tasks.compareWinnerScores([4,14],[4,14]),0);assert(tasks.compareWinnerScores([6,2,3],[5,14,13,12,10,8])>0);
});
test('exam task generator creates ten server-keyed deals per trainer without leaking evaluated hands',()=>{
 for(let i=0;i<100;i++){
  const w=tasks.winner(),cards=[...w.board,...w.players.flatMap(p=>p.cards)];assert.equal(new Set(cards.map(c=>c.rank+'_'+c.suit)).size,cards.length);assert(w.answer.length>=1);assert(!JSON.stringify(w.players).includes('score'));
  const values=w.players.map(p=>tasks.bestWinnerHand([...w.board,...p.cards]).score),best=values.reduce((a,b)=>tasks.compareWinnerScores(a,b)>=0?a:b);assert.deepEqual(w.answer,values.flatMap((s,i)=>tasks.compareWinnerScores(s,best)===0?[i]:[]));
  const p=tasks.sidepots();assert.equal(p.answer.length,2);assert.equal(p.answer.reduce((a,b)=>a+b,0),p.bets.reduce((a,b)=>a+b,0));assert(p.bets.length>=4&&p.bets.length<=7);assert.equal(new Set(p.bets).size,2);assert.equal(p.difficulty,'medium');
 }
 assert.deepEqual(tasks.generate().map(t=>t.kind),[...Array(10).fill('winner'),...Array(10).fill('sidepots')]);
});
