(function(){
 'use strict';
 window.createExamUI=function({api,getCurrent,getView,setView,renderPanel,showPanel}){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn=(text,action,attrs='',kind='secondary')=>'<button type="button" class="btn btn-'+kind+'" data-exam="'+action+'" '+attrs+'>'+esc(text)+'</button>';
  const status={active:'Идёт экзамен',oral:'Устная часть',passed:'Сдан',failed:'Не сдан'};
  const reasons={third_error:'Третья ошибка',interrupted:'Попытка прервана',completed:'Все задания завершены',access_changed:'Состав команды изменился'};
  const stamp=v=>v?new Date(v).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
  let own,rows,students=new Map(),initialized,boot,pending=false,notice='',retry,offset=0,networkHold=false,selection=new Set(),shownQuestion,grantRequest,startRequest,lastPoll=0;
  const manager=()=>['owner','trainer'].includes(getCurrent()?.role);
  const live=a=>a&&['active','oral'].includes(a.status);
  const target=()=>getView().id||String(getCurrent().user.telegram_id);
  function cache(data,id){if(data.rows)rows=data.rows;else if(id)students.set(String(id),data);else own=data;if(data.serverNow)offset=Date.parse(data.serverNow)-Date.now();return data;}
  function draw(){renderPanel();}
  async function request(action,payload={},id,quiet=false){
   if(pending)return;pending=true;retry=null;networkHold=false;if(!quiet)notice='Выполняем…';disable(true);
   try{const data=await api(action,payload);cache(data,id);notice='';draw();if(action==='examQuestion')requestAnimationFrame(()=>document.querySelector('.exam-question')?.scrollIntoView({block:'start'}));return data;}
   catch(e){notice=e.message+' Таймер задания не останавливается при потере связи.';networkHold=true;retry=()=>request(manager()?(id?'examGet':'examList'):'examGet',id?{userId:id}:{},id);draw();}
   finally{pending=false;disable(false);}
  }
  function disable(on){document.querySelectorAll('[data-exam],#exam-answer-form button').forEach(b=>{b.disabled=on||b.dataset.invalid==='true';});}
  function init(){const s=getCurrent();if(!s||initialized===String(s.user.telegram_id))return;initialized=String(s.user.telegram_id);own=undefined;rows=undefined;students.clear();
   if(s.role==='student'&&s.allowed&&s.memberships.length){boot=api('examEnter').then(d=>{cache(d);}).catch(e=>{initialized=undefined;notice=e.message;throw e;});boot.catch(()=>{});}else boot=Promise.resolve();
  }
  async function open(){init();setView({screen:manager()?'exams':'examHome'});showPanel(true);draw();
   try{await boot;}catch{notice='Не удалось проверить предыдущую попытку. Повторите открытие экзамена.';draw();return;}
   await request(manager()?'examList':'examGet');
  }
  function title(data){const a=data?.attempt;return data?.grant?'Допуск выдан':a?status[a.status]:data?.readiness?.eligible?'Ожидает допуска':'Нет допуска';}
  function readiness(d){const r=d?.readiness;if(!r)return '';return '<p>Тесты разделов: <strong>'+r.passed+' / '+r.sections+'</strong> · Уроки: '+r.completed+' / '+r.lessons+'</p>'+(!r.configured?'<p class="subtle">Экзамен готовится: нужны 10 опубликованных вопросов и 3 вопроса в разделе «Спорные моменты».</p>':'');}
  function history(d){return '<section class="surface"><h3>Последние попытки</h3>'+(d?.history?.length?'<div class="training-history">'+d.history.map(a=>'<article><strong>'+status[a.status]+'</strong><p>'+esc(reasons[a.reason]||'')+' · Ошибок: '+a.errors+'</p><span class="subtle">'+stamp(a.startedAt)+'</span></article>').join('')+'</div>':'<p class="subtle">Попыток пока нет.</p>')+'</section>';}
  function summary(d,isManager=false){const a=d?.attempt;let html='<section class="surface"><div class="section-top"><h2>'+esc(title(d))+'</h2></div>'+readiness(d);
   if(isManager){
    if(d?.readiness?.eligible&&d.readiness.configured&&!d.grant&&!live(a)&&a?.status!=='passed')html+=btn(a?.status==='failed'?'Допустить повторно':'Дать допуск','grant','data-user="'+d.userId+'"','primary');
    if(d?.grant)html+='<p class="subtle">Одна попытка открыта. Ученик должен начать её очно при тренере.</p>';
    if(live(a))html+='<p>Пройдено: '+Math.min(a.index,30)+' / 30 автоматических заданий · Ошибок: '+a.errors+' (допустимо 2)</p>';
   }else{
    html+='<p class="subtle">Сдайте тесты всех обязательных разделов. После этого тренер вручную откроет одну попытку.</p>';
    if(d?.grant&&!live(a)&&a?.status!=='passed')html+=btn('Ознакомиться и начать','rules','','primary');
   }
   return html+'</section>';}
  function renderStudent(id){const d=students.get(String(id));return '<section class="surface"><div class="section-top"><h3>Экзамен</h3>'+btn('Открыть экзамен ученика','detail','data-user="'+id+'"')+'</div><p class="subtle">'+(d?esc(title(d)):'Допуск, попытки и устная оценка — в карточке экзамена.')+'</p></section>';}
  function card(c){const rank=({11:'J',12:'Q',13:'K',14:'A'})[c.rank]||String(c.rank),src=window.GreenderDeck?.images[rank+'_'+c.suit],suit={clubs:'трефы',diamonds:'бубны',hearts:'червы',spades:'пики'}[c.suit];return '<img class="exam-card" src="'+esc(src||'')+'" alt="'+rank+' '+suit+'">';}
  function question(a,isManager){const q=a.question;if(!q&&isManager)return '<section class="surface"><p>Ученик открывает следующее задание на своём устройстве.</p></section>';if(!q)return '<section class="surface"><h2>Готовы к следующему заданию?</h2><p class="subtle">Следующие 15 секунд начнутся после открытия задания.</p>'+btn(a.index===0?'Открыть первый вопрос':'Следующее задание','question','','primary')+'</section>';
   const key=a.id+':'+a.index;if(key!==shownQuestion){selection.clear();shownQuestion=key;}
   let html='<section class="surface exam-question"><div class="section-top"><span class="eyebrow">'+({theory:'ТЕОРИЯ',winner:'ОПРЕДЕЛИТЬ ПОБЕДИТЕЛЯ',sidepots:'САЙД-ПОТЫ · СРЕДНИЙ',oral:'УСТНАЯ СИТУАЦИЯ'})[q.kind]+' · '+(q.kind==='oral'?a.index-29:a.index%10+1)+' / '+(q.kind==='oral'?3:10)+'</span>'+(a.deadline?'<strong id="exam-timer" class="exam-timer" role="timer" aria-label="Осталось секунд">15</strong>':'<span class="subtle">Без таймера</span>')+'</div><h2>'+esc(q.prompt)+'</h2>';
   if(q.kind==='oral')html+=isManager?'<div class="exam-criteria"><strong>Ориентир из учебного материала — только для тренера</strong><p>'+esc(q.criteria)+'</p></div><p class="subtle">Оцените именно эту ситуацию. «Не сдал» добавит одну ошибку к общему счётчику.</p><div class="row-actions">'+btn('Сдал','grade','data-passed="true"','primary')+btn('Не сдал','grade','data-passed="false"','danger')+'</div>':'<p>Ответьте тренеру устно. Оценку он поставит со своего аккаунта.</p><p class="subtle">Не закрывайте экзамен до итогового результата. Статус обновляется автоматически.</p>';
   else if(isManager)html+='<p class="subtle">Ученик отвечает на своём устройстве. Здесь можно наблюдать за ходом экзамена.</p>';
   else if(q.kind==='theory')html+=(q.cards?.length?'<div class="study-cards">'+q.cards.filter(f=>/^[A-Za-z0-9_]+\.png$/.test(f)).map(f=>'<img src="images/cards/'+f+'" alt="Карта задания">').join('')+'</div>':'')+'<div class="quiz-options">'+q.options.map((v,i)=>btn(v,'theory','data-choice="'+i+'"','secondary')).join('')+'</div>';
   else if(q.kind==='winner')html+='<div class="exam-board">'+q.board.map(card).join('')+'</div><p class="subtle">При делении банка выберите всех победителей, затем подтвердите ответ.</p><div class="exam-players">'+q.players.map((p,i)=>'<button type="button" class="exam-player" data-exam="winner" data-choice="'+i+'" aria-pressed="'+selection.has(i)+'"><strong>'+esc(p.name)+'</strong><span>'+p.cards.map(card).join('')+'</span></button>').join('')+'</div>'+btn('Подтвердить победителей','winnerSubmit','','primary');
   else if(q.kind==='sidepots')html+='<div class="exam-bets">'+q.bets.map((v,i)=>'<div><span>Игрок '+(i+1)+'</span><strong>'+Number(v).toLocaleString('ru-RU')+'</strong></div>').join('')+'</div><form id="exam-answer-form"><div class="exam-pot-inputs">'+Array.from({length:q.bankCount},(_,i)=>'<label>'+(i?'Сайд-пот '+i:'Основной банк')+'<input name="pot'+i+'" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="7" autocomplete="off" required placeholder="Сумма"></label>').join('')+'</div><button class="btn btn-primary" type="submit">Подтвердить расчёт</button></form><p class="subtle">Один неверный расчёт раздачи — одна ошибка, независимо от числа банков.</p>';
   return html+'</section>';
  }
  function render(){const v=getView(),isManager=manager(),isLive=live((isManager?students.get(String(v.id)):own)?.attempt);let html='<div class="management-shell exam-shell'+(isLive?' is-live':'')+'"><header class="management-header"><div><span class="eyebrow">GREENDER · ОЧНЫЙ ЭКЗАМЕН</span><h1>'+(v.screen==='exams'?'Допуск и экзамены':v.screen==='examStudent'?'Экзамен ученика':'Экзамен дилера')+'</h1></div>'+btn('← Назад','exit')+'</header><div id="exam-notice" role="status" aria-live="polite">'+esc(notice)+(retry?btn('Проверить состояние','retry'):'')+'</div>';
   if(v.screen==='exams'){
    html+='<p class="subtle">Допуск только после всех тестов. Экзамен проходит очно перед тренером; одна выдача допуска — одна попытка.</p>'+btn('Обновить список','refresh');
    if(!rows)return html+'<section class="surface"><p>Загружаем список учеников…</p></section></div>';
    const ready=rows.filter(d=>d.readiness.eligible&&!d.grant&&!live(d.attempt)&&d.attempt?.status!=='passed'),other=rows.filter(d=>d.grant||d.attempt);
    const row=d=>'<article class="person-row"><div class="person-info"><strong>'+esc(d.displayName)+'</strong><span>'+esc(d.teamName)+' · '+esc(title(d))+'</span></div>'+btn('Открыть','detail','data-user="'+d.userId+'"')+'</article>';
    return html+'<section class="surface"><h2>Готовы к допуску · '+ready.length+'</h2>'+(ready.length?'<div class="people-list">'+ready.map(row).join('')+'</div>':'<p class="subtle">Новых готовых учеников пока нет. Здесь появятся сдавшие все обязательные тесты.</p>')+'</section><section class="surface"><h2>Допуски и попытки</h2>'+(other.length?'<div class="people-list">'+other.map(row).join('')+'</div>':'<p class="subtle">Выданных допусков и попыток пока нет.</p>')+'</section></div>';
   }
   const d=isManager?students.get(String(v.id)):own;
   if(!d)return html+'<section class="surface"><p>Загружаем данные экзамена…</p>'+btn('Обновить','refresh')+'</section></div>';
   const a=d.attempt;if(isManager)html+='<p class="subtle">Ученик: <strong>'+esc(getCurrent().people.find(p=>String(p.telegram_id)===String(v.id))?.display_name||v.id)+'</strong></p>';
   if(v.screen==='examRules')return html+'<section class="surface"><h2>Перед началом</h2><ul><li>Сдавайте только очно, в присутствии тренера.</li><li>10 вопросов теории, 10 раздач на победителя и 10 расчётов сайд-потов средней сложности.</li><li>На каждое задание — 15 секунд. Истечение времени считается ошибкой.</li><li>Затем 3 устных ситуации без таймера: их оценивает тренер.</li><li>Допустимы две ошибки на весь экзамен. Третья — сразу «Не сдан».</li><li>Выход, закрытие или перезагрузка — «Не сдан». Продолжить прерванную попытку нельзя.</li><li>Связь пропала — время продолжает идти. Новый допуск выдаёт только тренер.</li></ul>'+btn('Тренер рядом. Начать попытку','start','','primary')+'</section></div>';
   if(live(a))html+='<section class="exam-progress"><div><strong>Ошибки: '+a.errors+'</strong><span>Допустимо 2 · третья завершает экзамен</span></div><div><strong>'+Math.min(a.index,33)+' / 33</strong><span>Заданий завершено</span></div></section>'+question(a,isManager)+btn('Прервать экзамен','abort','','danger');
   else html+=summary(d,isManager)+history(d);
   return html+btn('Обновить состояние','refresh')+'</div>';
  }
  async function detail(id){setView({screen:'examStudent',id:String(id)});notice='';draw();await request('examGet',{userId:String(id)},String(id));}
  async function abortAndExit(){const a=own?.attempt;if(live(a)){if(!confirm('Прервать экзамен? Попытка будет отмечена «Не сдан». Новый допуск выдаст тренер.'))return false;const d=await request('examAbort',{attemptId:a.id});if(!d)return false;}return true;}
  function handleClick(b){const d=b.dataset,action=d.exam;if(!action)return false;if(pending)return true;
   if(action==='retry'){retry?.();return true;}
   if(action==='detail'){detail(d.user);return true;}
   if(action==='open'){open();return true;}
   if(action==='refresh'){request(manager()?(getView().screen==='exams'?'examList':'examGet'):'examGet',manager()&&getView().screen!=='exams'?{userId:target()}:{},manager()&&getView().screen!=='exams'?target():undefined);return true;}
   if(action==='exit'){(async()=>{if(!manager()&&!await abortAndExit())return;if(manager()&&getView().screen==='examStudent'){setView({screen:'exams'});draw();request('examList');}else{setView({screen:'home',tab:'students'});renderPanel();showPanel(manager());}})();return true;}
   if(action==='rules'){setView({screen:'examRules'});draw();return true;}
   if(action==='grant'){grantRequest={userId:d.user,requestId:crypto.randomUUID()};request('examGrant',grantRequest,d.user);return true;}
   if(action==='start'){startRequest=startRequest||crypto.randomUUID();request('examStart',{attemptId:startRequest}).then(data=>{if(data){startRequest=null;setView({screen:'examHome'});draw();}});return true;}
   const data=manager()?students.get(String(target())):own,a=data?.attempt;if(!live(a))return true;
   const payload={attemptId:a.id,index:a.index};
   if(action==='question')request('examQuestion',payload);
   if(action==='theory')request('examAnswer',{...payload,answer:Number(d.choice)});
   if(action==='winner'){const i=Number(d.choice);selection.has(i)?selection.delete(i):selection.add(i);b.setAttribute('aria-pressed',String(selection.has(i)));}
   if(action==='winnerSubmit')request('examAnswer',{...payload,answer:[...selection].sort((x,y)=>x-y)});
   if(action==='grade')request('examGrade',{...payload,userId:target(),passed:d.passed==='true'},target());
   if(action==='abort'&&confirm('Завершить попытку как «Не сдан»?'))request('examAbort',{...payload,...(manager()?{userId:target()}:{})},manager()?target():undefined);
   return true;
  }
  function submit(f){if(f.id!=='exam-answer-form')return false;if(pending)return true;const a=own?.attempt;if(!live(a)||!a.question)return true;const answer=Array.from({length:a.question.bankCount},(_,i)=>Number(f.elements['pot'+i].value));request('examAnswer',{attemptId:a.id,index:a.index,answer});return true;}
  document.addEventListener('click',e=>{
   const b=e.target.closest('[data-exam]');if(b){e.preventDefault();e.stopImmediatePropagation();handleClick(b);return;}
   if(e.target.closest('#btn-exam')){e.preventDefault();e.stopImmediatePropagation();open();return;}
   if(e.target.closest('#platform-manage')&&live(own?.attempt)){e.preventDefault();e.stopImmediatePropagation();(async()=>{if(await abortAndExit()){setView({screen:'home',tab:'students'});renderPanel();showPanel(true);}})();}
  },true);
  document.addEventListener('submit',e=>{if(e.target.id==='exam-answer-form'){e.preventDefault();e.stopImmediatePropagation();submit(e.target);}},true);
  window.addEventListener('pagehide',()=>{const a=own?.attempt;if(live(a))fetch('/api/exam',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'examAbort',attemptId:a.id})}).catch(()=>{});});
  setInterval(()=>{
   const v=getView();if(!handles(v.screen))return;const d=manager()?students.get(String(v.id)):own,a=d?.attempt;
   if(!live(a))return;
   if(a.deadline){const left=Math.max(0,Math.ceil((Date.parse(a.deadline)-Date.now()-offset)/1000)),el=document.getElementById('exam-timer');if(el){el.textContent=String(left);el.classList.toggle('is-urgent',left<=5);}if(left===0&&!manager()&&!pending&&!networkHold)request('examAnswer',{attemptId:a.id,index:a.index,answer:null});}
   if((manager()||a.status==='oral')&&Date.now()-lastPoll>3000&&!pending&&!networkHold){lastPoll=Date.now();request('examGet',manager()?{userId:String(v.id)}:{},manager()?String(v.id):undefined,true);}
  },150);
  function handles(screen){return screen==='exams'||screen.startsWith('exam');}
  return{init,open,handles,render,renderStudent};
 };
})();
