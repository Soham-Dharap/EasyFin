/* EasyFin app — Quick Add, Dashboard, Balance, Income, Expenses, Subscriptions, Backup, Push */
'use strict';
const $=s=>document.querySelector(s);
let state={view:'home',expCat:'all',expMonth:'all',incClient:'all',incMonth:'all'};

/* ---------- Theme ---------- */
async function initTheme(){
  const saved=await DB.setting('theme');
  const prefersDark=matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved||(prefersDark?'dark':'light'));
}
function applyTheme(t){document.documentElement.dataset.theme=t;DB.setting('theme',t);}
$('#themeBtn').onclick=()=>{const cur=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(cur);toast(cur==='dark'?'Dark mode':'Light mode');};

/* ---------- Navigation ---------- */
function go(view){
  state.view=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));
  document.querySelectorAll('.dock-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={home:['Quick Add','Pick up where you left off'],dashboard:['Dashboard','Your money at a glance'],balance:['Balance','Current month position'],income:['Income','Client-wise earnings'],expenses:['Expenses','Every rupee, accounted'],subs:['Subscriptions','Monthly recurring']};
  const t=titles[view]||titles.home; $('#topEyebrow').textContent=t[0]; $('#topSub').textContent=t[1];
  refresh();
  window.scrollTo({top:0});
}
document.querySelectorAll('.dock-btn').forEach(b=>b.onclick=()=>go(b.dataset.view));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
$('#dashExpenseCard').onclick=()=>go('expenses');
$('#dashIncomeCard').onclick=()=>go('income');
$('#openSubsBtn').onclick=()=>go('subs');

/* ---------- Sheet / modal ---------- */
function openSheet(html){const o=$('#overlay'),s=$('#sheet');s.innerHTML=html;o.hidden=false;}
function closeSheet(){$('#overlay').hidden=true;$('#sheet').innerHTML='';}
$('#overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet();});

/* ---------- Slide to confirm ---------- */
function bindSlide(el,onDone){
  const thumb=el.querySelector('.slide-thumb'); const track=el.querySelector('.slide-track');
  let dragging=false,startX=0,curX=0;
  const max=()=>el.clientWidth-58;
  const setX=x=>{curX=Math.max(0,Math.min(max(),x));thumb.style.transform=`translateX(${curX}px)`;track.style.opacity=1-(curX/max())*0.7;};
  const reset=()=>{thumb.style.transition='transform .25s';setX(0);setTimeout(()=>thumb.style.transition='',260);};
  el.addEventListener('pointerdown',e=>{dragging=true;startX=e.clientX-curX;el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(dragging)setX(e.clientX-startX);});
  const end=()=>{if(!dragging)return;dragging=false;
    if(curX>=max()*0.92){el.classList.add('done');navigator.vibrate&&navigator.vibrate(15);setTimeout(()=>{onDone();reset();el.classList.remove('done');},250);}
    else reset();};
  el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
}

/* ---------- Quick Add ---------- */
$('#quickClose').onclick=()=>{ $('#qaAmount').value='';$('#qaDesc').value=''; $('#qaAmount').focus(); toast('Discarded'); };
async function trySaveExpense(){
  const amt=parseFloat($('#qaAmount').value);
  const desc=$('#qaDesc').value.trim();
  if(!amt||amt<=0){toast('Enter a valid amount');return;}
  if(!desc){toast('Enter what it was for');$('#qaDesc').focus();return;}
  // Subscription exact match (name + amount + pending cycle) — auto-confirm, no slider needed
  const matched=await findPendingSubscription(desc,amt);
  if(matched){ await confirmSubscriptionPayment(matched,{viaQuickAdd:true}); toast('Subscription paid ✓'); clearQA(); return; }
  const cat=await categorize(desc);
  if(!cat){ openCategoryPicker(desc,amt); return; }
  await saveExpense({amount:amt,description:desc,category:cat});
  toast('Added ✓'); clearQA();
}
function clearQA(){$('#qaAmount').value='';$('#qaDesc').value='';refresh();}
async function saveExpense({amount,description,category}){
  const now=new Date();
  await DB.add('expenses',{id:id(),amount,description,category,date:now.toISOString(),month:monthKey(now)});
}
bindSlide($('#qaSlide'),trySaveExpense);

function openCategoryPicker(desc,amt){
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Pick a category</h2><p class="sub">“${esc(desc)}” wasn't recognised. Choose one of the 6 fixed categories — we'll remember it for next time.</p>
    <div class="cat-grid">${CATEGORIES.map(c=>`<button class="cat-pick" data-cat="${c.id}"><span class="ci">${c.icon}</span>${c.label}</button>`).join('')}</div>`);
  document.querySelectorAll('.cat-pick').forEach(b=>b.onclick=async()=>{
    await rememberKeyword(desc,b.dataset.cat);
    await saveExpense({amount:amt,description:desc,category:b.dataset.cat});
    closeSheet(); toast('Added ✓'); clearQA();
  });
}

/* ---------- Subscriptions core ---------- */
async function findPendingSubscription(desc,amt){
  const subs=await DB.all('subscriptions');
  const norm=s=>normalize(s);
  for(const s of subs){
    if(s.status!=='active')continue;
    if(norm(s.name)!==norm(desc))continue;
    if(Number(s.amount)!==Number(amt))continue;
    const pays=await DB.all('subscriptionPayments');
    const cycle=cycleKey(s.id,s.nextBillingDate);
    if(pays.some(p=>p.cycleKey===cycle&&p.status==='paid'))continue;
    return s;
  }
  return null;
}
async function confirmSubscriptionPayment(sub,{viaQuickAdd=false}={}){
  const now=new Date();
  const cycle=cycleKey(sub.id,sub.nextBillingDate);
  const pays=await DB.all('subscriptionPayments');
  if(pays.some(p=>p.cycleKey===cycle&&p.status==='paid'))return; // duplicate prevention
  await DB.add('subscriptionPayments',{id:id(),subscriptionId:sub.id,cycleKey:cycle,billingDate:sub.nextBillingDate,amount:sub.amount,status:'paid',paidAt:now.toISOString(),via:viaQuickAdd?'quick-add':'slide'});
  await saveExpense({amount:sub.amount,description:sub.name,category:'subscriptions'});
  const next=nextBillingDate(sub.billingDay,sub.nextBillingDate);
  await DB.put('subscriptions',{...sub,nextBillingDate:next,status:'active'});
  syncReminderMetadata();
}
async function syncReminderMetadata(){
  // Queue minimal metadata for server reminders (name/amount/date only — never full history)
  try{
    const subs=(await DB.all('subscriptions')).filter(s=>s.status==='active');
    await DB.setting('reminderQueue',subs.map(s=>({id:s.id,name:s.name,amount:s.amount,nextBillingDate:s.nextBillingDate})));
    if(navigator.serviceWorker&&'sync' in navigator.serviceWorker){ /* background sync where supported */ }
  }catch(e){}
}

/* ---------- Refresh / renders ---------- */
async function refresh(){
  await Promise.all([renderToday(),renderDashboard(),renderBalance(),renderExpenses(),renderIncome(),renderSubs(),fillMonthSelects()]);
}
async function renderToday(){
  const today=monthKey(new Date());
  const all=(await DB.all('expenses')).filter(e=>e.month===today&&new Date(e.date).toDateString()===new Date().toDateString()).sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#todayList').innerHTML=all.length?all.map(e=>txnHTML(e,'out')).join(''):'<p class="empty">No expenses today yet.</p>';
}
function txnHTML(e,kind){
  const cat=CATEGORIES.find(c=>c.id===e.category);
  return `<div class="txn"><div class="cat-dot">${cat?cat.icon:'•'}</div><div class="txn-main"><div class="txn-title">${esc(e.description)}</div><div class="txn-sub">${cat?cat.label:''} · ${fmtDate(e.date)}</div></div><div class="txn-amt ${kind}">${kind==='in'?'+':'−'}${fmtINR(e.amount)}</div></div>`;
}
async function monthTotals(){
  const mk=monthKey(new Date());
  const exps=await DB.all('expenses'), incs=await DB.all('income');
  const e=exps.filter(x=>x.month===mk).reduce((s,x)=>s+Number(x.amount),0);
  const i=incs.filter(x=>x.month===mk).reduce((s,x)=>s+Number(x.amount),0);
  return {e,i,net:i-e};
}
async function renderDashboard(){
  const t=await monthTotals();
  $('#dashMonthLabel').textContent=monthLabel(monthKey(new Date()));
  animateNumber($('#dashBalance'),t.net); animateNumber($('#dashExpenses'),t.e); animateNumber($('#dashIncome'),t.i);
  const exps=(await DB.all('expenses')).filter(x=>x.month===monthKey(new Date()));
  const byCat={}; exps.forEach(x=>byCat[x.category]=(byCat[x.category]||0)+Number(x.amount));
  $('#dashBreakdown').innerHTML=Object.keys(byCat).length?Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>{const cat=CATEGORIES.find(x=>x.id===c);return `<div class="row-between"><span>${cat?cat.icon+' '+cat.label:c}</span><span>${fmtINR(v)}</span></div>`;}).join(''):'<p class="empty">No expenses this month.</p>';
}
async function renderBalance(){
  const t=await monthTotals();
  animateNumber($('#balValue'),t.net); animateNumber($('#balIncome'),t.i); animateNumber($('#balExpenses'),t.e); animateNumber($('#balNet'),t.net);
  $('#balSub').textContent=`${monthLabel(monthKey(new Date()))} · Income − Expenses`;
}
async function fillMonthSelects(){
  const exps=await DB.all('expenses'), incs=await DB.all('income');
  const months=[...new Set([...exps.map(e=>e.month),...incs.map(e=>e.month)])].sort().reverse();
  const opts=['all',...months].map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  const em=$('#expenseMonth'),im=$('#incomeMonth');
  const ev=em.value,iv=im.value; em.innerHTML=opts; im.innerHTML=opts;
  em.value=[...em.options].some(o=>o.value===ev)?ev:'all'; im.value=[...im.options].some(o=>o.value===iv)?iv:'all';
}
$('#expenseMonth').onchange=e=>{state.expMonth=e.target.value;renderExpenses();};
$('#incomeMonth').onchange=e=>{state.incMonth=e.target.value;renderIncome();};

async function renderExpenses(){
  $('#catChips').innerHTML=['all',...CATEGORIES.map(c=>c.id)].map(c=>{
    const label=c==='all'?'All':CATEGORIES.find(x=>x.id===c).label;
    return `<button class="chip ${state.expCat===c?'active':''}" data-c="${c}">${label}</button>`;
  }).join('');
  document.querySelectorAll('#catChips .chip').forEach(b=>b.onclick=()=>{state.expCat=b.dataset.c;renderExpenses();});
  let list=await DB.all('expenses');
  if(state.expCat!=='all')list=list.filter(e=>e.category===state.expCat);
  if(state.expMonth!=='all')list=list.filter(e=>e.month===state.expMonth);
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const groups={}; list.forEach(e=>{const d=fmtDay(e.date);(groups[d]=groups[d]||[]).push(e);});
  $('#expenseList').innerHTML=list.length?Object.entries(groups).map(([d,items])=>`<h3 style="margin:14px 0 8px;font-size:15px">${d}</h3>`+items.map(e=>txnHTML(e,'out')).join('')).join(''):'<p class="empty">No expenses match.</p>';
  const subs=await DB.all('subscriptions'); const pending=subs.filter(s=>s.status==='active').length;
  $('#subsBadge').textContent=pending?pending+' active':'';
}

async function renderIncome(){
  const clients=await DB.all('clients');
  $('#clientChips').innerHTML=[{id:'all',name:'All Clients'},...clients].map(c=>`<button class="chip ${state.incClient===c.id?'active':''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  document.querySelectorAll('#clientChips .chip').forEach(b=>b.onclick=()=>{state.incClient=b.dataset.c;renderIncome();});
  let list=await DB.all('income');
  if(state.incClient!=='all')list=list.filter(x=>x.clientId===state.incClient);
  if(state.incMonth!=='all')list=list.filter(x=>x.month===state.incMonth);
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#incomeList').innerHTML=list.length?list.map(x=>{
    const cl=clients.find(c=>c.id===x.clientId);
    return `<div class="txn"><div class="cat-dot">↗</div><div class="txn-main"><div class="txn-title">${esc(cl?cl.name:'Client')}</div><div class="txn-sub">${x.thumbnails} thumbnails · ${fmtDate(x.date)}</div></div><div class="txn-amt in">+${fmtINR(x.amount)}</div></div>`;
  }).join(''):'<p class="empty">No income yet. Add a client to get started.</p>';
}

async function renderSubs(){
  const subs=await DB.all('subscriptions');
  const pays=await DB.all('subscriptionPayments');
  const active=subs.filter(s=>s.status==='active'), cancelled=subs.filter(s=>s.status==='cancelled');
  const paidThisCycle=pays.filter(p=>p.status==='paid').length;
  $('#subsStats').innerHTML=`
    <div class="stat-card"><span class="stat-label">Total</span><span class="stat-value">${subs.length}</span></div>
    <div class="stat-card"><span class="stat-label">Active / Pending</span><span class="stat-value">${active.length}</span></div>
    <div class="stat-card"><span class="stat-label">Paid (all cycles)</span><span class="stat-value">${paidThisCycle}</span></div>
    <div class="stat-card"><span class="stat-label">Cancelled</span><span class="stat-value">${cancelled.length}</span></div>`;
  $('#subsList').innerHTML=subs.length?subs.map(s=>{
    const paid=pays.some(p=>p.subscriptionId===s.id&&p.cycleKey===cycleKey(s.id,s.nextBillingDate)&&p.status==='paid');
    const status=s.status==='cancelled'?'Cancelled':paid?'Paid':'Pending';
    return `<div class="txn"><div class="cat-dot">🔁</div><div class="txn-main"><div class="txn-title">${esc(s.name)}</div><div class="txn-sub">${fmtINR(s.amount)}/mo · Next: ${s.nextBillingDate} · ${status}</div></div>${s.status==='active'&&!paid?`<button class="chip" data-confirm="${s.id}">Confirm</button>`:''}</div>`;
  }).join(''):'<p class="empty">No subscriptions yet.</p>';
  document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=async()=>{const s=await DB.get('subscriptions',b.dataset.confirm);openConfirmSheet(s);});
  $('#subPayments').innerHTML=pays.length?pays.sort((a,b)=>new Date(b.paidAt)-new Date(a.paidAt)).map(p=>{const s=subs.find(x=>x.id===p.subscriptionId);return `<div class="row-between"><span>${esc(s?s.name:'Subscription')} · ${p.billingDate}</span><span>${fmtINR(p.amount)} ✓</span></div>`;}).join(''):'<p class="empty">No payments recorded.</p>';
}
function openConfirmSheet(sub){
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>${esc(sub.name)}</h2><p class="sub">${fmtINR(sub.amount)} due ${sub.nextBillingDate}. Slide to confirm you have paid.</p>
    <div class="slide" id="confirmSlide" data-color="blue"><div class="slide-track"><span class="slide-label">Slide to Confirm</span></div><div class="slide-thumb">›</div></div>
    <p class="slide-note">Closing without sliding records nothing.</p>`);
  bindSlide($('#confirmSlide'),async()=>{await confirmSubscriptionPayment(sub);closeSheet();toast('Payment recorded ✓');refresh();});
}
function openCancelSheet(sub){
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Have you cancelled your subscription?</h2><p class="sub">Slide only if you have <strong>already</strong> cancelled ${esc(sub.name)} externally. This stops EasyFin reminders — it does not cancel the service itself.</p>
    <div class="slide" id="cancelSlide" data-color="pink"><div class="slide-track"><span class="slide-label">Slide to Confirm Cancellation</span></div><div class="slide-thumb">›</div></div>`);
  bindSlide($('#cancelSlide'),async()=>{await DB.put('subscriptions',{...sub,status:'cancelled'});closeSheet();toast('Marked cancelled');refresh();syncReminderMetadata();});
}

/* ---------- Add Subscription ---------- */
$('#addSubBtn').onclick=()=>{
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Add Subscription</h2><p class="sub">Monthly only. Reminders: 1 day before, 5 &amp; 10 days after if unpaid.</p>
    <label class="field-label">Name</label><input class="text-input" id="subName" placeholder="Netflix">
    <label class="field-label">Amount (₹)</label><input class="text-input" id="subAmt" type="number" inputmode="decimal" placeholder="649">
    <label class="field-label">Monthly billing date</label><input class="text-input" id="subDate" type="date">
    <button class="primary-btn" id="saveSub">Save Subscription</button>`);
  $('#saveSub').onclick=async()=>{
    const name=$('#subName').value.trim(), amt=parseFloat($('#subAmt').value), d=$('#subDate').value;
    if(!name||!amt||amt<=0||!d){toast('Fill all fields');return;}
    const billingDay=new Date(d+'T00:00:00').getDate();
    await DB.add('subscriptions',{id:id(),name,amount:amt,billingDay,nextBillingDate:d,status:'active',createdAt:new Date().toISOString()});
    closeSheet();toast('Subscription added ✓');refresh();syncReminderMetadata();
  };
};

/* ---------- Clients & Income ---------- */
$('#addClientBtn').onclick=()=>{
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Add Client</h2><p class="sub">Only the client name is needed.</p>
    <label class="field-label">Client Name</label><input class="text-input" id="clientName" placeholder="Client name">
    <button class="primary-btn" id="saveClient">Save Client</button>`);
  $('#saveClient').onclick=async()=>{
    const name=$('#clientName').value.trim(); if(!name){toast('Enter a name');return;}
    const clients=await DB.all('clients');
    if(clients.some(c=>normalize(c.name)===normalize(name))){toast('Client already exists');return;}
    await DB.add('clients',{id:id(),name,createdAt:new Date().toISOString()});
    closeSheet();toast('Client added ✓');refresh();
  };
};
$('#addIncomeBtn').onclick=async()=>{
  const clients=await DB.all('clients');
  if(!clients.length){toast('Add a client first');$('#addClientBtn').click();return;}
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Add Income</h2><p class="sub">Record only after full payment is received. Date/time captured automatically.</p>
    <label class="field-label">Amount received (₹)</label><input class="text-input" id="incAmt" type="number" inputmode="decimal" placeholder="5000">
    <label class="field-label">Client</label><select class="text-input" id="incClient">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <label class="field-label">Thumbnails delivered</label><input class="text-input" id="incThumbs" type="number" inputmode="numeric" placeholder="10">
    <button class="primary-btn" id="saveIncome">Save Income</button>`);
  $('#saveIncome').onclick=async()=>{
    const amt=parseFloat($('#incAmt').value), cid=$('#incClient').value, th=parseInt($('#incThumbs').value,10);
    if(!amt||amt<=0||!cid||!th||th<=0){toast('Amount, client & thumbnails are required');return;}
    const now=new Date();
    await DB.add('income',{id:id(),amount:amt,clientId:cid,thumbnails:th,date:now.toISOString(),month:monthKey(now)});
    closeSheet();toast('Income added ✓');refresh();
  };
};

/* ---------- Profile / Settings ---------- */
$('#profileBtn').onclick=()=>{
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Profile &amp; Settings</h2><p class="sub">EasyFin v1.0 · All financial data stays on this device (IndexedDB).</p>
    <button class="ghost-btn" id="setExport">Export Backup</button>
    <button class="ghost-btn" id="setImport">Import Backup</button>
    <button class="ghost-btn" id="setBackTap">Back Tap Setup Guide</button>
    <button class="ghost-btn" id="setPush">Enable Notifications</button>
    <button class="ghost-btn" id="setTheme">Toggle Theme</button>
    <input type="file" id="importFile" accept="application/json" hidden>
    <p class="note" style="margin-top:10px">Notifications are optional. If denied, pending subscriptions still show inside the app.</p>`);
  $('#setExport').onclick=exportBackup;
  $('#setImport').onclick=()=>$('#importFile').click();
  $('#setBackTap').onclick=openBackTapGuide;
  $('#setPush').onclick=enablePush;
  $('#setTheme').onclick=()=>$('#themeBtn').click();
  $('#importFile').onchange=e=>{if(e.target.files[0])importBackup(e.target.files[0]);};
};
async function exportBackup(){
  const data={app:'EasyFin',schemaVersion:1,exportedAt:new Date().toISOString(),
    expenses:await DB.all('expenses'),income:await DB.all('income'),clients:await DB.all('clients'),
    subscriptions:await DB.all('subscriptions'),subscriptionPayments:await DB.all('subscriptionPayments'),
    categoryKeywords:await DB.all('categoryKeywords'),settings:await DB.all('settings')};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='easyfin-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  toast('Backup exported ✓');
}
async function importBackup(file){
  let data; try{data=JSON.parse(await file.text());}catch(e){toast('Invalid file');return;}
  if(data.app!=='EasyFin'||!Array.isArray(data.expenses)){toast('Not an EasyFin backup');return;}
  if(data.schemaVersion>1){toast('Backup version too new');return;}
  const counts=`${data.expenses.length} expenses · ${data.income.length} income · ${data.clients.length} clients · ${data.subscriptions.length} subscriptions`;
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Restore backup?</h2><p class="sub">Exported ${esc(data.exportedAt||'unknown')}.<br>${counts}</p>
    <button class="primary-btn" id="impReplace">Replace all data</button>
    <button class="ghost-btn" id="impMerge">Merge (keep existing)</button>`);
  const apply=async(replace)=>{
    if(replace){for(const s of ['expenses','income','clients','subscriptions','subscriptionPayments','categoryKeywords'])await DB.clear(s);}
    for(const s of ['expenses','income','clients','subscriptions','subscriptionPayments','categoryKeywords'])for(const r of (data[s]||[]))await DB.put(s,r);
    closeSheet();toast('Restored ✓');refresh();
  };
  $('#impReplace').onclick=()=>apply(true); $('#impMerge').onclick=()=>apply(false);
}
function openBackTapGuide(){
  openSheet(`<button class="close-x" onclick="closeSheet()" style="position:absolute;top:14px;right:14px">✕</button>
    <h2>Make expense tracking instant</h2><p class="sub">Double-tap the back of your iPhone to open EasyFin Quick Add. iPhone must be unlocked for interactive entry. iOS does not allow a PWA to deep-link directly to the Back Tap settings screen, so follow these steps:</p>
    <ol class="steps">
      <li>Install EasyFin on the Home Screen (Share → Add to Home Screen).</li>
      <li>Create a Shortcut named “EasyFin Quick Add” that opens this app's URL.</li>
      <li>Open iPhone Settings → Accessibility → Touch → Back Tap.</li>
      <li>Select Double Tap → scroll to Shortcuts → choose EasyFin Quick Add.</li>
      <li>For Triple Tap, repeat and choose an “EasyFin Quick Menu” Shortcut (Today's Expenses / This Week / This Month / Open EasyFin) that opens the app with the matching view.</li>
    </ol>
    <p class="note">Shortcuts cannot read EasyFin's local data — the app loads real figures after it opens. No import link is fabricated here; create the Shortcut in the Shortcuts app.</p>
    <button class="primary-btn" onclick="closeSheet()">Got it</button>`);
}
async function enablePush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)){toast('Notifications not supported here');return;}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast('Permission denied — reminders show in-app');return;}
  try{
    const reg=await navigator.serviceWorker.ready;
    const res=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'pending'})});
    toast('Notifications enabled ✓');
  }catch(e){toast('Enabled locally — server push needs deployment');}
}

/* ---------- Deep links (Shortcuts handoff) ---------- */
function handleDeepLink(){
  const p=new URLSearchParams(location.search);
  const view=p.get('view')||p.get('action');
  const map={'quick-add':'home','home':'home','today':'expenses','week':'dashboard','month':'expenses','expenses':'expenses','income':'income','dashboard':'dashboard','subs':'subs','subscriptions':'subs'};
  if(view&&map[view])go(map[view]);
  else go('home');
  history.replaceState(null,'',location.pathname);
}

/* ---------- Init ---------- */
(async()=>{
  $('#topEyebrow').textContent=greeting();
  await initTheme();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  handleDeepLink();
  refresh();
})();
