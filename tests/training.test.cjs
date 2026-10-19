const {test}=require('node:test'),assert=require('node:assert/strict'),{signSession}=require('../server/security.cjs');
Object.assign(process.env,{BOT_TOKEN:'test',BOT_USERNAME:'test_bot',OWNER_TELEGRAM_ID:'1',APP_URL:'https://example.com',SUPABASE_URL:'https://db.example.com',SUPABASE_SERVICE_ROLE_KEY:'test-service',SESSION_SECRET:'s'.repeat(40),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(40)});
const handler=require('../api/training.js');
test('training API validates origin, identity and payload before the database command',async()=>{
 const original=global.fetch;let calls=[],blocked=false;global.fetch=async(url,options)=>{calls.push({url,options});return{ok:true,status:200,text:async()=>JSON.stringify(url.includes('/profiles?')?[{telegram_id:4,blocked}]:{run:{id:'ok'}})};};
 const call=async(body,origin='https://example.com',cookie='greender_session='+signSession('4',process.env.SESSION_SECRET),method='POST')=>{const r={setHeader(){},end(v){this.data=JSON.parse(v);}};await handler({method,headers:{origin,cookie},body},r);return r;};
 try{
 assert.equal((await call({},'https://evil.example')).statusCode,403);assert.equal(calls.length,0);
 assert.equal((await call({},undefined,'')).statusCode,401);
 assert.equal((await call({},undefined,undefined,'GET')).statusCode,405);
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',meta={action:'trainingStart',id,game:'sidepots',difficulty:'easy',answerFormat:'choice',timed:true};
 assert.equal((await call({...meta,timed:'true'})).statusCode,400);assert.equal((await call({...meta,game:'other'})).statusCode,400);
 assert.equal((await call({...meta,id:'bad'})).statusCode,400);assert.equal((await call({action:'trainingGet',userId:'4&secret=eq.true'})).statusCode,400);
 assert.equal((await call({action:'trainingFinish',id,score:-1,correct:0,errors:0,attempts:0,durationMs:1000})).statusCode,400);
 assert.equal((await call(meta)).statusCode,200);const sent=JSON.parse(calls.at(-1).options.body);assert.equal(sent.p_actor,'4');assert.equal(sent.p_owner,'1');assert.equal(sent.p_action,'start');assert(!('userId' in sent.p_payload));
 blocked=true;assert.equal((await call(meta)).statusCode,403);
 }finally{global.fetch=original;}
});
