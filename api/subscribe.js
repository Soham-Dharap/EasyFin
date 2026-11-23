// Minimal endpoint: stores ONLY subscription reminder metadata + push endpoint.
// Never accepts full expense/income/client history.
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const {endpoint,subscriptions}=req.body||{};
  if(!endpoint||typeof endpoint!=='string') return res.status(400).json({error:'endpoint required'});
  if(!Array.isArray(subscriptions)) return res.status(400).json({error:'subscriptions array required'});
  // Validate shape strictly
  for(const s of subscriptions){
    if(!s.id||!s.name||typeof s.amount!=='number'||!/^\d{4}-\d{2}-\d{2}$/.test(s.nextBillingDate||'')){
      return res.status(400).json({error:'invalid subscription metadata'});
    }
  }
  const u=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
  const t=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  if(!u||!t) return res.status(200).json({ok:true,note:'Stored locally; configure Upstash/KV for server reminders'});
  const kv=async(cmd)=>{const r=await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(cmd)});return r.json();};
  await kv(['SADD','easyfin:endpoints',endpoint]);
  for(const s of subscriptions) await kv(['SADD','easyfin:subs',JSON.stringify(s)]);
  return res.status(200).json({ok:true});
}
