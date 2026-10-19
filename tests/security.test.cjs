const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {validateInitData,signSession,readSession}=require('../server/security.cjs');
function init(overrides={}){const p=new URLSearchParams({auth_date:'2000000000',user:JSON.stringify({id:123,first_name:'Test'}),...overrides});const key=crypto.createHmac('sha256','WebAppData').update('test-token').digest();const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');p.set('hash',crypto.createHmac('sha256',key).update(data).digest('hex'));return p.toString();}
test('valid Telegram payload',()=>assert.equal(validateInitData(init(),'test-token',2000000000).id,123));
test('tampered user rejected',()=>assert.throws(()=>validateInitData(init().replace('Test','Fake'),'test-token',2000000000)));
test('wrong bot rejected',()=>assert.throws(()=>validateInitData(init(),'wrong-token',2000000000)));
test('old payload rejected',()=>assert.throws(()=>validateInitData(init(),'test-token',2000003601)));
test('future payload rejected',()=>assert.throws(()=>validateInitData(init(),'test-token',1999999969)));
test('duplicate keys rejected',()=>assert.throws(()=>validateInitData(init()+'&auth_date=2000000000','test-token',2000000000)));
test('missing user rejected',()=>assert.throws(()=>validateInitData(init({user:'null'}),'test-token',2000000000)));
test('non-numeric id rejected',()=>assert.throws(()=>validateInitData(init({user:'{"id":"123"}'}),'test-token',2000000000)));
test('session round trip',()=>assert.equal(readSession(signSession(123,'secret',100),'secret',101),'123'));
test('expired session rejected',()=>assert.throws(()=>readSession(signSession(123,'secret',100),'secret',43300)));
test('tampered session rejected',()=>assert.throws(()=>readSession(signSession(123,'secret',100)+'x','secret',101)));
test('different session secret rejected',()=>assert.throws(()=>readSession(signSession(123,'secret',100),'other',101)));
test('no session rejected',()=>assert.throws(()=>readSession(undefined,'secret',101)));
