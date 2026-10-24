const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||require('node:child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox']});
 const out=process.env.SPL_TELEGRAM_PREVIEW_DIR||path.join('/tmp','spl-telegram-shell');fs.mkdirSync(out,{recursive:true});let checks=0;
 const ok=(v,m)=>{assert(v,m);checks++;};
 try{
 for(const mode of ['modern','old','failed','already','browser','throwing']){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',r=>r.abort());
 await page.addInitScript(mode=>{
  const events={};window.__calls=[];window.__events=events;
  if(mode==='browser')return;
  window.Telegram={WebApp:{initData:'mock',isFullscreen:mode==='already',safeAreaInset:{top:24,bottom:24,left:0,right:0},contentSafeAreaInset:{top:mode==='already'?48:0,bottom:0,left:0,right:0},
   ready(){},expand(){},isVersionAtLeast:()=>mode!=='old',
   onEvent:(e,fn)=>events[e]=fn,setHeaderColor(){if(mode==='throwing')throw Error('unavailable');},setBackgroundColor(){},setBottomBarColor(c){__calls.push('bottom:'+c);},
   requestFullscreen(){__calls.push('fullscreen');if(mode==='throwing')throw Error('unavailable');if(mode==='failed'){events.fullscreenFailed?.({error:'UNSUPPORTED'});return;}this.isFullscreen=true;this.contentSafeAreaInset.top=48;events.fullscreenChanged?.();events.contentSafeAreaChanged?.();}
  }};
 },mode);
 const state={user:{telegram_id:1,display_name:'Назар'},role:'owner',allowed:true,teams:[],clubs:[],requests:[],memberships:[],people:[]};
 await page.route('**/api/app',r=>r.fulfill({json:state}));
 await page.route('**/api/trainer',r=>r.fulfill({contentType:'application/javascript',body:'window.GreenderTraining=null;\n'+fs.readFileSync(path.join(__dirname,'../server/trainer-source.txt'),'utf8')}));
 await page.goto('http://127.0.0.1:3000');
 if(mode==='browser')await page.waitForSelector('#platform-login');else await page.waitForSelector('#screen-menu:not(.hidden)',{timeout:6000}).catch(async e=>{console.error('Mode:',mode,'Errors:',errors,'Message:',await page.locator('#platform-message').textContent());throw e;});
 await page.waitForTimeout(100);
 const calls=await page.evaluate(()=>__calls);ok(calls.filter(x=>x==='fullscreen').length===(['modern','failed','throwing'].includes(mode)?1:0),mode+' single supported request');
 const pad=await page.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingTop));ok(pad===(['modern','already'].includes(mode)?72:mode==='browser'?0:24),mode+' safe padding');
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+' no horizontal overflow');
 if(mode!=='browser'){
  const box=await page.locator('#platform-bar').boundingBox();ok(box.y>=pad,mode+' header below safe area');
  await page.locator('#platform-manage').click();ok(await page.locator('#platform-panel').isVisible(),mode+' management remains accessible');
  await page.getByRole('button',{name:'К тренажёрам',exact:true}).click();ok(await page.locator('#screen-menu').isVisible(),mode+' return to menu');
 }
 if(mode==='modern'){
  for(const [width,height] of [[320,640],[390,844],[844,390],[1280,900]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(60);
   ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'responsive '+width);
   await page.screenshot({path:path.join(out,'telegram-'+width+'.png'),fullPage:true});
   if(width===390){
    const css=['style.css','arena.css','spl.css'].map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
    const html=await page.evaluate(css=>{const root=document.documentElement.cloneNode(true);root.querySelectorAll('script,link[rel="stylesheet"]').forEach(e=>e.remove());const s=document.createElement('style');s.textContent=css;root.querySelector('head').append(s);return '<!DOCTYPE html>'+root.outerHTML;},css);
    const logo=fs.readFileSync(path.join(__dirname,'../assets/spl-logo.svg')).toString('base64');fs.writeFileSync(path.join(out,'telegram-390.html'),html.replaceAll('assets/spl-logo.svg','data:image/svg+xml;base64,'+logo));
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#btn-trainer').click();await page.locator('#btn-mode-untimed').click();await page.locator('#btn-easy').click();await page.waitForSelector('#screen-trainer:not(.hidden)');
  ok((await page.locator('.arena-header').boundingBox()).y>=72,'trainer below Telegram controls');
  await page.locator('.pot-choice').first().scrollIntoViewIfNeeded();ok(await page.locator('.pot-choice').first().isVisible(),'trainer answer reachable in fullscreen');
  await page.screenshot({path:path.join(out,'telegram-trainer.png'),fullPage:true});
  await page.evaluate(()=>{Telegram.WebApp.safeAreaInset={top:0,bottom:0,left:28,right:28};Telegram.WebApp.contentSafeAreaInset={top:40,bottom:0,left:0,right:0};__events.safeAreaChanged();__events.contentSafeAreaChanged();});await page.waitForTimeout(60);
  ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingLeft)===28),'rotation left inset');
  ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingTop)===40),'rotation top inset replaces old');
  await page.evaluate(()=>{Telegram.WebApp.isFullscreen=false;Telegram.WebApp.safeAreaInset={top:0,bottom:0,left:0,right:0};Telegram.WebApp.contentSafeAreaInset.top=0;__events.fullscreenChanged();});await page.waitForTimeout(60);
  ok(await page.evaluate(()=>!document.documentElement.classList.contains('spl-telegram-fullscreen')&&parseFloat(getComputedStyle(document.body).paddingTop)===0),'exit fullscreen recalculates');
  ok((await page.evaluate(()=>__calls)).filter(x=>x==='fullscreen').length===1,'does not force fullscreen after exit');
 }
 ok(errors.length===0,mode+' no runtime errors');await page.close();
 }
 console.log('Telegram shell:',checks,'checks passed. Native Telegram chrome is mocked, not a physical-device test.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
