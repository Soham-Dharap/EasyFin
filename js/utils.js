/* Shared helpers — IST-aware dates, money, month keys */
const fmtINR=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
function monthKey(d){const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');}
function monthLabel(key){ if(key==='all')return 'All Time'; const [y,m]=key.split('-'); return new Date(+y,+m-1,1).toLocaleString('en-IN',{month:'long',year:'numeric'}); }
function fmtDate(iso){return new Date(iso).toLocaleString('en-IN',{day:'numeric',month:'long',hour:'numeric',minute:'2-digit'});}
function fmtDay(iso){return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'long'});}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,2600);}
function animateNumber(el,to){
  const from=parseFloat(el.dataset.v||'0'); el.dataset.v=to;
  el.classList.add('blur');
  setTimeout(()=>{ el.textContent=fmtINR(to); el.classList.remove('blur'); },180);
  void from;
}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
/* Next monthly billing date anchored to original day, clamped to month end without drift */
function nextBillingDate(anchorDay,fromDate){
  const d=new Date(fromDate||new Date()); d.setDate(1);
  d.setMonth(d.getMonth()+1);
  const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  d.setDate(Math.min(anchorDay,last));
  return d.toISOString().slice(0,10);
}
function cycleKey(subId,dateStr){return subId+'|'+dateStr;}
function daysBetween(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
