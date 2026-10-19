(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const tg=window.Telegram?.WebApp;
 tg?.ready();tg?.expand();
 let current,loaded=false,loading,busy=false;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const name=id=>current.people.find(p=>String(p.telegram_id)===String(id))?.display_name||String(id);
 const teamName=id=>current.teams.find(t=>t.id===id)?.name||'Команда';
 function message(text){$('platform-message').textContent=text;}
 const spinner='<span class="busy-spinner" aria-hidden="true"></span>';
 let lastRetry;
 function apiError(text,status,uncertain=false){const e=new Error(text);e.status=status;e.uncertain=uncertain;return e;}
 async function api(action,data={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const r=await fetch(action.startsWith('learn')?'/api/learning':'/api/app',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal:controller.signal});
   let value;try{value=await r.json();}catch{throw apiError('Сервер вернул неполный ответ. Попробуйте проверить данные ещё раз.',r.status,true);}
   if(!r.ok)throw apiError(r.status>=500?'Сервер временно недоступен. Попробуйте позже.':value.error||'Не удалось выполнить запрос',r.status,r.status>=500);
   return value;
  }catch(e){
   if(e.name==='AbortError')throw apiError('Сервер не ответил вовремя. Проверьте соединение и попробуйте ещё раз.',0,true);
   if(e instanceof TypeError)throw apiError('Не удалось связаться с сервером. Проверьте интернет-соединение.',0,true);
   throw e;
  }finally{clearTimeout(timer);}
 }
 async function loadTrainer(){
  if(loaded)return;if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');let settled=false;
   const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;script.remove();loading=null;reject(new Error('Не удалось загрузить тренажёры. Повторите вход или проверьте соединение.'));};
   const timer=setTimeout(fail,25000);script.src='/api/trainer';
   script.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);loaded=true;resolve();};script.onerror=fail;document.body.append(script);
  });
  return loading;
 }
 function showPanel(on){$('platform-panel').classList.toggle('hidden',!on);$('app').classList.toggle('hidden',on);}
 async function apply(s,openPanel=false){
  current=s;
  $('platform-bar').classList.remove('hidden');
  $('platform-manage').textContent={owner:'Управление',trainer:'Мои команды',student:'Мой профиль'}[s.role];
  $('platform-identity').textContent=s.user.display_name+' · '+(s.role==='student'&&!s.memberships.length?'Ожидает доступа':{owner:'Владелец',trainer:'Тренер',student:'Ученик'}[s.role]);
  renderPanel();
  if(s.allowed){await loadTrainer();showPanel(openPanel);}
  else showPanel(true);
 }
 let view={screen:'home',tab:'students'};
 const learningUI=window.createLearningUI({api,perform,getCurrent:()=>current,getView:()=>view,setView:v=>{view=v;},renderPanel,showPanel});
 document.addEventListener('click',e=>{if(e.target.closest('#btn-learn')){e.preventDefault();e.stopImmediatePropagation();if(!busy)learningUI.open();}},true);
 const person=id=>current.people.find(p=>String(p.telegram_id)===String(id))||(String(current.user.telegram_id)===String(id)?current.user:null);
 const personName=id=>person(id)?.display_name||'Участник · '+id;
 const button=(label,action,attrs='',kind='secondary')=>'<button type="button" class="btn btn-'+kind+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
 const go=(label,screen,id='',kind='secondary')=>button(escape(label),'navigate','data-screen="'+screen+'" data-id="'+escape(id)+'"',kind);
 const quantity=(n,one,few,many)=>n+' '+(n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many);
 const badge=(label,kind='')=>'<span class="status-badge '+kind+'">'+label+'</span>';
 const empty=(title,text)=>'<div class="empty-state"><strong>'+title+'</strong><p>'+text+'</p></div>';
 const date=v=>v?new Date(v).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Пока нет данных';
 function placeholder(title,text){return '<section class="preview-block"><div class="section-top"><h3>'+title+'</h3>'+badge('Скоро','muted')+'</div><p>'+text+'</p><div class="preview-line"></div><span class="subtle">Данные ещё не собираются</span></section>';}
 function renderPanel(){
  if(learningUI.handles(view.screen)){$('platform-panel').innerHTML=learningUI.render();learningUI.afterRender();return;}
  const s=current,owner=s.role==='owner',manager=owner||s.role==='trainer';
  const club=s.clubs.find(c=>c.id===view.id),team=s.teams.find(t=>t.id===(view.teamId||view.id));
  const member=s.memberships.find(m=>String(m.user_id)===String(view.id));
  if(view.screen==='club'&&!club||view.screen==='team'&&!team||view.screen==='student'&&!member)view={screen:'home',tab:'students'};
  const cards=teams=>teams.map(t=>'<button type="button" class="entity-card" data-action="navigate" data-screen="team" data-id="'+t.id+'"><div class="section-top"><span class="eyebrow">КОМАНДА</span><span aria-hidden="true">↗</span></div><h3>'+escape(t.name)+'</h3><p>Тренер: '+escape(personName(t.trainer_id))+'</p><div class="entity-footer"><span>'+quantity(s.memberships.filter(m=>m.team_id===t.id).length,'ученик','ученика','учеников')+'</span>'+badge(t.enabled?'Открыта':'Приостановлена',t.enabled?'positive':'warning')+'</div></button>').join('');
  const requests=items=>items.length?items.map(r=>'<div class="person-row"><div><strong>'+escape(personName(r.user_id))+'</strong><p>'+escape(teamName(r.team_id))+'</p></div><div class="row-actions">'+button('Принять','decide','data-id="'+r.id+'" data-approve="true"','primary')+button('Отклонить','decide','data-id="'+r.id+'" data-approve="false"')+'</div></div>').join(''):empty('Новых заявок нет','Заявки по ссылке команды появятся здесь.');
  let html='<div class="management-shell"><header class="management-header"><div><span class="eyebrow">GREENDER · '+(owner?'ВЛАДЕЛЕЦ':manager?'ТРЕНЕР':'УЧЕНИК')+'</span><h1>'+(owner?'Управление платформой':manager?'Мои команды':'Мой профиль')+'</h1></div><div class="header-actions">'+(s.allowed?button('К тренажёрам','train','','primary'):'')+button('Обновить данные','refresh')+'</div></header><div id="request-status" role="status" aria-live="polite" aria-atomic="true" class="request-status hidden"></div><div id="panel-message" role="status" aria-live="polite"></div>';
  if(manager){
   html+='<nav class="management-nav" aria-label="Разделы управления">'+[['home',owner?'Клубы':'Команды'],['requests','Заявки'+(s.requests.length?' · '+s.requests.length:'')],...(owner?[['people','Участники'],['learning','Обучение']]:[])].map(([screen,label])=>'<button type="button" class="'+((view.screen===screen||screen==='home'&&['club','team','student','newClub','newTeam'].includes(view.screen))?'active':'')+'" data-action="navigate" data-screen="'+screen+'">'+label+'</button>').join('')+'</nav>';
   if(view.screen==='home'){
    html+='<div class="page-heading"><div><h2>'+(owner?'Ваши клубы':'Ваши команды')+'</h2><p class="subtle">'+(owner?'От клуба — к команде и каждому ученику.':'Ученики, приглашения и доступ — внутри команды.')+'</p></div>'+(owner?go('+ Создать клуб','newClub','','primary'):'')+'</div><div class="entity-grid">';
    html+=owner?s.clubs.map(c=>'<button type="button" class="entity-card" data-action="navigate" data-screen="club" data-id="'+c.id+'"><div class="section-top"><span class="eyebrow">КЛУБ</span><span aria-hidden="true">↗</span></div><h3>'+escape(c.name)+'</h3><p>'+quantity(s.teams.filter(t=>t.club_id===c.id).length,'команда','команды','команд')+' · '+quantity(s.memberships.filter(m=>s.teams.some(t=>t.id===m.team_id&&t.club_id===c.id)).length,'ученик','ученика','учеников')+'</p><div class="entity-footer">'+badge(!c.enabled?'Приостановлен':c.access_until&&new Date(c.access_until)<=new Date()?'Срок истёк':'Доступ открыт',c.enabled&&(!c.access_until||new Date(c.access_until)>new Date())?'positive':'warning')+'</div></button>').join(''):cards(s.teams);
    html+='</div>';if(owner&&!s.clubs.length)html+=empty('Начните с первого клуба','Создайте клуб, затем назначьте тренера и добавьте команду.');
   }else if(view.screen==='club'&&club){
    html+='<div class="breadcrumbs">'+go('← Все клубы','home')+'</div><div class="page-heading"><div><span class="eyebrow">КЛУБ</span><h2>'+escape(club.name)+'</h2></div>'+go('+ Добавить команду','newTeam',club.id,'primary')+'</div><div class="entity-grid">'+cards(s.teams.filter(t=>t.club_id===club.id))+'</div>';
    if(!s.teams.some(t=>t.club_id===club.id))html+=empty('Команд пока нет','Добавьте команду и выберите зарегистрированного тренера.');
    html+='<details class="settings-section"><summary>Настройки доступа клуба</summary><form data-form="clubAccess"><input type="hidden" name="id" value="'+club.id+'"><label class="check-label"><input type="checkbox" name="enabled" '+(club.enabled?'checked':'')+'> Доступ клуба открыт</label><label>Последний оплаченный день (UTC)<input type="date" name="accessUntil" value="'+escape(club.access_until?.slice(0,10)||'')+'"></label><p class="subtle">Без даты — без ограничения срока. Приостановка не удаляет команды.</p><button class="btn btn-secondary">Сохранить настройки</button></form></details>';
   }else if(view.screen==='team'&&team){
    const c=s.clubs.find(c=>c.id===team.club_id),members=s.memberships.filter(m=>m.team_id===team.id),pending=s.requests.filter(r=>r.team_id===team.id);
    html+='<div class="breadcrumbs">'+go('← '+(owner?(c?.name||'Клубы'):'Мои команды'),owner?'club':'home',owner?team.club_id:'')+'</div><div class="page-heading"><div><span class="eyebrow">КОМАНДА</span><h2>'+escape(team.name)+'</h2><p class="subtle">Тренер: '+escape(personName(team.trainer_id))+'</p></div>'+badge(team.enabled?'Доступ открыт':'Приостановлена',team.enabled?'positive':'warning')+'</div>';
    html+='<div class="section-tabs">'+[['students','Ученики · '+members.length],['requests','Заявки · '+pending.length],['invite','Пригласить']].map(([tab,label])=>button(label,'tab','data-tab="'+tab+'"',view.tab===tab?'primary':'secondary')).join('')+'</div>';
    if(view.tab==='requests')html+=requests(pending);
    else if(view.tab==='invite')html+='<section class="surface"><h3>Добавить ученика</h3><p class="subtle">Отправьте ссылку человеку. После запуска бота он подаст заявку — вы сможете её принять.</p><label>Ссылка для учеников<input readonly aria-label="Ссылка для учеников" value="https://t.me/'+escape(s.botUsername)+'?start='+team.invite_code+'"></label>'+button('Скопировать ссылку','copyInvite','data-id="'+team.id+'"','primary')+'</section>';
    else html+=members.length?'<div class="people-list">'+members.map(m=>'<button type="button" class="person-row person-link" data-action="navigate" data-screen="student" data-id="'+m.user_id+'" data-team="'+team.id+'"><span class="avatar">'+escape(personName(m.user_id).slice(0,1))+'</span><span class="person-info"><strong>'+escape(personName(m.user_id))+'</strong><span>'+ (person(m.user_id)?.username?'@'+escape(person(m.user_id).username):'Ученик команды')+'</span></span>'+badge(person(m.user_id)?.blocked?'Заблокирован':m.enabled===false?'Пауза':'Доступ открыт',person(m.user_id)?.blocked||m.enabled===false?'warning':'positive')+'<span aria-hidden="true">›</span></button>').join('')+'</div>':empty('Первый ученик ещё впереди','Откройте «Пригласить» и отправьте ссылку будущим ученикам.');
    if(owner)html+='<details class="settings-section"><summary>Настройки команды</summary>'+button(team.enabled?'Приостановить команду':'Возобновить доступ команды','teamToggle','data-id="'+team.id+'" data-enabled="'+!team.enabled+'"')+'<p class="subtle">Состав команды сохраняется.</p></details>';
   }else if(view.screen==='student'&&member){
    const p=person(member.user_id),t=s.teams.find(t=>t.id===member.team_id);
    html+='<div class="breadcrumbs">'+go('← '+(t?.name||'Команда'),'team',member.team_id)+'</div><section class="student-heading"><span class="avatar large">'+escape(personName(member.user_id).slice(0,1))+'</span><div><span class="eyebrow">КАРТОЧКА УЧЕНИКА</span><h2>'+escape(personName(member.user_id))+'</h2><p class="subtle">'+escape(t?.name)+' · '+escape(p?.username?'@'+p.username:'Telegram-профиль')+'</p></div></section>';
    html+='<div class="facts-row"><div><span>Доступ</span><strong>'+ (p?.blocked?'Аккаунт заблокирован':member.enabled===false?'Приостановлен':'Открыт')+'</strong></div><div><span>В команде с</span><strong>'+date(member.joined_at)+'</strong></div><div><span>Последний вход / сообщение</span><strong>'+date(p?.last_seen_at)+'</strong></div></div>';
    html+='<div class="section-tabs">'+[['learning','Обучение'],['training','Тренажёры'],['access','Доступ']].map(([tab,label])=>button(label,'tab','data-tab="'+tab+'"',view.tab===tab?'primary':'secondary')).join('')+'</div>';
    if(view.tab==='access')html+='<section class="surface"><h3>Управление доступом</h3><p class="subtle">Приостановка оставляет ученика в команде. Удаление из команды сохраняет аккаунт и историю; для возвращения потребуется новая заявка.</p>'+button(member.enabled===false?'Возобновить доступ':'Приостановить доступ','member','data-id="'+member.user_id+'" data-team="'+member.team_id+'" data-operation="'+(member.enabled===false?'resume':'pause')+'"','primary')+button('Убрать из команды','confirm','data-kind="remove" data-id="'+member.user_id+'" data-team="'+member.team_id+'"','danger')+(owner?button(p?.blocked?'Разблокировать аккаунт':'Заблокировать аккаунт','confirm','data-kind="block" data-id="'+member.user_id+'" data-blocked="'+!p?.blocked+'"'):'')+'</section>';
    else if(view.tab==='training')html+='<div class="preview-notice">Макет статистики. Результаты тренировок пока не записываются.</div><div class="preview-grid">'+placeholder('Сайд-поты','Здесь появятся лучший счёт, сложность и история попыток.')+placeholder('Победитель','Здесь будут правильные ответы, рекорд и результаты режима на время.')+'</div>';
    else html+=learningUI.renderStudent(member.user_id)+placeholder('Экзамен','Условия допуска и итоговая проверка — следующий этап.');
   }else if(view.screen==='requests')html+='<div class="page-heading"><h2>Заявки на вступление</h2></div>'+requests(s.requests);
   else if(view.screen==='people')html+='<div class="page-heading"><div><h2>Пользователи</h2><p class="subtle">Все зарегистрированные аккаунты. Состав учеников — внутри команд.</p></div>'+go('Пригласить тренера','inviteTrainer','','primary')+'</div><label class="search-label">Найти человека<input id="people-search" type="search" placeholder="Имя, @username или Telegram ID"></label><div class="people-list">'+s.people.map(p=>'<div class="person-row searchable" data-search="'+escape((p.display_name+' '+(p.username||'')+' '+p.telegram_id).toLowerCase())+'"><div class="person-info"><strong>'+escape(p.display_name)+'</strong><span>'+escape(p.username?'@'+p.username:'ID: '+p.telegram_id)+' · '+(String(p.telegram_id)===String(s.user.telegram_id)?'Владелец':s.teams.some(t=>String(t.trainer_id)===String(p.telegram_id))?'Тренер':s.memberships.some(m=>String(m.user_id)===String(p.telegram_id))?'Ученик':'Без команды')+'</span></div>'+(String(p.telegram_id)!==String(s.user.telegram_id)?button(p.blocked?'Разблокировать':'Заблокировать','confirm','data-kind="block" data-id="'+p.telegram_id+'" data-blocked="'+!p.blocked+'"'):'')+'</div>').join('')+'</div>';
   else if(view.screen==='learning')html+=learningUI.renderManager();
   else if(view.screen==='newClub')html+=go('← К клубам','home')+'<section class="surface form-surface"><h2>Новый клуб</h2><form data-form="club"><label>Название клуба<input name="name" placeholder="Например, Grinder" maxlength="100" required></label><button class="btn btn-primary">Создать клуб</button></form></section>';
   else if(view.screen==='inviteTrainer')html+=go('← Пользователи','people')+'<section class="surface form-surface"><h2>Пригласить будущего тренера</h2><p class="subtle">Человек сначала запускает @'+escape(s.botUsername)+'. После приглашения он открывает «Зарегистрироваться», а вы назначаете его в новую команду.</p><form data-form="trainerInvite"><label>Telegram ID будущего тренера<input name="trainerId" inputmode="numeric" pattern="[1-9][0-9]{0,15}" placeholder="Настоящий числовой ID" required></label><button class="btn btn-primary">Отправить приглашение</button></form></section>';
   else if(view.screen==='newTeam'){
    const members=new Set(s.memberships.map(m=>String(m.user_id))),candidates=s.people.filter(p=>!p.blocked&&String(p.telegram_id)!==String(s.user.telegram_id)&&!members.has(String(p.telegram_id)));
    html+=go('← К клубу','club',view.id)+'<section class="surface form-surface"><h2>Новая команда</h2><form data-form="team"><label>Клуб<select name="clubId" required>'+s.clubs.map(c=>'<option value="'+c.id+'" '+(c.id===view.id?'selected':'')+'>'+escape(c.name)+'</option>').join('')+'</select></label><label>Название команды<input name="name" placeholder="Например, вечерняя группа" maxlength="100" required></label><label>Тренер<select name="trainerId" required><option value="">Выберите тренера</option>'+candidates.map(p=>'<option value="'+p.telegram_id+'">'+escape(p.display_name)+(p.username?' (@'+escape(p.username)+')':'')+' · '+p.telegram_id+'</option>').join('')+'</select></label><button class="btn btn-primary" '+(!candidates.length?'disabled':'')+'>Создать команду и назначить</button></form><p class="subtle">Нет нужного человека? Пригласите его, дождитесь регистрации и обновите данные.</p>'+go('Пригласить тренера','inviteTrainer')+'</section>';
   }
  }else{
   const m=s.memberships[0],t=s.teams[0];
   html+='<section class="surface"><h2>'+escape(t?.name||'Ожидаем доступ')+'</h2><p class="subtle">'+(s.allowed?'Вы в команде. Тренажёры доступны по кнопке сверху.':m?.enabled===false?'Ваш доступ приостановлен тренером.':t?'Доступ команды или клуба приостановлен. Обратитесь к тренеру.':s.requests.some(r=>r.status==='pending')?'Заявка отправлена. Дождитесь решения тренера.':'Для вступления откройте ссылку-приглашение тренера.')+'</p><p class="subtle">Ваш Telegram ID: '+escape(s.user.telegram_id)+'</p>';
   if(!m){const code=new URLSearchParams(location.search).get('invite')||tg?.initDataUnsafe?.start_param;if(code&&/^[a-f0-9]{48}$/.test(code)&&!s.requests.some(r=>r.status==='pending'))html+=button('Подать заявку тренеру','request','data-code="'+escape(code)+'"','primary');for(const r of s.requests)html+='<p>Заявка: '+escape({pending:'ожидает решения',approved:'ранее одобрена; сейчас вы не в команде',rejected:'отклонена'}[r.status])+'</p>';}
   html+='</section>';if(m)html+=learningUI.renderProfile()+placeholder('Мои тренировки','Личный рекорд и история результатов появятся после подключения статистики.');
  }
  $('platform-panel').innerHTML=html+'</div><dialog id="management-confirm"><h2 id="confirm-title"></h2><p id="confirm-description"></p><div class="row-actions">'+button('Отмена','cancelConfirm')+button('Подтвердить','executeConfirm','','danger')+'</div></dialog>';
 }
 function feedback(text,context={},isError=false,retry){
  let host;
  if(context.form)host=[...$('platform-panel').querySelectorAll('form')].find(f=>f.dataset.form===context.form&&(!context.recordId||f.elements.id?.value===context.recordId));
  let el=host?.querySelector('.form-feedback');
  if(host&&!el){el=document.createElement('div');el.className='form-feedback';el.setAttribute('role','status');host.append(el);}
  if(!el)el=$('panel-message');
  if(!el)return message(text);
  el.replaceChildren();const copy=document.createElement('p');copy.textContent=text;el.append(copy);el.classList.toggle('is-error',isError);
  if(retry){const b=document.createElement('button');b.type='button';b.className='btn btn-secondary retry-action';b.dataset.action='retry';b.textContent=retry.label;el.append(b);lastRetry=retry.run;}
  el.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 function captureDrafts(){
  return [...$('platform-panel').querySelectorAll('form')].map(f=>({form:f.dataset.form,id:f.elements.id?.value,fields:[...f.elements].filter(el=>el.name).map(el=>({name:el.name,value:el.value,checked:el.checked}))}));
 }
 function restoreDrafts(drafts){
  for(const d of drafts){const f=[...$('platform-panel').querySelectorAll('form')].find(f=>f.dataset.form===d.form&&(!d.id||f.elements.id?.value===d.id));if(!f)continue;for(const v of d.fields){const el=f.elements[v.name];if(!el)continue;if(el.type==='checkbox')el.checked=v.checked;else el.value=v.value;}}
 }
 const operationLabel={refresh:'Обновляем данные…',state:'Обновляем данные…',request:'Отправляем заявку…',decide:'Сохраняем решение…',teamToggle:'Сохраняем доступ…',member:'Сохраняем доступ…',executeConfirm:'Сохраняем изменения…'};
 async function perform(fn,context={}){
  if(busy)return;busy=true;lastRetry=null;
  const panel=$('platform-panel'),manage=$('platform-manage'),trigger=context.trigger,triggerMarkup=trigger?.innerHTML;
  const previous=[...panel.querySelectorAll('button,input,select,textarea'),manage].map(b=>[b,b.disabled]);previous.forEach(([b])=>b.disabled=true);
  panel.setAttribute('aria-busy','true');
  const label=context.loadingText||operationLabel[trigger?.dataset.action]||'Сохраняем…';
  const buttonLabel=context.buttonText||(trigger===manage||trigger?.dataset.action==='refresh'?'Обновляем…':label);
  if(trigger){trigger.innerHTML=spinner+'<span>'+escape(buttonLabel)+'</span>';trigger.classList.add('is-loading');trigger.setAttribute('aria-busy','true');}
  if($('platform-announcement'))$('platform-announcement').textContent=label;
  const status=$('request-status');if(status){status.innerHTML=spinner+'<span>'+escape(label)+'</span>';status.classList.remove('hidden');}
  const slow=setTimeout(()=>{const el=$('request-status');if(el){el.innerHTML=spinner+'<span>Сервер отвечает дольше обычного. Пожалуйста, подождите…</span>';el.classList.remove('hidden');}},8000);
  try{
   const s=await fn();
   if(s){
    const drafts=context.preserveForms?captureDrafts():[],search=$('people-search')?.value,opened=[...panel.querySelectorAll('details')].map(d=>d.open),scroll=window.scrollY;
    if(s.nextView)view={...s.nextView,tab:'students'};
    await apply(s,context.openPanel!==false);
    if(context.preserveForms){restoreDrafts(drafts);panel.querySelectorAll('details').forEach((d,i)=>d.open=!!opened[i]);if($('people-search')&&search){$('people-search').value=search;$('people-search').dispatchEvent(new Event('input',{bubbles:true}));}window.scrollTo({top:scroll});}
    const text=[s.notice,s.warning,context.successText].filter(Boolean).join(' ');if(text)feedback(text,context);
   }
  }catch(e){
   const mutation=context.mutation;
   const uncertain=mutation&&(e.uncertain||!e.status);
   const text=e.message+(uncertain?' Изменение могло сохраниться. Сначала проверьте состояние, чтобы не отправить его дважды.':'');
   const retry=e.status===401||e.status===403?null:mutation?{label:'Проверить состояние',run:b=>perform(context.reconcile||(()=>api('state')),{trigger:b,preserveForms:true,loadingText:'Проверяем состояние…',successText:'Данные обновлены. Проверьте, сохранилось ли действие, прежде чем отправлять его повторно.'})}:{label:'Повторить',run:b=>perform(fn,{...context,trigger:b})};
   feedback(text,context,true,retry);
  }finally{
   clearTimeout(slow);busy=false;if($('platform-announcement'))$('platform-announcement').textContent='';panel.removeAttribute('aria-busy');$('request-status')?.classList.add('hidden');
   previous.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});
   if(trigger?.isConnected){trigger.innerHTML=triggerMarkup;trigger.classList.remove('is-loading');trigger.removeAttribute('aria-busy');}
  }
 }
 let confirmation;
 $('platform-panel').addEventListener('input',e=>{if(e.target.id==='people-search'){const q=e.target.value.toLowerCase().trim();document.querySelectorAll('.searchable').forEach(el=>el.hidden=!el.dataset.search.includes(q));}});
 $('platform-panel').addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||busy)return;if(learningUI.onClick(b,e))return;const d=b.dataset;
  if(d.action==='retry')return lastRetry?.(b);
  if(d.action==='train'){if(loaded)return showPanel(false);return perform(()=>api('state'),{trigger:b,preserveForms:true,openPanel:false,loadingText:'Загружаем тренажёры…'});}
  if(d.action==='navigate'){view={screen:d.screen,id:d.id,teamId:d.team,tab:d.screen==='student'?'learning':'students'};renderPanel();learningUI.ensureView();window.scrollTo({top:0});return;}
  if(d.action==='tab'){view.tab=d.tab;renderPanel();learningUI.ensureView();return;}
  if(d.action==='copyInvite'){const t=current.teams.find(t=>t.id===d.id),url='https://t.me/'+current.botUsername+'?start='+t.invite_code;return (navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(()=>feedback('Ссылка скопирована')).catch(()=>feedback('Выделите и скопируйте ссылку из поля'));}
  if(d.action==='confirm'){confirmation={...d};$('confirm-title').textContent=d.kind==='remove'?'Убрать ученика из команды?':d.blocked==='true'?'Заблокировать аккаунт?':'Разблокировать аккаунт?';$('confirm-description').textContent=d.kind==='remove'?'Аккаунт и история сохранятся. Для возвращения ученик сможет подать новую заявку.':d.blocked==='true'?'Будет закрыт доступ ко всей платформе. Состав команды сохранится.':'Глобальная блокировка будет снята. Доступ также зависит от команды и клуба.';$('management-confirm').showModal();return;}
  if(d.action==='cancelConfirm')return $('management-confirm').close();
  if(d.action==='executeConfirm'){const x=confirmation;$('management-confirm').close();if(x.kind==='remove'){view={screen:'team',id:x.team,tab:'students'};return perform(()=>api('manageMember',{teamId:x.team,userId:x.id,operation:'remove'}),{trigger:b,mutation:true,loadingText:'Убираем из команды…'});}return perform(()=>api('blockUser',{id:x.id,blocked:x.blocked==='true'}),{trigger:b,mutation:true});}
  perform(()=>{
   if(d.action==='refresh')return api('state');
   if(d.action==='request')return api('request',{code:d.code});
   if(d.action==='decide')return api('decide',{id:d.id,approve:d.approve==='true'});
   if(d.action==='teamToggle')return api('setTeam',{id:d.id,enabled:d.enabled==='true'});
   if(d.action==='member')return api('manageMember',{teamId:d.team,userId:d.id,operation:d.operation});
  },{trigger:b,mutation:d.action!=='refresh',preserveForms:d.action==='refresh'});
 });
 $('platform-panel').addEventListener('submit',e=>{
  e.preventDefault();const f=e.target;if(learningUI.onSubmit(f,e))return;const data=Object.fromEntries(new FormData(f));
  const action={club:'createClub',trainerInvite:'inviteTrainer',team:'createTeam',clubAccess:'setClub'}[f.dataset.form];
  perform(()=>api(action,f.dataset.form==='clubAccess'?{...data,enabled:f.elements.enabled.checked}:data),{form:f.dataset.form,recordId:data.id,trigger:e.submitter||f.querySelector('button'),mutation:true,loadingText:({club:'Создаём клуб…',team:'Создаём команду…',trainerInvite:'Отправляем приглашение…',clubAccess:'Сохраняем настройки…'})[f.dataset.form]});
 });
 $('platform-manage').addEventListener('click',()=>{if(busy)return;view={screen:'home',tab:'students'};renderPanel();showPanel(true);perform(()=>api('state'),{trigger:$('platform-manage'),preserveForms:true,loadingText:'Обновляем данные…'});});
 async function login(){
  if(busy)return;busy=true;const button=$('platform-login'),screen=$('screen-login'),skeleton=$('login-skeleton');
  if($('platform-announcement'))$('platform-announcement').textContent='Проверяем вход через Telegram';
  button.disabled=true;button.innerHTML=spinner+'<span>Проверяем вход…</span>';button.classList.add('is-loading');screen.setAttribute('aria-busy','true');skeleton?.classList.remove('hidden');
  const slow=setTimeout(()=>message('Сервер отвечает дольше обычного. Пожалуйста, подождите…'),8000);
  try{
   if(!tg?.initData)throw new Error('Откройте приложение кнопкой в Telegram-боте. Вход по паролю больше не используется.');
   message('Проверяем Telegram-аккаунт…');const state=await api('login',{initData:tg.initData});
   if(state.allowed&&!loaded){message('Вход подтверждён. Загружаем тренажёры…');button.innerHTML=spinner+'<span>Загружаем приложение…</span>';}
   await apply(state);
  }catch(e){showPanel(false);$('screen-login').classList.remove('hidden');document.querySelectorAll('#app > .screen:not(#screen-login)').forEach(el=>el.classList.add('hidden'));message(e.message);}
  finally{clearTimeout(slow);busy=false;if($('platform-announcement'))$('platform-announcement').textContent='';button.disabled=false;button.innerHTML='Повторить вход';button.classList.remove('is-loading');screen.removeAttribute('aria-busy');skeleton?.classList.add('hidden');}
 }
 $('platform-login').addEventListener('click',login);login();
})();
