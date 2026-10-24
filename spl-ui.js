/* Layout-only integration; no API calls, role switching, game state, or storage writes. */
(function(){
 'use strict';
 const viewport=window.visualViewport,root=document.documentElement;
 let lastHeight=0,frame,stableHeight=innerHeight,stableWidth=innerWidth;
 function layout(){
  frame=0;const height=Math.round(viewport?.height||innerHeight);
  if(height!==lastHeight){root.style.setProperty('--spl-vh',height+'px');lastHeight=height;}
  const editable=document.activeElement?.matches('input:not([readonly]),textarea,select');
  if(!editable||Math.abs(innerWidth-stableWidth)>80){stableHeight=innerHeight;stableWidth=innerWidth;}
  const keyboard=!!(editable&&viewport&&Math.max(innerHeight,stableHeight)-height>140);
  document.body.classList.toggle('spl-keyboard-open',keyboard);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
 viewport?.addEventListener('resize',schedule);window.addEventListener('resize',schedule);
 document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
 layout();
 try{window.Telegram?.WebApp?.setHeaderColor?.('#071e17');window.Telegram?.WebApp?.setBackgroundColor?.('#071e17');}catch{}
})();
