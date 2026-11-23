/* Keyword categorisation engine — local only, no AI */
const CATEGORIES=[
  {id:'food',label:'Food',icon:'🍔'},
  {id:'travel',label:'Travel',icon:'🚇'},
  {id:'shopping',label:'Shopping',icon:'🛍️'},
  {id:'movies',label:'Movies',icon:'🎬'},
  {id:'subscriptions',label:'Subscriptions',icon:'🔁'},
  {id:'gifts',label:'Gifts',icon:'🎁'},
];
const BUILTIN_KEYWORDS={
  food:["mcdonald","mcd","burger king","pizza hut","domino","restaurant","cafe","coffee","starbucks","snack","food","lunch","dinner","breakfast","zomato","swiggy","dosa","biryani","chai","tea","juice","bakery","kfc","subway","taco","sushi","grocery","vegetable","fruit","milk","bread","chocolate","ice cream","dinner","lunch"],
  travel:["railway","train","metro","bus","rickshaw","auto","ola","uber","cab","taxi","travel","ticket","flight","airline","petrol","fuel","parking","toll","irctc","fastag","rapido","yulu"],
  shopping:["cloth","clothing","shirt","pants","shoe","sneaker","accessor","shopping","electronic","phone","laptop","headphone","amazon","flipkart","myntra","zara","h&m","mall","store","watch","bag","sunglasses","perfume","makeup","book"],
  movies:["movie","cinema","pvr","inox","film","ticket","bookmyshow","bms","popcorn","theatre","theater"],
  subscriptions:["netflix","chatgpt","picsart","subscription","premium","spotify","youtube premium","apple","icloud","prime","hotstar","disney","canva","adobe","notion","gym membership","membership"],
  gifts:["gift","birthday gift","present","anniversary gift","bouquet","flowers","chocolate gift"]
};
function normalize(s){return String(s||'').toLowerCase().trim().replace(/\s+/g,' ');}
async function categorize(description){
  const text=normalize(description); if(!text) return null;
  // 1) user-learned mappings (exact keyword match preferred)
  try{
    const learned=await DB.all('categoryKeywords');
    for(const k of learned){ if(text===normalize(k.keyword)) return k.category; }
    for(const k of learned){ if(text.includes(normalize(k.keyword))) return k.category; }
  }catch(e){}
  // 2) built-in dictionary — longest keyword wins to avoid false positives
  let best=null,bestLen=0;
  for(const [cat,words] of Object.entries(BUILTIN_KEYWORDS)){
    for(const w of words){ const nw=normalize(w);
      if(text===nw||text.includes(nw)){ if(nw.length>bestLen){best=cat;bestLen=nw.length;} }
    }
  }
  return best;
}
async function rememberKeyword(keyword,category){
  const kw=normalize(keyword); if(!kw) return;
  await DB.put('categoryKeywords',{keyword:kw,category,updatedAt:new Date().toISOString()});
}
