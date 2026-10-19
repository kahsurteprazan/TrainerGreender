const {test}=require('node:test'),assert=require('node:assert/strict');const c=require('../server/core.cjs'),handler=require('../api/learning');
Object.assign(process.env,{BOT_TOKEN:'test-token',BOT_USERNAME:'test_bot',OWNER_TELEGRAM_ID:'1',APP_URL:'https://test.example',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'test-key',SESSION_SECRET:'s'.repeat(40),TELEGRAM_WEBHOOK_SECRET:'w'.repeat(40)});
function res(){return{setHeader(){},end(s){this.value=JSON.parse(s);}};}
const uuid='11111111-1111-4111-8111-111111111111';
test('learning API validates inputs and always uses authenticated actor',async()=>{
 const old={actor:c.actor,db:c.db};let id=4,calls=[];c.actor=async()=>({telegram_id:id});c.db=async(path,o)=>{calls.push({path,body:o.body});return{sections:[],progress:[],attempts:[],grants:[]};};
 async function call(body,origin='https://test.example'){const r=res();await handler({method:'POST',headers:{origin},body},r);return r;}
 try{
  let r=await call({action:'learnGet',actor:1},'https://evil.example');assert.equal(r.statusCode,403);assert.equal(calls.length,0);
  r=await call({action:'learnGet',actor:1});assert.equal(r.statusCode,200);assert.equal(calls[0].body.p_actor,'4');assert.equal(calls[0].body.p_owner,'1');
  r=await call({action:'learnComplete',lessonId:'bad'});assert.equal(r.statusCode,400);
  r=await call({action:'learnSubmit',attemptId:uuid,answers:{[uuid]:'0'}});assert.equal(r.statusCode,400);
  r=await call({action:'learnEdit',lessonId:uuid,title:'x',theory:'y'});assert.equal(r.statusCode,403);
  id=1;r=await call({action:'learnEdit',lessonId:uuid,title:'x',theory:'y',videoUrl:'javascript:alert(1)'});assert.equal(r.statusCode,400);
  r=await call({action:'learnEdit',lessonId:uuid,title:'x',theory:'y',videoUrl:'https://user:pass@example.com/video'});assert.equal(r.statusCode,400);
  r=await call({action:'learnEdit',lessonId:uuid,title:'x',theory:'y',videoUrl:'https://youtu.be/dQw4w9WgXcQ'});assert.equal(r.statusCode,200);assert.equal(calls.at(-1).body.p_payload.videoUrl,'https://youtu.be/dQw4w9WgXcQ');
 }finally{Object.assign(c,old);}
});
