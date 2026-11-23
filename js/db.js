/* EasyFin IndexedDB layer — local-first, versioned */
const DB_NAME='easyfin', DB_VER=1;
let _db=null;
function openDB(){return new Promise((res,rej)=>{
  if(_db) return res(_db);
  const r=indexedDB.open(DB_NAME,DB_VER);
  r.onupgradeneeded=e=>{
    const db=e.target.result;
    const mk=(n,opts)=>{ if(!db.objectStoreNames.contains(n)) db.createObjectStore(n,opts); };
    mk('expenses',{keyPath:'id'});
    mk('income',{keyPath:'id'});
    mk('clients',{keyPath:'id'});
    mk('subscriptions',{keyPath:'id'});
    mk('subscriptionPayments',{keyPath:'id'});
    mk('categoryKeywords',{keyPath:'keyword'});
    mk('settings',{keyPath:'key'});
    const idx=(s,n,k,u)=>{const st=db.objectStore(s); if(!st.indexNames.contains(n)) st.createIndex(n,k,{unique:!!u});};
    idx('expenses','byDate','date'); idx('expenses','byCategory','category'); idx('expenses','byMonth','month');
    idx('income','byDate','date'); idx('income','byClient','clientId'); idx('income','byMonth','month');
    idx('subscriptions','byStatus','status');
    idx('subscriptionPayments','bySub','subscriptionId'); idx('subscriptionPayments','byCycle','cycleKey');
  };
  r.onsuccess=()=>{_db=r.result;res(_db);};
  r.onerror=()=>rej(r.error);
});}
async function tx(store,mode,fn){const db=await openDB();return new Promise((res,rej)=>{
  const t=db.transaction(store,mode);const s=t.objectStore(store);let out;
  const done=fn(s); if(done&&done.then) done.then(v=>out=v).catch(rej);
  t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error);
});}
const id=()=> (crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const DB={
  async put(store,val){return tx(store,'readwrite',s=>s.put(val));},
  async add(store,val){return tx(store,'readwrite',s=>s.add(val));},
  async get(store,key){const db=await openDB();return new Promise((res,rej)=>{const q=db.transaction(store).objectStore(store).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});},
  async all(store){const db=await openDB();return new Promise((res,rej)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);});},
  async del(store,key){return tx(store,'readwrite',s=>s.delete(key));},
  async clear(store){return tx(store,'readwrite',s=>s.clear());},
  async setting(key,val){ if(val===undefined){const r=await DB.get('settings',key);return r?r.value:undefined;} return DB.put('settings',{key,value:val}); }
};
