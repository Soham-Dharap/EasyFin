// Vercel Cron — subscription reminders (Asia/Kolkata aware).
// Minimal store: expects UPSTASH_REDIS_REST_URL/TOKEN or KV env if configured.
// Without a store, cron is a safe no-op (in-app reminders remain the source of truth).
// Reminder rules per active subscription:
//   -1 day before billing -> "due tomorrow"
//   +5 days after, unpaid  -> reminder
//   +10 days after, unpaid -> "Have you cancelled your subscription?"
// Idempotency: reminderKey = subId|billingDate|stage — skip if already sent.
const TZ = 'Asia/Kolkata';
function todayIST(){ return new Date(new Date().toLocaleString('en-US',{timeZone:TZ})).toISOString().slice(0,10); }
function diffDays(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
async function store(){ const u=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL; const t=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN; return (u&&t)?{u,t}:null; }
async function kv(s,cmd){ const r=await fetch(s.u,{method:'POST',headers:{Authorization:`Bearer ${s.t}`,'Content-Type':'application/json'},body:JSON.stringify(cmd)}); return r.json(); }
export default async function handler(req,res){
  const s=await store();
  if(!s){ return res.status(200).json({ok:true,note:'No reminder store configured — in-app reminders active'}); }
  const today=todayIST();
  const subs=(await kv(s,['SMEMBERS','easyfin:subs'])).result||[];
  let sent=0;
  for(const raw of subs){
    let sub; try{ sub=JSON.parse(raw); }catch{ continue; }
    if(sub.status!=='active') continue;
    const d=diffDays(today,sub.nextBillingDate); // negative = before due
    let stage=null, body=null;
    if(d===1){ stage='due-1'; body=`Your ${sub.name} subscription of ₹${sub.amount} is due tomorrow.`; }
    else if(d===-5){ stage='overdue-5'; body=`Your ${sub.name} subscription of ₹${sub.amount} is still unpaid.`; }
    else if(d===-10){ stage='overdue-10'; body='Have you cancelled your subscription?'; }
    if(!stage) continue;
    const key=`${sub.id}|${sub.nextBillingDate}|${stage}`;
    const seen=await kv(s,['SISMEMBER','easyfin:sent',key]);
    if(seen.result) continue;
    // Push delivery would use web-push with VAPID keys here (server-only env).
    // Mark sent only after successful delivery in production.
    await kv(s,['SADD','easyfin:sent',key]); sent++;
  }
  return res.status(200).json({ok:true,sent});
}
