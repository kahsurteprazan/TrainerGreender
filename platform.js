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
 async function api(action,data={}) {
  const r=await fetch('/api/app',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
  const value=await r.json();if(!r.ok) throw new Error(value.error||'Ошибка сервера');return value;
 }
 async function loadTrainer(){
  if(loaded)return;if(loading)return loading;
  loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/api/trainer';s.onload=()=>{loaded=true;resolve();};s.onerror=()=>{s.remove();loading=null;reject(new Error('Не удалось загрузить тренажёры. Обновите страницу.'));};document.body.append(s);});
  return loading;
 }
 function showPanel(on){$('platform-panel').classList.toggle('hidden',!on);$('app').classList.toggle('hidden',on);}
 async function apply(s,openPanel=false){
  current=s;
  $('platform-bar').classList.remove('hidden');
  $('platform-identity').textContent=s.user.display_name+' · '+(s.role==='student'&&!s.memberships.length?'Ожидает доступа':{owner:'Владелец',trainer:'Тренер',student:'Ученик'}[s.role]);
  renderPanel();
  if(s.allowed){await loadTrainer();showPanel(openPanel);}
  else showPanel(true);
 }
 function renderPanel(){
  const s=current,owner=s.role==='owner',manager=owner||s.role==='trainer';
  let html='<div class="card"><h1>'+ (owner?'Управление платформой':manager?'Моя команда':'Мой доступ')+'</h1>';
  if(s.allowed)html+='<button class="btn btn-primary" data-action="train">К тренажёрам</button>';
  html+='<button class="btn btn-secondary" data-action="refresh">Обновить данные</button><p id="panel-message" role="status" class="subtitle"></p>';
  if(!s.allowed)html+='<p class="subtitle">'+(s.teams.length?'Доступ команды или клуба приостановлен. Обратитесь к тренеру.':'Для обучения требуется одобрение тренера. Откройте его ссылку-приглашение.')+'</p>';
  if(!manager){
   html+='<p class="subtitle">Ваш Telegram ID: <strong>'+escape(s.user.telegram_id)+'</strong>. Если вас пригласили как тренера, регистрация уже выполнена: сообщите владельцу, чтобы он обновил список и назначил вас.</p>';
   const code=new URLSearchParams(location.search).get('invite')||tg?.initDataUnsafe?.start_param;
   if(code&&/^[a-f0-9]{48}$/.test(code)&&!s.memberships.length&&!s.requests.some(r=>r.status==='pending'))html+='<button class="btn btn-primary" data-action="request" data-code="'+escape(code)+'">Подать заявку тренеру</button>';
   for(const r of s.requests)html+='<p>Заявка: '+escape({pending:'ожидает решения',approved:'одобрена',rejected:'отклонена'}[r.status])+'</p>';
  }
  if(owner){
   html+='<h2>Создать клуб</h2><form data-form="club"><input name="name" placeholder="Название клуба" maxlength="100" required><button class="btn btn-primary">Создать</button></form>';
   html+='<h2>Пригласить будущего тренера</h2><p class="subtitle">1. Человек открывает @'+escape(s.botUsername)+' и нажимает «Запустить». 2. Вы отправляете приглашение на его настоящий Telegram ID. 3. Он нажимает «Зарегистрироваться» в сообщении бота.</p><form data-form="trainerInvite"><label>Telegram ID будущего тренера<input name="trainerId" placeholder="Числовой ID, не @username" inputmode="numeric" pattern="[1-9][0-9]{0,15}" required></label><button class="btn btn-primary">Отправить приглашение</button></form>';
   const members=new Set(s.memberships.map(m=>String(m.user_id)));
   const candidates=s.people.filter(p=>!p.blocked&&String(p.telegram_id)!==String(s.user.telegram_id)&&!members.has(String(p.telegram_id)));
   html+='<h2>Назначить тренера</h2><p class="subtitle">После регистрации человека нажмите «Обновить данные» и выберите его из списка. Случайный ID здесь вводить больше не нужно.</p><form data-form="team"><label>Клуб<select name="clubId" required><option value="">Выберите клуб</option>'+s.clubs.map(c=>'<option value="'+c.id+'">'+escape(c.name)+'</option>').join('')+'</select></label><label>Название команды<input name="name" placeholder="Например, первая группа" maxlength="100" required></label><label>Зарегистрированный тренер<select name="trainerId" required><option value="">'+(candidates.length?'Выберите человека':'Нет подходящих зарегистрированных пользователей')+'</option>'+candidates.map(p=>'<option value="'+escape(p.telegram_id)+'">'+escape(p.display_name)+(p.username?' (@'+escape(p.username)+')':'')+' · '+escape(p.telegram_id)+'</option>').join('')+'</select></label><button class="btn btn-primary" '+(!candidates.length||!s.clubs.length?'disabled':'')+'>Создать команду и назначить</button></form>';
   if(!candidates.length)html+='<p class="subtitle">Пока назначать некого. Владелец, заблокированные пользователи и действующие ученики не включены в этот список.</p>';
   html+='<h2>Доступ клубов</h2>'+s.clubs.map(c=>'<form data-form="clubAccess" class="platform-item"><strong>'+escape(c.name)+'</strong><input type="hidden" name="id" value="'+c.id+'"><label><input type="checkbox" name="enabled" '+(c.enabled?'checked':'')+'> Доступ включён</label><label>Последний оплаченный день (UTC)<input type="date" name="accessUntil" value="'+escape(c.access_until?.slice(0,10)||'')+'"></label><p class="subtitle">Пустая дата — без ограничения срока.</p><button class="btn btn-secondary">Сохранить</button></form>').join('');
  }
  if(manager){
   html+='<h2>Команды и приглашения</h2>'+(s.teams.length?'':'<p class="subtitle">Команд пока нет. После назначения тренера здесь появится карточка команды и ссылка для учеников.</p>')+s.teams.map(t=>'<div class="platform-item"><strong>'+escape(t.name)+'</strong><p>ID тренера: '+escape(t.trainer_id)+'</p><p>'+(t.enabled?'Включена':'Отключена')+'</p><label>Ссылка для учеников<input readonly value="https://t.me/'+escape(s.botUsername)+'?start='+t.invite_code+'"></label>'+(owner?'<button class="btn btn-secondary" data-action="teamToggle" data-id="'+t.id+'" data-enabled="'+!t.enabled+'">'+(t.enabled?'Отключить':'Включить')+'</button>':'')+'</div>').join('');
   html+='<h2>Заявки</h2>'+(s.requests.length?s.requests.map(r=>'<div class="platform-item"><strong>'+escape(name(r.user_id))+'</strong><p>'+escape(teamName(r.team_id))+'</p><button class="btn btn-primary" data-action="decide" data-id="'+r.id+'" data-approve="true">Принять</button><button class="btn btn-secondary" data-action="decide" data-id="'+r.id+'" data-approve="false">Отклонить</button></div>').join(''):'<p>Новых заявок нет.</p>');
   html+='<h2>Ученики</h2>'+(s.memberships.length?s.memberships.map(m=>'<div class="platform-item">'+escape(name(m.user_id))+' · '+escape(teamName(m.team_id))+'</div>').join(''):'<p>Пока нет учеников.</p>');
   html+='<p class="subtitle">Результаты тренировок и учебный прогресс появятся на следующем этапе.</p>';
  }
  if(owner)html+='<h2>Зарегистрированные пользователи</h2>'+s.people.map(p=>'<div class="platform-item"><strong>'+escape(p.display_name)+'</strong><p>ID: '+escape(p.telegram_id)+(p.blocked?' · заблокирован':'')+'</p>'+(String(p.telegram_id)!==String(s.user.telegram_id)?'<button class="btn btn-secondary" data-action="block" data-id="'+escape(p.telegram_id)+'" data-blocked="'+!p.blocked+'">'+(p.blocked?'Разблокировать':'Заблокировать')+'</button>':'')+'</div>').join('');
  $('platform-panel').innerHTML=html+'</div>';
 }
 function feedback(text,context={},isError=false){
  let host;
  if(context.form)host=[...$('platform-panel').querySelectorAll('form')].find(f=>f.dataset.form===context.form&&(!context.recordId||f.elements.id?.value===context.recordId));
  let el=host?.querySelector('.form-feedback');
  if(host&&!el){el=document.createElement('p');el.className='form-feedback';el.setAttribute('role','status');host.append(el);}
  if(!el)el=$('panel-message');
  if(!el)return message(text);
  el.textContent=text;el.classList.toggle('is-error',isError);
  el.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function perform(fn,context={}){
  if(busy)return;busy=true;const panel=$('platform-panel');
  const previous=[...panel.querySelectorAll('button')].map(b=>[b,b.disabled]);previous.forEach(([b])=>b.disabled=true);
  try{
   const s=await fn();
   if(s){await apply(s,true);const text=[s.notice,s.warning].filter(Boolean).join(' ');if(text)feedback(text,context);}
  }catch(e){feedback(e.message,context,true);}
  finally{busy=false;previous.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}
 }
 $('platform-panel').addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const d=b.dataset;
  if(d.action==='train')return showPanel(false);
  perform(()=>{
   if(d.action==='refresh')return api('state');
   if(d.action==='request')return api('request',{code:d.code});
   if(d.action==='decide')return api('decide',{id:d.id,approve:d.approve==='true'});
   if(d.action==='teamToggle')return api('setTeam',{id:d.id,enabled:d.enabled==='true'});
   if(d.action==='block')return api('blockUser',{id:d.id,blocked:d.blocked==='true'});
  });
 });
 $('platform-panel').addEventListener('submit',e=>{
  e.preventDefault();const f=e.target,data=Object.fromEntries(new FormData(f));
  const action={club:'createClub',trainerInvite:'inviteTrainer',team:'createTeam',clubAccess:'setClub'}[f.dataset.form];
  perform(()=>api(action,f.dataset.form==='clubAccess'?{...data,enabled:f.elements.enabled.checked}:data),{form:f.dataset.form,recordId:data.id});
 });
 $('platform-manage').addEventListener('click',()=>perform(()=>api('state')));
 async function login(){
  $('platform-login').disabled=true;
  try{
   if(!tg?.initData)throw new Error('Откройте приложение кнопкой в Telegram-боте. Вход по паролю больше не используется.');
   message('Проверяем Telegram-аккаунт…');await apply(await api('login',{initData:tg.initData}));
  }catch(e){message(e.message);}
  finally{$('platform-login').disabled=false;}
 }
 $('platform-login').addEventListener('click',login);login();
})();
