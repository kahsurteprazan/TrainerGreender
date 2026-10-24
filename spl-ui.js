/* Telegram shell and layout only; no API calls, role changes or storage writes. */
(function(){
 'use strict';
 const viewport=window.visualViewport,root=document.documentElement,tg=window.Telegram?.WebApp;
 let lastHeight=0,frame,stableHeight=innerHeight,stableWidth=innerWidth;
 function supported(version){try{return !!tg?.isVersionAtLeast?.(version);}catch{return false;}}
 function call(method,...args){try{tg?.[method]?.(...args);}catch{/* Older clients keep their standard shell. */}}
 function insets(){
  for(const [type,values] of [['safe',tg?.safeAreaInset],['content',tg?.contentSafeAreaInset]]){
   for(const edge of ['top','right','bottom','left']){
    const v=values?.[edge],name='--spl-native-'+type+'-'+edge;
    if(Number.isFinite(v)&&v>=0)root.style.setProperty(name,v+'px');else root.style.removeProperty(name);
   }
  }
  root.classList.toggle('spl-telegram-fullscreen',!!tg?.isFullscreen);
 }
 function layout(){
  frame=0;insets();
  const style=getComputedStyle(document.body),height=Math.max(0,Math.round((viewport?.height||innerHeight)-parseFloat(style.paddingTop||0)-parseFloat(style.paddingBottom||0)));
  if(height!==lastHeight){root.style.setProperty('--spl-vh',height+'px');lastHeight=height;}
  const editable=document.activeElement?.matches('input:not([readonly]),textarea,select');
  if(!editable||Math.abs(innerWidth-stableWidth)>80){stableHeight=innerHeight;stableWidth=innerWidth;}
  const keyboard=!!(editable&&viewport&&Math.max(innerHeight,stableHeight)-viewport.height>140);
  document.body.classList.toggle('spl-keyboard-open',keyboard);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
 viewport?.addEventListener('resize',schedule);window.addEventListener('resize',schedule);
 document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
 if(tg?.initData){
  for(const event of ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','fullscreenFailed','viewportChanged','activated'])call('onEvent',event,schedule);
  call('setHeaderColor','#071e17');call('setBackgroundColor','#071e17');
  if(supported('7.10'))call('setBottomBarColor','#071e17');
  // Native fullscreen provides the transparent Telegram header; never imitate or hide its controls.
  if(supported('8.0')&&!tg.isFullscreen)call('requestFullscreen');
 }
 layout();
})();
