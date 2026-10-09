/* =====================================================================
   Engine: tiles, movement, zones, dialogue, spaced review, speech, saving.
   ===================================================================== */
const $=id=>document.getElementById(id);
let C=null,CH=null; // current chapter content (C) and its registry entry (CH)
let state=null,Z=null,ZID='ship',MAP=[],MW=0,MH=0,NPCS=[];
const has=w=>!!state&&state.badges.includes(w);
const now=()=>Date.now();

/* ---------- spaced review: each word has a level 0..5 and a due time ---------- */
/* GAME.srs (optional, 방과 후):
   gap:[…ms]  the wait after reaching each level (default below).
   beats:[…]  a word is also due again after that many story beats (talks that move the story: a flag, a word, an item, a scene
              change), whichever comes first, so a fast player and a slow one both get their reviews within one chapter.
              Beats count game-wide (KEY('beats')).
   shared:1   one review record for the whole game (KEY('lv')), and words learned in other chapters (their saves' badges) come
              back here when due: in the notebook, class time and the end-of-chapter round, asked with their own chapter's
              BANK sentences. */
const GAP=[0,5*60e3,30*60e3,4*3600e3,24*3600e3,3*24*3600e3];
const SRS=()=>G.srs||{},gapAt=b=>(SRS().gap||GAP)[b];
let beatsN=null;const beats=()=>beatsN??(beatsN=+(store.get(KEY('beats'))||0));
function beat(){if(!SRS().beats)return;beatsN=beats()+1;store.set(KEY('beats'),String(beatsN))}
const lv=w=>state.lv[w]||{b:0,due:0};
const dueL=L=>L.due<=now()||(L.beat!=null&&beats()>=L.beat);
let carrySet=new Set(),carryQs=null;  // words learned in other chapters (shared), and their BANK questions (made once, on demand)
const known=w=>has(w)||(!!SRS().shared&&carrySet.has(w)&&!C.WORDS.includes(w));
let talkN=0;const askedIn={};  // conversations opened so far, and the one each word was last asked in
const isDue=w=>known(w)&&dueL(lv(w))&&!(askedIn[w]>=talkN-1);  // never in the conversation right after it was asked (타이밍, then 타이밍 again)
function spaced(b){const bg=SRS().beats;return {b,due:now()+gapAt(b),beat:bg&&bg[b]!=null?beats()+bg[b]:null}}
function grade(w,ok){
 let L={...lv(w)};
 if(!ok)L={b:0,due:now(),beat:null};else if(dueL(L))L=spaced(Math.min(5,L.b+1));  // a right answer before the word is due doesn't level it up (asking again and again can't max a word)
 state.lv[w]=L;save();return L.b;
}
let carryDs=null;
function carryBank(){  // other chapters' BANK questions by word, and their DICT entries (a carried word taps to the sense you learned)
 if(carryQs)return carryQs;carryQs={};carryDs={};
 for(const ch of CHAPTERS)if(ch!==CH)try{const c=ch.make();(c.BANK||[]).forEach(q=>{if(q.w&&!q.scene&&!q.gram)(carryQs[q.w]=carryQs[q.w]||[]).push(q)});
  (c.WORDS||[]).forEach(w=>{if(c.DICT&&c.DICT[w])carryDs[w]=c.DICT[w]})}catch(e){}
 return carryQs;
}
const carryDict=w=>{if(!SRS().shared||!carrySet.has(w))return null;carryBank();return carryDs[w]||null};
function refreshCarry(){  // other chapters' saves: their words, and their levels merged into the shared record (the higher level wins)
 carrySet=new Set();carryQs=null;if(!SRS().shared)return;
 let all={};try{all=JSON.parse(store.get(KEY('lv'))||'{}')||{}}catch(e){}
 const take=(w,L)=>{const A=all[w];if(!A||L.b>A.b||(L.b===A.b&&L.due>A.due))all[w]=L};
 for(const ch of CHAPTERS){let sv=null;try{sv=ch===CH?state:JSON.parse(store.get(ch.save)||'null')}catch(e){}if(!sv)continue;
  if(ch!==CH)(sv.badges||[]).forEach(w=>carrySet.add(w));Object.entries(sv.lv||{}).forEach(([w,L])=>take(w,L))}
 state.lv=all;store.set(KEY('lv'),JSON.stringify(all));
}
const carryWords=()=>[...carrySet].filter(w=>!C.WORDS.includes(w)&&(carryBank()[w]||[]).length);
const dueWords=()=>[...C.WORDS,...(SRS().shared?carryWords():[])].filter(isDue);
const carryDue=()=>SRS().shared?carryWords().filter(isDue).sort((a,b)=>lv(a).b-lv(b).b):[];  // other chapters' words that are due, weakest first
const carryQ=w=>{const qs=carryBank()[w]||[];return qs[Math.random()*qs.length|0]};
/* ---------- practice while time passes (opt-in content) ----------
   classTime(CLASS,parts): a stretch of time passing (classes between the bells, a shift, a journey). Each part narrates a beat, then
   someone says one of its lines with a word you've learned, graded like a review: a due word of this chapter (weakest first), else a
   due word from another chapter (srs.shared: its own BANK sentence, after TERM.carry), else any of yours at random.
   CLASS={part:{say, lines:[{w, who, ask, opts}]}}. Use it as a step that expands when it's reached, so words taught just before count:
   {expand:()=>classTime(CLASS,['국어','영어'])}.
   wrapUp(): the end of a chapter: one more go at this chapter's words not yet ★ (weakest first) and due words from other chapters, at
   most four, in BANK sentences, after TERM.wrap, so a word taught late isn't left at one review. {expand:()=>wrapUp()} in DONE. */
function classTime(CLASS,parts){
 const out=[],used=new Set();let said=0;
 for(const k of parts){const c=CLASS[k];if(!c)continue;out.push({who:'…',say:c.say});
  const ok=c.lines.filter(l=>has(l.w)&&!used.has(l.w)),due=ok.filter(l=>isDue(l.w));
  if(due.length){const lo=Math.min(...due.map(l=>lv(l.w).b)),p=due.filter(l=>lv(l.w).b===lo),l=p[Math.random()*p.length|0];used.add(l.w);out.push({...l,review:true});continue}
  const cw=carryDue().find(w=>!used.has(w)),q=cw&&carryQ(cw);
  if(q){used.add(cw);if(!said)out.push({who:'…',say:TERM.carry});said=1;out.push({...q,who:'…',review:true});continue}  // TERM.carry once per stretch, not before every earlier word
  if(ok.length){const l=ok[Math.random()*ok.length|0];used.add(l.w);out.push({...l,review:true})}}
 return out;
}
function wrapUp(){
 const bank=w=>(C.BANK||[]).filter(q=>q.w===w&&!q.scene&&!q.gram);
 const said=w=>(C.REVIEW||[]).filter(r=>r.w===w&&r.who!=='나'),pick=a=>a[Math.random()*a.length|0];
 const nameOf=r=>{const b=[].concat(r.by)[0];return (C.NPC[b]&&C.NPC[b].name)||b};
 const metBy=r=>[].concat(r.by).some(b=>metIds().includes(b));
 const now_=r=>(!r.when||r.when())&&[].concat(r.by).every(b=>{const n=C.NPC[b];return !n||!n.hide||!n.hide()});  // its moment holds and its speaker is still here (no one speaks after they've died or gone, no "look out!" after the danger)
 const line=w=>{const R=said(w).filter(now_),f=R.filter(r=>unheard(r)&&metBy(r)),h=R.filter(r=>!unheard(r)),P=f.length?f:h.length?h:R;if(P.length){const r=pick(P),q={...r,who:nameOf(r),review:true};delete q.by;delete q.pre;delete q.when;return q}  // a line with it from someone in this chapter, under their name: one you haven't heard yet from someone you've met first (a word-for-word repeat felt stale), else one you heard — only lines whose moment holds (`when`) from someone still here — else the generic sentence
  const b=bank(w);return b.length?{...pick(b),who:'…',review:true}:null};
 const qs=C.WORDS.filter(w=>has(w)&&lv(w).b<3&&(said(w).length||bank(w).length)).sort((a,b)=>lv(a).b-lv(b).b).slice(0,4).map(line).filter(Boolean);
 carryDue().slice(0,Math.max(0,4-qs.length)).forEach(w=>{const q=carryQ(w);if(q)qs.push({...q,who:'…',review:true})});
 return qs.length?[{who:'…',say:TERM.wrap},...qs]:[];
}
function nextDue(){const t=C.WORDS.filter(has).map(w=>lv(w).due).filter(d=>d>now());return t.length?Math.min(...t):null}
function fmtWait(ms){const m=Math.ceil(ms/60e3);return m<60?`${m}분`:m<1440?`${Math.round(m/60)}시간`:`${Math.round(m/1440)}일`}

/* ---------- settings ---------- */
/* Per-game settings come from src/game.js (`var GAME={…}`), so one engine serves 성실호, 형제 and 방과 후. */
const G=typeof GAME!=='undefined'?GAME:{};
const KEY=k=>(G.prefix||'walk')+'-'+k;
const TERM_BASE=Object.assign({allWords:n=>[`단어 ${n}개를 다 모았어요!`,`이제 ${TERM.name}에서 복습하면 ★가 생겨요.`],name:'복습 노트',empty:'아직 노트가 비어 있어요.',idle:'지금은 복습할 단어가 없어요.',next:'다음 복습',due:(n,k)=>`복습할 단어가 ${n}개 있어요.`+(k<n?` 이번에는 ${k}개만 해요.`:''),end:'복습 끝! 다음에 또 봐요.',carry:'지난번에 배운 말도 다시 나와요.',wrap:'오늘 배운 말, 한 번 더 떠올려요.'},G.term||{});
const TERM=new Proxy(TERM_BASE,{get:(o,k)=>(typeof C!=='undefined'&&C&&C.term&&k in C.term)?C.term[k]:o[k]});  // a chapter's term:{name,…} overrides the game's (one 교시 reviews on paper, the next on a laptop)
const LOGNAME=G.log||LOGNAME;
const store={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let soundOn=store.get(KEY('sound'))!=='0';
/* 듣기 문제 (START menu): review may ask a word by sound alone. On by default; ?listen=0 in the URL turns it off and saves that
   (the playtest tools do, since testers can't hear) */
let listenOn=store.get(KEY('listen'))!=='0';{const q=new URLSearchParams(location.search).get('listen');if(q==='0'||q==='1'){listenOn=q==='1';store.set(KEY('listen'),q)}}
let readOn=store.get(KEY('read'))==='1';

/* ---------- sound ---------- */
let AC=null;
const SFX={move:[[1040,.04,0]],ok:[[880,.07,0],[1320,.12,.07]],no:[[240,.12,0],[180,.18,.1]],badge:[[660,.09,0],[880,.09,.09],[1100,.09,.18],[1320,.25,.27]],star:[[1320,.07,0],[1760,.07,.07],[2200,.2,.14]],door:[[300,.1,0],[220,.16,.08]],item:[[990,.06,0],[1480,.14,.06]],lock:[[160,.08,0],[160,.08,.12]],
 /* the school bell: the Westminster chime Korean schools ring (딩동댕동), soft sine tones that ring on */
 bell:[659.3,523.3,587.3,392,392,587.3,659.3,523.3].flatMap((fq,i)=>[[fq,1.5,i*.5,'sine',.07],[fq*2,.4,i*.5,'sine',.012]])};
const SFXON={};
function sfx(k){
 if(!soundOn)return;
 try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const t0=AC.currentTime;
  (SFXON[k]||[]).forEach(g=>{g.gain.cancelScheduledValues(t0);g.gain.setTargetAtTime(.0001,t0,.05)});  /* a sound started again cuts the last one short */
  SFXON[k]=SFX[k].map(([fq,d,st,type,vol])=>{const o=AC.createOscillator(),gn=AC.createGain();o.type=type||'square';o.frequency.value=fq;gn.gain.setValueAtTime(0,t0);gn.gain.setValueAtTime(vol||.035,t0+st);gn.gain.exponentialRampToValueAtTime(.0001,t0+st+d);o.connect(gn).connect(AC.destination);o.start(t0+st);o.stop(t0+st+d+.02);return gn})}catch(e){}
}

/* ---------- speech (Korean voice, if this device has one) ---------- */
const TTS='speechSynthesis' in window;
let koVoice=null;
function pickVoice(){if(!TTS)return;const vs=speechSynthesis.getVoices();koVoice=vs.find(v=>/^ko/i.test(v.lang)&&/google|yuna|sora|heami|neural/i.test(v.name))||vs.find(v=>/^ko/i.test(v.lang))||null;updateRead()}
const canSpeak=()=>!!koVoice;
const plain=t=>t.replace(/\{([^|}]+)\|[^}]+\}/g,'$1');
function speak(t){
 if(!canSpeak())return;
 try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(plain(t).replace(/___/g,'뭐'));u.lang='ko-KR';u.voice=koVoice;u.rate=.92;speechSynthesis.speak(u)}catch(e){}
}

/* ---------- canvas + tiles ---------- */
const cv=$('cv'),g=cv.getContext('2d');g.imageSmoothingEnabled=false;
const TS=16,VW=11,VH=10;
const r=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h)};
const hash=(x,y)=>{let h=x*374761393+y*668265263;h=(h^(h>>13))*1274126177;return ((h^(h>>16))>>>0)%100};
const at=(x,y)=>(x<0||y<0||x>=MW||y>=MH)?null:MAP[y][x];
const same=(x,y)=>at(x,y)===at(x,y);
const front=(x,y)=>at(x,y+1)!==at(x,y);
let CAM={x:0,y:0};

function stars(X,Y,x,y,t,depth){ // parallax: the stars drift slower than the walls as the camera moves
 r(X,Y,16,16,'#05080D');
 const ox=CAM.x*depth,oy=CAM.y*depth;
 for(let i=0;i<3;i++){
  const sx=((x*16+i*37+hash(x+i,y)*7-ox)%160+160)%160,sy=((y*16+i*53+hash(y+i,x)*3-oy)%160+160)%160;
  const px=(sx%16),py=(sy%16);const tw=(hash(x*3+i,y)+Math.floor(t/600))%9===0;
  r(X+px,Y+py,1,1,tw?'#FFFFFF':i===0?'#8FA3B8':'#C8D3DE');
 }
}
function deck(X,Y,x,y){r(X,Y,16,16,'#C9CDC4');r(X,Y,16,1,'#B6BBB1');r(X,Y,1,16,'#B6BBB1');if(hash(x,y)<12){r(X+5,Y+6,2,2,'#B9BDB3')}}
function plate(X,Y,x,y){r(X,Y,16,16,'#6E7680');r(X,Y,16,1,'#5D646D');r(X,Y,1,16,'#5D646D');r(X+2,Y+2,1,1,'#88909A');r(X+13,Y+13,1,1,'#88909A');if((x+y)%5===0)r(X+4,Y+8,8,1,'#636B74')}
function lawn(X,Y,x,y){r(X,Y,16,16,'#8DC46A');const h=hash(x,y);if(h<55){r(X+(h%11)+2,Y+(h%7)+3,1,2,'#77B058');r(X+(h%11)+4,Y+(h%7)+4,1,1,'#77B058')}if(h%6===0)r(X+(h*3%12)+2,Y+(h*7%12)+2,1,1,'#B4DE8A')}
function screenGlow(X,Y,t,c,seed){const on=(Math.floor(t/400)+seed)%5!==0;r(X,Y,6,4,on?c:'#24303A')}

const TILES={
 /* ship */
 hull:(X,Y,x,y,t)=>{r(X,Y,16,16,'#868C84');r(X,Y,16,1,'#9CA299');if(front(x,y)&&at(x,y+1)){r(X,Y+10,16,6,'#ABB0A6');r(X,Y+10,16,1,'#C2C6BC');if(x%4===1)r(X+6,Y+12,4,2,(Math.floor(t/700)+x)%3?'#E8962A':'#7A5420')}else{r(X+3,Y+4,1,1,'#6F756E');r(X+12,Y+4,1,1,'#6F756E')}},
 deck:(X,Y,x,y)=>deck(X,Y,x,y),
 grate:(X,Y,x,y,t)=>{r(X,Y,16,16,'#575E5A');for(let i=1;i<16;i+=3)r(X+i,Y,1,16,'#474D4A');if(x%4===0){const on=(Math.floor(t/180)-x/4)%6===0;r(X+7,Y+7,2,2,on?'#FFD08A':'#B8701A')}},
 window:(X,Y,x,y,t)=>{stars(X,Y,x,y,t,.35);r(X,Y,16,2,'#868C84');r(X,Y+14,16,2,'#ABB0A6');if(x%3===0)r(X,Y,1,16,'#6F756E');if(x>=9&&x<=13){const c=['#3E8E6A','#4E9E6E','#C9A64A'];r(X,Y+9,16,5,c[(x)%3]);r(X,Y+9,16,1,'#9FD7E8')}},
 console:(X,Y,x,y,t)=>{deck(X,Y,x,y);r(X+1,Y+3,14,11,'#2B3238');r(X+1,Y+3,14,2,'#3C454C');screenGlow(X+3,Y+6,t,x%2?'#69CFD8':'#E8962A',x);r(X+10,Y+7,3,1,'#5F6B72');r(X+10,Y+9,3,1,'#5F6B72')},
 hydro:(X,Y,x,y,t)=>{deck(X,Y,x,y);r(X+1,Y+5,14,9,'#5E655F');r(X+2,Y+6,12,2,'#3A6E8A');const h=hash(x,y);for(let i=0;i<3;i++){const px=X+3+i*4,ph=4+((h+i)%3);r(px,Y+6-ph+2,2,ph,'#3F8F4A');r(px-1,Y+6-ph+2,4,2,'#5DB866');if((h+i)%4===0)r(px,Y+6-ph+1,2,2,'#D9544B')}r(X+1,Y,14,1,'#C77DDB')},
 bunk:(X,Y,x,y)=>{deck(X,Y,x,y);r(X+1,Y+1,14,14,'#5E655F');r(X+2,Y+2,12,4,'#ECEDE6');r(X+2,Y+6,12,8,'#C9873A');r(X+2,Y+6,12,1,'#E3A65A')},
 terminal:(X,Y,x,y,t)=>{(Z.base==='plate'?plate:deck)(X,Y,x,y);r(X+3,Y+1,10,14,'#2B3238');r(X+4,Y+2,8,6,'#0F141A');const due=state&&dueWords().length>0;
  if(due){const on=Math.floor(t/350)%2;r(X+5,Y+3,6,4,on?'#69CFD8':'#2C5D63')}else{r(X+5,Y+4,4,1,'#3C6E6E');r(X+5,Y+6,6,1,'#3C6E6E')}r(X+5,Y+10,6,1,'#5F6B72');r(X+5,Y+12,6,1,'#5F6B72')},
 pipes:(X,Y,x,y,t)=>{deck(X,Y,x,y);r(X+2,Y,4,16,'#6E7570');r(X+9,Y,4,16,'#6E7570');r(X+2,Y,1,16,'#899089');r(X+9,Y,1,16,'#899089');r(X+1,Y+6,6,3,'#4F5652');r(X+8,Y+10,6,3,'#4F5652');r(X+3,Y+7,2,1,'#D2533F')},
 engine:(X,Y,x,y,t)=>{deck(X,Y,x,y);const ox=x-3,oy=y-11; // 4x2 block, drawn piece by piece
  r(X,Y,16,16,'#30363B');if(oy===0)r(X,Y,16,2,'#454C52');if(ox===0)r(X,Y,2,16,'#454C52');if(ox===3)r(X+14,Y,2,16,'#252A2E');
  const fixed=state&&state.f.fixed;const pulse=fixed?(Math.sin(t/260)+1)/2:0;
  if(ox===1||ox===2){const c=fixed?`rgba(105,207,216,${.55+pulse*.45})`:((Math.floor(t/120)%7===0)?'#D2533F':'#3B2422');r(X+(ox===1?6:0),Y+(oy===0?8:0),10,8,c)}
  if(oy===1&&(ox===0||ox===3))r(X+5,Y+4,6,3,fixed?'#E8962A':'#4A3A2A')},
 airlock:(X,Y,x,y)=>{r(X,Y,16,16,'#3A4046');for(let i=-16;i<16;i+=6){g.save();g.beginPath();g.rect(X,Y,16,16);g.clip();g.fillStyle='#E8B73A';g.beginPath();g.moveTo(X+i,Y+16);g.lineTo(X+i+3,Y+16);g.lineTo(X+i+19,Y);g.lineTo(X+i+16,Y);g.fill();g.restore()}r(X+2,Y+3,12,10,'#2B3136');r(X+7,Y+3,2,10,'#1E2327')},
 /* dock */
 ring:(X,Y,x,y,t)=>{r(X,Y,16,16,'#3F4650');r(X,Y,16,1,'#4E5661');if(front(x,y)&&at(x,y+1)){r(X,Y+9,16,7,'#555D68');r(X,Y+9,16,1,'#6B7480');if(x%2===0)r(X+3,Y+11,10,2,(Math.floor(t/900)+x)%4?'#9FD7E8':'#4B6B78')}},
 plate:(X,Y,x,y)=>plate(X,Y,x,y),
 planetWin:(X,Y,x,y,t)=>{stars(X,Y,x,y,t,.15);const P=Z.planet;
  g.save();g.beginPath();g.rect(X,Y,16,16);g.clip();
  const cx=P.cx-CAM.x,cy=P.cy+Math.sin(t/4000)*2-CAM.y*.0;
  g.fillStyle='#2E7A68';g.beginPath();g.arc(cx,cy+170,P.r,0,Math.PI*2);g.fill();
  g.fillStyle='#4E9E6E';g.beginPath();g.arc(cx-40,cy+190,60,0,Math.PI*2);g.fill();
  g.fillStyle='#C9A64A';g.beginPath();g.arc(cx+60,cy+200,40,0,Math.PI*2);g.fill();
  g.strokeStyle='rgba(159,215,232,.7)';g.lineWidth=2;g.beginPath();g.arc(cx,cy+170,P.r,Math.PI*1.05,Math.PI*1.95);g.stroke();
  g.restore();
  if(y===1)r(X,Y,16,2,'#3F4650');if(y===2)r(X,Y+14,16,2,'#555D68');if(x%4===0)r(X,Y,1,16,'#2E343C')},
 crate:(X,Y,x,y)=>{plate(X,Y,x,y);r(X+1,Y+2,14,13,'#9C6A34');r(X+1,Y+2,14,2,'#B9844A');r(X+1,Y+8,14,1,'#7A5026');r(X+7,Y+2,2,13,'#7A5026');r(X+3,Y+5,3,1,'#E8962A')},
 stall:(X,Y,x,y)=>{plate(X,Y,x,y);r(X,Y+4,16,11,'#6A3A2E');r(X,Y+4,16,3,'#A04E3A');if(y===4){for(let i=0;i<4;i++)r(X+i*4,Y,4,4,i%2?'#E8962A':'#F1E6D0')}else{r(X+3,Y+1,4,4,'#D9544B');r(X+9,Y+2,3,3,'#69CFD8')}},
 lift:(X,Y,x,y,t)=>{(Z.outdoor?TILES.stone:plate)(X,Y,x,y);const p=(Math.sin(t/300)+1)/2;g.strokeStyle=`rgba(105,207,216,${.4+p*.6})`;g.lineWidth=2;g.strokeRect(X+2,Y+2,12,12);r(X+6,Y+6,4,4,'#69CFD8')},
 /* city */
 tree:(X,Y,x,y)=>{lawn(X,Y,x,y);r(X+6,Y+11,4,5,'#7A5530');r(X+2,Y+1,12,11,'#2F8466');r(X+1,Y+3,14,7,'#2F8466');r(X+4,Y+2,5,3,'#4FA67E');r(X+3,Y+5,2,2,'#4FA67E');r(X+2,Y+10,12,1,'#246A52')},
 lawn:(X,Y,x,y)=>lawn(X,Y,x,y),
 stone:(X,Y,x,y)=>{r(X,Y,16,16,'#E5D2B5');r(X,Y+7,16,1,'#D2BD9C');r(X+((y%2)?4:11),Y,1,7,'#D2BD9C');r(X+((y%2)?10:2),Y+8,1,8,'#D2BD9C')},
 dome:(X,Y,x,y,t)=>{lawn(X,Y,x,y);const L=at(x-1,y)!=='O',T=at(x,y-1)!=='O';
  if(T){g.fillStyle='#7FD3D8';g.beginPath();g.arc(X+(L?16:0),Y+9,9,Math.PI,0);g.fill();g.fillStyle='#BDEFF0';g.fillRect(X+(L?12:1),Y+3,2,4);r(X+(L?15:0),Y,1,2,'#E8962A')}
  else{r(X+(L?4:0),Y,L?12:12,16,'#E9DCC7');r(X+(L?4:0),Y,L?12:12,2,'#5EB9C1');if(L)r(X+8,Y+6,4,6,'#5EB9C1');else r(X+4,Y+6,4,6,'#5EB9C1')}},
 cable:(X,Y,x,y,t)=>{TILES.stone(X,Y,x,y);r(X+1,Y,14,16,'#9AA3AD');r(X+1,Y,14,2,'#B9C1C9');if(x===11){r(X+6,Y,4,16,'#5D646D')}else{r(X+3,Y+5,10,6,'#6E7680')}
  if(x===11&&y===1){const p=(Math.sin(t/200)+1)/2;r(X+7,Y-16,2,16,`rgba(159,215,232,${.6+p*.4})`)}},
 police:(X,Y,x,y)=>{r(X,Y,16,16,'#8C98AE');r(X,Y+15,16,1,'#6F7B91');if(at(x,y-1)!=='P'){r(X,Y,16,4,'#3E4C6A')}if(front(x,y)){if(x===4){r(X+3,Y+3,10,13,'#3E4C6A');r(X+4,Y+4,8,12,'#556483')}else if(x%2===0){r(X+3,Y+4,10,7,'#3E4C6A');r(X+4,Y+5,8,5,'#CFE3F5')}}},
 cafe:(X,Y,x,y)=>{r(X,Y,16,16,'#F1D4CC');r(X,Y+15,16,1,'#D8B4AA');if(at(x,y-1)!=='C')r(X,Y,16,3,'#B85A5A');if(front(x,y)){for(let i=0;i<4;i++)r(X+i*4,Y,4,5,i%2?'#F7F1E6':'#2F8F8A');if(x===19){r(X+4,Y+6,8,10,'#6B4A2B')}else{r(X+3,Y+7,10,6,'#6B4A2B');r(X+4,Y+8,8,4,'#F7D98C')}}},
 flowers:(X,Y,x,y)=>{lawn(X,Y,x,y);[[3,4,'#E86D8A'],[10,3,'#F7D154'],[6,10,'#FFFFFF'],[12,11,'#E86D8A']].forEach(([a,b,c])=>{r(X+a,Y+b,2,2,c);r(X+a,Y+b+2,1,2,'#3E8E3A')})},
 pond:(X,Y,x,y,t)=>{r(X,Y,16,16,'#4AA3C8');const o=Math.floor(t/400+x)%4;r(X+o*3,Y+4,5,1,'#9FD7E8');r(X+((o+2)%4)*3,Y+10,5,1,'#9FD7E8');if(at(x,y-1)!=='~')r(X,Y,16,2,'#3A86A8')},
 bench:(X,Y,x,y)=>{lawn(X,Y,x,y);r(X+1,Y+5,14,2,'#9A6A3C');r(X+1,Y+8,14,3,'#B68350');r(X+2,Y+11,2,4,'#6E4A28');r(X+12,Y+11,2,4,'#6E4A28')},
};
/* the floor layer (opt-in): an object stands on its legend's floor, else on its zone's floor, so object tiles draw only the object
   and look right in any room; a walkable tile is a floor itself unless its legend names one */
function tile(x,y,X,Y,t){const c=at(x,y);const L=c!=null&&Z.legend[c];const fn=L&&TILES[L.tile];
 const fl=L&&(L.floor||(!L.walk&&Z.floor));if(fl&&fl!==L.tile&&TILES[fl])TILES[fl](X,Y,x,y,t);
 if(fn)fn(X,Y,x,y,t);else r(X,Y,16,16,Z.outdoor?'#2F8466':'#1A1F24')}

/* ---------- sprites: pixel-art grids ----------
   A sprite is an array of equal-length strings; each char is a palette key ('.' = transparent).
   drawArt draws it with its feet on the tile's bottom edge, so tall sprites (16×24, 16×32) grow upward. */
function shade(hex,k){const n=parseInt(hex.slice(1),16);const f=c=>Math.max(0,Math.min(255,Math.round(c*k)));return '#'+[(n>>16)&255,(n>>8)&255,n&255].map(c=>f(c).toString(16).padStart(2,'0')).join('')}
/* art transforms: draw a picture once, upright, and turn it to fit (a view out of an east or west window, a chair turned around).
   rows = an array of equal-length strings of palette keys. rot turns clockwise by quarter turns (q: 1, 2, 3, or -1 = counter-clockwise). */
const ART={
 rot:(rows,q=1)=>{q=((q%4)+4)%4;let a=rows;for(let i=0;i<q;i++){const h=a.length,w=a[0].length,o=[];for(let x=0;x<w;x++){let row='';for(let y=h-1;y>=0;y--)row+=a[y][x];o.push(row)}a=o}return a},
 flipH:rows=>rows.map(r=>[...r].reverse().join('')),
 flipV:rows=>rows.slice().reverse(),
 /* draw rows top-down from (X,Y), no bottom-alignment: for pieces of tiles */
 put:(rows,pal,X,Y)=>{for(let y=0;y<rows.length;y++)for(let x=0;x<rows[y].length;x++){const c=pal[rows[y][x]];if(c){g.fillStyle=c;g.fillRect(X+x,Y+y,1,1)}}}};
function drawArt(rows,pal,X,Y,flip){
 const h=rows.length,w=rows[0].length,top=Y+16-h;
 for(let y=0;y<h;y++){const row=rows[y];for(let x=0;x<w;x++){const c=row[flip?w-1-x:x];if(c==='.')continue;const col=pal[c];if(col){g.fillStyle=col;g.fillRect(X+x,top+y,1,1)}}}
}
function shadow(X,Y,w){g.fillStyle='rgba(0,0,0,.22)';g.fillRect(X+4,Y+14,w||8,2);g.fillRect(X+3,Y+15,(w||8)+2,1)}
const HEAD={ // rows 0–7 by style and view (left view is flipped for right)
 short:{down:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHSSSSSSHO...','...OSSESSESSO...','...OSSSSSSSSO...','....OSSMMSSO....'],
        up:  ['................','.....OOOOOO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHHHHHHHHO...','...OHhHHHHhHO...','...OHHHHHHHHO...','....OSSSSSSO....'],
        left:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHHHHhHHO...','...OSSHHHHHHO...','..OSESSSHHhHO...','...OSSSSSHHHO...','....OMSSSSSO....']},
 long:{down:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHhHHhHHO...','..OHHSSSSSSHHO..','..OHSSESSESSHO..','..OHSSSSSSSSHO..','..OHHSSMMSSHHO..'],
        up:  ['................','.....OOOOOO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHHHHHHHHO...','..OHHhHHHHhHHO..','..OHHHHHHHHHHO..','..OHHHHHHHHHHO..'],
        left:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHHHHHHHO...','...OHHHHHhHHO...','..OSESSHHHhHO...','...OSSSSHHHHO...','....OMSSOHHHO...']},
 bald:{down:['................','.....OOOOOO.....','....OSSSSSSO....','...OSSWSSSSSO...','...OHSSSSSSHO...','...OSSESSESSO...','...OSSSSSSSSO...','....OSSMMSSO....'],
        up:  ['................','.....OOOOOO.....','....OSSSSSSO....','...OSSWSSSSSO...','...OHSSSSSSHO...','...OHHSSSSHHO...','...OHHHHHHHHO...','....OSSSSSSO....'],
        left:['................','.....OOOOOO.....','....OSSSSSSO....','...OSSSSSWSSO...','...OSSSSSSHHO...','..OSESSSSHHHO...','...OSSSSSHHHO...','....OMSSSSSO....']},
 bun:{down:['......OHHO......','.....OOhhOO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHSSSSSSHO...','...OSSESSESSO...','...OSSSSSSSSO...','....OSSMMSSO....'],
        up:  ['......OHHO......','.....OHhhHO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHHHHHHHHO...','...OHhHHHHhHO...','...OHHHHHHHHO...','....OSSSSSSO....'],
        left:['.........OHO....','.....OOOOHHO....','....OHHHHHHO....','...OHHHHHhHHO...','...OSSHHHHHHO...','..OSESSSHHhHO...','...OSSSSSHHHO...','....OMSSSSSO....']},
 bob:{down:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHHHHHHHO...','...OHHhHHhHHO...','..OHSSESSESSHO..','..OHSSSSSSSSHO..','..OHHSSMMSSHHO..'],
        up:  ['................','.....OOOOOO.....','....OHHHHHHO....','...OHHhHHhHHO...','...OHHHHHHHHO...','..OHHhHHHHhHHO..','..OHHHHHHHHHHO..','..OHHHHHHHHHHO..'],
        left:['................','.....OOOOOO.....','....OHHHHHHO....','...OHHHHHHHHO...','...OHHHHHhHHO...','..OSESSHHHhHO...','...OSSSSHHHHO...','....OMSSOHHHO...']},
 spiky:{down:['....O..O..O.....','...OHOOHOOHO....','...OHHHHHHHHO...','...OHHhHHhHHO...','...OHSSSSSSHO...','...OSSESSESSO...','...OSSSSSSSSO...','....OSSMMSSO....'],
        up:  ['....O..O..O.....','...OHOOHOOHO....','...OHHHHHHHHO...','...OHHhHHhHHO...','...OHHHHHHHHO...','...OHhHHHHhHO...','...OHHHHHHHHO...','....OSSSSSSO....'],
        left:['.....O..O..O....','....OHOOHOOHO...','....OHHHHHHHO...','...OHHHHHhHHO...','...OSSHHHHHHO...','..OSESSSHHhHO...','...OSSSSSHHHO...','....OMSSSSSO....']},
};
const CAP={down:['................','.....OOOOOO.....','....OYYYYYYO....','...OYYYyyYYYO...','...OVVVVVVVVO...'],
           up:  ['................','.....OOOOOO.....','....OYYYYYYO....','...OYYYyyYYYO...','...OYYYYYYYYO...'],
           left:['................','.....OOOOOO.....','....OYYYYYYO....','...OYYYYYyYYO...','..OVVVSYYYYYO...']};
const BODY={
 down:[['...OOCCCCCCOO...','..OCCCCCCCCCCO..','..OCcCCCCCCcCO..','..OSOBBBBBBOSO..','...OPPPPPPPPO...','...OPPPOOPPPO...','...OPPO..OPPO...','...OKKO..OKKO...'],
       ['...OOCCCCCCOO...','..OCCCCCCCCCCO..','..OCcCCCCCCcCO..','..OSOBBBBBBOSO..','...OPPPPPPPPO...','...OPPPOOPPPO...','...OPPO..OKKO...','...OKKO.........'],
       ['...OOCCCCCCOO...','..OCCCCCCCCCCO..','..OCcCCCCCCcCO..','..OSOBBBBBBOSO..','...OPPPPPPPPO...','...OPPPOOPPPO...','...OKKO..OPPO...','.........OKKO...']],
 left:[['.....OOCCCO.....','....OCCCCCCO....','....OCCCSCCO....','....OCBBSBCO....','....OPPPPPPO....','....OPPOOPPO....','....OPPOOPPO....','....OKKOOKKO....'],
       ['.....OOCCCO.....','....OCCCCCCO....','....OCCSCCCO....','....OCBSBBCO....','....OPPPPPPO....','....OPPOPPO.....','...OPPO.OPPO....','...OKKO.OKKO....'],
       ['.....OOCCCO.....','....OCCCCCCO....','....OCCCCSCO....','....OCBBBSCO....','....OPPPPPPO....','....OPPOOPPO....','....OPPOOPPO....','....OKKOOKKO....']]};
function humanArt(L,dir,step){
 const view=dir==='right'?'left':dir;
 const style=L.style||(L.long?'long':'short');
 let head=HEAD[style][view].slice();
 if(L.cap){const cp=CAP[view];head=head.map((row,i)=>i<cp.length?cp[i]:row)}
 let body=(BODY[view==='up'?'down':view][step||0]).slice();
 const set=(rows,y,x,ch)=>{rows[y]=rows[y].slice(0,x)+ch+rows[y].slice(x+1)};
 if(L.coat){for(const y of [4,5])body[y]=body[y].replace(/P/g,'C').replace(/p/g,'c')}
 if(!L.belt)body=body.map(rw=>rw.replace(/B/g,'C'));
 if(style==='bob'&&view!=='left'){set(body,0,3,'H');set(body,0,12,'H');if(view==='up')for(let x=4;x<12;x++)set(body,0,x,'H')}
 if(style==='long'&&view!=='left'){for(const y of [0,1,2]){set(body,y,3,'H');set(body,y,12,'H')}if(view==='down'){set(body,0,4,'H');set(body,0,11,'H')}if(view==='up')for(let x=4;x<12;x++){set(body,0,x,'H');set(body,1,x,'H')}}
 if(style==='long'&&view==='left'){for(const y of [0,1])for(const x of [9,10])set(body,y,x,'H');set(body,2,10,'H')}
 if(L.lashes&&view==='down')head=head.map(rw=>rw.replace(/SESSES/,'EESSEE'));
 if(L.lips)head=head.map(rw=>rw.replace(/M/g,'L'));
 if(L.beard){if(view==='down'){head[6]='...OSDDDDDDSO...';head[7]='....ODDDDDDO....';body[0]='...OODDDDDDOO...'}else if(view==='left'){head[6]='...ODDDDSHHHO...';head[7]='....ODDDDSO.....'}}
 if(L.arm){ // mechanical arm on the character's left side
  if(view==='down'&&dir==='down'){set(body,1,12,'A');set(body,2,12,'A');set(body,3,12,'A')}
  if(view==='up'){set(body,1,3,'A');set(body,2,3,'A');set(body,3,3,'A')}
  if(dir==='left'){body=body.map(rw=>rw.replace(/S/g,'A'));set(body,1,7,'A')}
 }
 return head.concat(body);
}
function humanPal(L){
 const o='#1B1E2B';
 return {O:o,E:o,H:L.hair,h:L.hairHi||shade(L.hair,.78),S:L.skin,s:shade(L.skin,.85),M:shade(L.skin,.72),W:shade(L.skin,1.12),C:L.shirt,c:shade(L.shirt,.8),
  P:L.pants,p:shade(L.pants,.8),K:L.shoes||'#2A2A33',B:L.belt||L.shirt,D:L.beard||L.hair,L:L.lips||shade(L.skin,.72),A:L.arm||L.skin,Y:L.cap||L.hair,y:shade(L.cap||L.hair,.8),V:shade(L.cap||'#333333',.55)};
}
/* ---------- talk portraits: a chest-up 48×48 pixel portrait generated from a character's walk look (hair style/colour,
   skin, uniform, tie, lashes/lips, cap, beard) with an expression and an open/closed mouth — Openbound-style, all our own art ---------- */
function portraitGrid(L,face,open){
 const W=48,g=Array.from({length:W},()=>Array(W).fill(null)),O='#1B1E2B';
 const px=(x,y,c)=>{if(x>=0&&y>=0&&x<W&&y<W)g[y][x]=c};
 const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)px(i,j,c)};
 const oval=(cx,cy,rx,ry,c,y0=-99,y1=99)=>{for(let y=Math.ceil(cy-ry);y<=cy+ry;y++)for(let x=Math.ceil(cx-rx);x<=cx+rx;x++)
   if(y>=y0&&y<=y1&&((x-cx)/rx)**2+((y-cy)/ry)**2<=1)px(x,y,c)};
 const sk=L.skin,skS=shade(L.skin,.85),hr=L.hair,hrS=L.hairHi||shade(L.hair,.78),sh=L.shirt,shS=shade(L.shirt,.82),style=L.style||(L.long?'long':'short');
 // shoulders + uniform
 rect(9,40,30,8,sh);rect(12,37,24,4,sh);rect(9,44,4,4,shS);rect(35,44,4,4,shS);
 for(let i=0;i<5;i++){px(19+i,37+i,'#F4F2EA');px(28-i,37+i,'#F4F2EA')}         // collar V
 if(L.belt){rect(23,39,2,9,L.belt);px(23,47,shade(L.belt,.75));px(24,47,shade(L.belt,.75))}  // tie
 if(L.coat){rect(9,40,6,8,shS);rect(33,40,6,8,shS)}
 // long hair falls behind the shoulders
 if(style==='long'){rect(11,12,6,30,hrS);rect(31,12,6,30,hrS)}
 // neck + head + ears
 rect(20,31,8,7,skS);oval(24,20,11,13,sk);oval(12.5,22,1.6,2.6,sk);oval(35.5,22,1.6,2.6,sk);
 rect(14,28,20,1,null);oval(24,20,11,13,sk,8,33);
 for(let y=26;y<=32;y++)px(13+Math.max(0,y-26),y,null),px(35-Math.max(0,y-26),y,null);  // jaw taper
 oval(24,20,11,13,sk,8,25);
 // hair
 const top=()=>{oval(24,15,12,9,hr,0,14)};
 if(style==='short'){top();rect(13,13,3,6,hr);rect(32,13,3,6,hr);for(let x=15;x<34;x+=3)rect(x,14,2,2,hr)}
 if(style==='long'){top();rect(12,12,4,16,hr);rect(32,12,4,16,hr);rect(15,13,18,3,hr)}
 if(style==='bob'){top();rect(13,13,22,4,hr);rect(12,13,4,16,hr);rect(32,13,4,16,hr);rect(13,28,3,2,hrS);rect(32,28,3,2,hrS)}
 if(style==='bun'){top();oval(24,4.5,4.5,4,hr);rect(14,13,3,4,hr);rect(31,13,3,4,hr)}
 if(style==='spiky'){top();for(let k=0;k<6;k++){const x=13+k*4;for(let y=0;y<5;y++){const w=Math.min(4,y+1);rect(x+((4-w)/2|0),4+y,w,1,hr)}}rect(13,13,22,2,hr)}  // spikes point up: a 1px tip widening to the head
 if(style==='bald'){rect(12,17,3,7,hr);rect(33,17,3,7,hr)}
 if(L.cap){oval(24,12,12,7,L.cap,0,13);rect(12,12,24,2,L.cap);rect(24,13,14,2,shade(L.cap,.75))}
 // face
 const eyeY=21,ex=[19,29],D='#1B1E2B',WH='#FFFFFF',brow=hrS;
 const brows=(dl,dr)=>{rect(ex[0]-1,17+dl,4,1,brow);rect(ex[1]-1,17+dr,4,1,brow)};
 if(face==='happy'){brows(0,0);for(const x of ex){px(x-1,eyeY+1,D);px(x,eyeY,D);px(x+1,eyeY,D);px(x+2,eyeY+1,D)}rect(15,25,3,1,'#E9A0A0');rect(30,25,3,1,'#E9A0A0')}
 else if(face==='surprised'){brows(-2,-2);for(const x of ex){rect(x-1,eyeY-1,4,4,D);px(x,eyeY,WH)}}
 else if(face==='sad'){px(ex[0]-1,17,brow);rect(ex[0],16,3,1,brow);rect(ex[1]-1,16,3,1,brow);px(ex[1]+2,17,brow);for(const x of ex){rect(x,eyeY+1,2,2,D)}}
 else if(face==='angry'){rect(ex[0]-1,17,2,1,brow);rect(ex[0]+1,18,2,1,brow);rect(ex[1]-1,18,2,1,brow);rect(ex[1]+1,17,2,1,brow);for(const x of ex)rect(x,eyeY,2,2,D)}
 else if(face==='think'){brows(0,-1);for(const x of ex){rect(x,eyeY,2,2,D);px(x,eyeY,WH)}}
 else if(face==='sleep'){brows(1,1);for(const x of ex)rect(x-1,eyeY+1,4,1,D)}  // asleep: eyes closed
 else {brows(0,0);for(const x of ex){rect(x,eyeY,2,3,D);px(x,eyeY,WH)}}
 if(L.lashes){px(ex[0]-1,eyeY-1,D);px(ex[1]+2,eyeY-1,D)}
 // mouth
 const lip=L.lips||shade(L.skin,.68),mo='#5A2230';
 if(open){if(face==='surprised'||face==='sleep')rect(22,27,face==='sleep'?3:4,face==='sleep'?3:4,mo);else{rect(21,27,6,3,mo);rect(22,29,4,1,'#D9707F')}}
 else if(face==='happy'){px(20,27,lip);rect(21,28,6,1,lip);px(27,27,lip)}
 else if(face==='sad'){px(20,29,lip);rect(21,28,6,1,lip);px(27,29,lip)}
 else if(face==='surprised')rect(23,27,2,2,mo);
 else if(face==='think')rect(23,28,4,1,lip);
 else rect(21,28,6,1,lip);
 if(L.beard){for(let y=27;y<=32;y++)for(let x=14;x<35;x++)if(g[y][x]===sk&&!(y<=29&&x>=20&&x<=27))px(x,y,L.beard)}
 // outline everything
 const out=g.map(r=>r.slice());
 for(let y=0;y<W;y++)for(let x=0;x<W;x++)if(!g[y][x]&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>g[y+dy]&&g[y+dy][x+dx]))out[y][x]=O;
 return out;
}
function drawPortrait(cv,L,face,open){
 const c=cv.getContext('2d');c.clearRect(0,0,48,48);
 if(L.art){ // custom sprite: its own down frame, enlarged
  // custom sprite: a bust — scale it to fill the width and show the top (head and shoulders), cut at the frame's bottom
  const all=(L.art.down||[]),w=all[0]?.length||16,k=Math.max(1,Math.floor(48/w)),rows=all.slice(0,Math.min(all.length,Math.ceil(48/k)));
  const top=Math.max(0,48-rows.length*k);
  rows.forEach((r,y)=>[...r].forEach((ch,x)=>{const col=L.art.pal[ch];if(col&&ch!=='.'){c.fillStyle=col;c.fillRect(24-w*k/2+x*k|0,top+y*k,k,k)}}));return}
 const g=portraitGrid(L,face,open);
 for(let y=0;y<48;y++)for(let x=0;x<48;x++)if(g[y][x]){c.fillStyle=g[y][x];c.fillRect(x,y,1,1)}
}
function lookFor(who){ // speaker name → look: an NPC of this chapter with that name
 if(!who||who==='…')return null;
 const ok=L=>L&&(L.art||(L.skin&&L.hair&&L.shirt))?L:null;  // humans and custom sprites get a portrait; simple robots (kind:'andy') don't
 // the character you're talking to first (names like '1학년 학생' are shared), then one in this room, then anyone in the chapter
 if(dlg&&dlg.npc&&dlg.npc.name===who&&ok(dlg.npc.look))return dlg.npc.look;
 for(const n of live())if(n.name===who&&ok(n.look))return n.look;
 for(const n of Object.values(C.NPC||{}))if(n.name===who&&ok(n.look))return n.look;
 if(C.FOLLOW&&C.FOLLOW.name===who)return ok(C.FOLLOW.look);
 return null;
}
function faceFor(s,text){ // expression for a line: explicit face, else a guess from the punctuation
 if(s.face)return s.face;
 {const n=dlg&&dlg.npc;if(n&&n.sleep&&(!s.who||s.who===n.name))return 'sleep'}  // someone asleep (NPC sleep:1) talks in their sleep with their eyes shut, review lines and replies too
 if(s.ask||/^…|…$/.test(text))return 'think';
 if(/[?!]{2}|!\?/.test(text))return 'surprised';
 if(/!$/.test(text.trim()))return 'happy';
 return 'idle';
}
let portraitAnim=null;
function setPortrait(s,text){
 clearInterval(portraitAnim);const cv=$('face');if(!cv)return;const L=s.look||lookFor(s.who||dlg.name);  // a line can bring its speaker's look (two people with the same name)
 $('dlg').classList.toggle('hasface',!!L);if(!L){cv.hidden=true;return}
 cv.hidden=false;const face=faceFor(s,text);let open=false;drawPortrait(cv,L,face,false);
 portraitAnim=setInterval(()=>{if(!typing||typing.finished){clearInterval(portraitAnim);drawPortrait(cv,L,face,false);return}
  open=!open;drawPortrait(cv,L,face,open)},130);
}
const palCache=new WeakMap();
/* props an NPC can hold (NPC hold:'phone', or a function of the story). A chapter adds its own in C.PROPS. Drawn over the
   hands of a standing character; facing away, the prop is hidden behind them. */
const PROPS={
 phone:(X,Y,dir)=>{if(dir==='up')return;const x=dir==='left'?X+3:dir==='right'?X+10:X+6;r(x,Y+9,3,5,'#23262D');r(x+1,Y+10,1,3,'#8FD3EA')},
};
function drawChar(L,X,Y,dir,step){
 if(L.draw){L.draw(L,X,Y,dir,step);return}  // look.draw(look,X,Y,dir,step): a game that keeps its own character drawing (단어 마을)
 if(L.art){drawCustom(L,X,Y,dir,step);return}
 let pal=palCache.get(L);if(!pal){pal=humanPal(L);palCache.set(L,pal)}
 shadow(X,Y);drawArt(humanArt(L,dir,step),pal,X,Y,dir==='right');
}
/* custom sprites: look.art = {pal:{key:color}, down:[rows], up:[rows], left:[rows], walk?:{down:[[rows],[rows]],…}} — any height ≤ 32 */
/* how far above a 16px head the quest marker must sit for a taller custom sprite */
function artLift(L){const A=L&&L.art;if(!A)return 0;const rows=A.down||A.left||A.up;return Math.max(0,rows.length-16)}
/* sitting: chair = a look whose art draws under the sitter. The sitter keeps its top art.keep rows (default 12: head to belt; 14
   adds the lap of someone facing the camera) and sinks art.drop px (default 2; facing a table, enough for the lap to meet it).
   art.lift raises the whole seat, sitter included (a stool pulled up to the table in the row above).
   The chair's bottom art.back rows (backrest and legs of a chair facing away from the camera) draw again over the sitter.
   Chair art is bottom-aligned in the tile like every sprite, so it never reaches into the next row. */
function drawSeated(L,X,Y,dir,chair){
 const view=dir==='right'?'left':dir,A=L.art;
 const rows=A?(A[view]||A.down):humanArt(L,dir,0);
 let pal=A?A.pal:palCache.get(L);if(!pal){pal=humanPal(L);palCache.set(L,pal)}
 const C=chair&&chair.art,cr=C&&(C.down||C.up),cx=C?X+Math.floor((16-cr[0].length)/2):0,d=C&&C.drop!=null?C.drop:2,k=C&&C.keep||12;
 if(C&&C.lift)Y-=C.lift;  /* lift: the whole seat sits higher, e.g. pulled up to the edge of the table above */
 if(C)drawArt(cr,C.pal,cx,Y,false);else shadow(X,Y);
 drawArt(rows.slice(0,k),pal,X+Math.floor((16-rows[0].length)/2),Y-16+k+d,dir==='right');
 if(C&&C.back)drawArt(cr.slice(-C.back),C.pal,cx,Y,false);
}
function drawCustom(L,X,Y,dir,step){
 const A=L.art,view=dir==='right'?'left':dir;
 const rows=(step&&A.walk&&A.walk[view]&&A.walk[view][step-1])||A[view]||A.down;
 shadow(X,Y,rows[0].length>16?12:8);drawArt(rows,A.pal,X+Math.floor((16-rows[0].length)/2),Y,dir==='right');
}
function drawAndy(L,X,Y,dir,step,t){
 const ol='#1B1E2B';
 g.fillStyle='rgba(0,0,0,.22)';g.fillRect(X+3,Y+14,10,2);
 r(X+5,Y+11,2,4,ol);r(X+9,Y+11,2,4,ol);
 r(X+3,Y+6,10,7,ol);r(X+4,Y+7,8,5,L.body);r(X+6,Y+8,4,2,'#5F6B72');
 r(X+3,Y+0,10,7,ol);r(X+4,Y+1,8,5,L.body);
 if(dir!=='up'){const blink=Math.floor(t/1700)%8===0;const vx=dir==='left'?X+4:dir==='right'?X+6:X+5;r(vx,Y+3,6,blink?1:2,L.visor)}
 r(X+7,Y-2,2,2,ol);r(X+7,Y-3,2,1,Math.floor(t/500)%2?L.visor:'#5F6B72');
}
const pet={x:0,y:0,fx:0,fy:0,dir:'down',on:false};
const petOn=()=>!!(C.FOLLOW&&C.FOLLOW.when());
function petReset(){pet.x=pet.fx=player.x;pet.y=pet.fy=player.y;pet.dir=player.dir}

function marker(X,Y,t,st){
 if(!st)return;
 if(Y+CAM.y<11){X+=11;Y=11-CAM.y}  // no room above them on the map (the top row: no camera can show a marker there): it sits beside their head and moves with them, so it never jumps while the camera scrolls
 if(G.marker){G.marker(X,Y,t,st);return}  // a game's own ! ? ★ (GAME.marker(X,Y,t,state))
 const bob=Math.round(Math.sin(t/220)*1.5);
 if(st==='todo'){r(X+6,Y-9+bob,4,8,'#1B1E2B');r(X+7,Y-8+bob,2,4,'#E8962A');r(X+7,Y-3+bob,2,1,'#E8962A')}
 else if(st==='review'){const y=Y-10+bob;r(X+5,y,6,9,'#1B1E2B');r(X+6,y+1,4,7,'#69CFD8');r(X+7,y+2,2,1,'#0F141A');r(X+8,y+3,1,1,'#0F141A');r(X+7,y+4,1,1,'#0F141A');r(X+7,y+6,1,1,'#0F141A')}
 else if(st==='wait'){const y=Y-5+bob;[5,7,9].forEach((dx,i)=>r(X+dx,y,1,1,Math.floor(t/300)%3===i?'#FFFFFF':'#93A09A'))}
 else{const y=Y-9+bob;r(X+7,y,2,2,'#E8962A');r(X+4,y+2,8,2,'#E8962A');r(X+5,y+4,6,1,'#E8962A');r(X+5,y+5,2,2,'#E8962A');r(X+9,y+5,2,2,'#E8962A');r(X+7,y+2,2,2,'#F6D9A6')}
}
function status(n){
 if(n.status){const v=n.status();if(v!==undefined)return v}
 if(C.REVIEW&&reviewLines(n).length){const own=usual(n);return (n.script&&n.script())||!own||own.some(moves)?null:'review'}  // anyone with a line for a due word, badge or not, when the talk would be the review
 if(!n.badge)return null;
 if(!n.badge.every(has))return 'todo';
 if(!C.REVIEW&&n.badge.some(isDue))return n.script&&n.script()?null:'review';  // a ? only when talking reviews (their script lines come first and skip it)
 return n.badge.every(w=>lv(w).b>=3)&&!(state.starDone||{})[npcId(n)]?'star':null;  // ★: all their words mastered — shown a while, then it fades for good (starFade)
}
/* the ★ over someone whose words you've all mastered: on screen for STAR_MS, or until you talk to them, then it fades out and stays gone */
const STAR_MS=18000,STAR_FADE=2000,starAcc={};let starT=0,starDt=0;
function starFade(n){const id=npcId(n),a=starAcc[id]=(starAcc[id]||0)+starDt,al=a<STAR_MS?1:1-(a-STAR_MS)/STAR_FADE;if(al<=0){(state.starDone=state.starDone||{})[id]=1;save();return 0}return al}

/* ---------- player, movement, zones ---------- */
const D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const OPP={up:'down',down:'up',left:'right',right:'left'};
const CREW_LOOK=G.player||{hair:'#2A2F4A',skin:'#F1C9A5',shirt:'#F4F2EA',pants:'#2B3A5C',belt:'#9B2D30'};  // the game's default player look
/* 나 꾸미기: the player's own look (hair style/colour, skin, lashes/lips) over the school uniform; saved once for every chapter */
const ME_KEY=KEY('me');let me=null;try{me=JSON.parse(store.get(ME_KEY)||'null')}catch(e){}
const myLook=(base=CREW_LOOK)=>me?{...base,...me}:base;   // a chapter's PLAYER object = the uniform; the player's choices = hair, skin, face
const player={x:0,y:0,dir:'down',moving:false,t:0,fx:0,fy:0,step:0,look:myLook()};
let held=null,warping=false,lockMsgAt=0;
function npcPos(n){return n.pos?n.pos():n.at||[n.x,n.y]}  // n.at: where a move: step left them
const sitting=n=>typeof n.sit==='function'?n.sit():!!n.sit;  // NPC sit: true | fn → drawn seated (on n.chair, a look, if given), and doesn't turn to talk
/* step sit:{npc} sits the player on that NPC's tile (a chair), facing its dir; sit:{x,y,dir,chair} anywhere. The first arrow key stands
   them up. The saved position stays where they stood, so a reload never puts them inside the chair. */
function sitDown(o){
 const n=o.npc?C.NPC[o.npc]:null,[x,y]=n?npcPos(n):[o.x,o.y];
 const go=()=>Object.assign(player,{x,y,dir:o.dir||(n&&(n.home||n.dir))||player.dir,moving:false,t:0,sit:{npc:n,chair:o.chair||(n&&n.look)||null}});
 if(Math.abs(player.x-x)+Math.abs(player.y-y)>1){$('fade').classList.add('on');setTimeout(()=>{go();$('fade').classList.remove('on')},230)}  // from further off: a cut, not a jump
 else go();
}
const live=()=>NPCS.filter(n=>!n.hide||!n.hide());
const npcAt=(x,y)=>live().find(n=>{const [a,b]=npcPos(n);return a===x&&b===y});
const warpAt=(x,y)=>Z.warps&&Z.warps[x+','+y];
const walkable=(x,y)=>{const c=at(x,y);return c!=null&&!!(Z.legend[c]||{}).walk};
const blocked=(x,y)=>!walkable(x,y)||!!npcAt(x,y);
const CREATOR=!!document.getElementById('mePanel');  // 나 꾸미기 only where the page has the panel
const panelOpen=()=>(CREATOR&&!$('mePanel').hidden)||!$('startPanel').hidden||!$('panel').hidden||!$('chPanel').hidden||!$('talkPanel').hidden||!$('tapPanel').hidden||(!!$('repPanel')&&!$('repPanel').hidden);

function tryMove(){
 if(player.moving||!held||dlg||panelOpen()||warping)return;
 player.sit=null;
 const was=player.dir;player.dir=held;const [dx,dy]=D[held];const nx=player.x+dx,ny=player.y+dy;
 if(petOn()&&pet.x===nx&&pet.y===ny&&was!==held)return;  // the follower right there: a press turns you to face them (A talks); pressing again swaps places
 const w=warpAt(nx,ny);const lock=w&&w.lock&&w.lock();
 if(lock){if(performance.now()-lockMsgAt>1500){lockMsgAt=performance.now();sfx('lock');toast(lock)}return}
 if(blocked(nx,ny))return;
 player.moving=true;player.t=0;player.fx=player.x;player.fy=player.y;player.x=nx;player.y=ny;player.step=player.step===1?2:1;
 if(petOn()){const ox=player.fx,oy=player.fy;pet.fx=pet.x;pet.fy=pet.y;if(ox!==pet.x||oy!==pet.y)pet.dir=ox>pet.x?'right':ox<pet.x?'left':oy>pet.y?'down':'up';pet.x=ox;pet.y=oy}
}
function arrive(){
 state.x=player.x;state.y=player.y;state.dir=player.dir;save();
 if(C.onStep){C.onStep();updateQuest();save()}  // a chapter that counts steps or starts a scene on a square (단어 마을's cartridges)
 const w=warpAt(player.x,player.y);
 if(w){goZone(w.to,w.x,w.y,w.dir);return true}
 showRoom();return false;
}
function goZone(id,x,y,dir){
 warping=true;sfx('door');$('fade').classList.add('on');
 setTimeout(()=>{loadZone(id,x,y,dir);updateQuest();save();$('fade').classList.remove('on');if(held&&held!==dir)held=null;setTimeout(()=>{warping=false;if(!greet())tryMove()},120)},230);  // turned around by the warp: let go of the held direction
}
function loadZone(id,x,y,dir){
 ZID=id;Z=C.ZONES[id];state.zone=id;
 MAP=Z.map.map(row=>row.split(''));MW=MAP[0].length;MH=MAP.length;
 NPCS=Z.npcs.map(k=>C.NPC[k]);NPCS.forEach(n=>{n.home=n.home||n.dir;n.turnAt=performance.now()+2000+Math.random()*3000});
 Object.assign(player,{x,y,dir,moving:false,t:0,sit:null});camT=null;camF=null;state.x=x;state.y=y;state.dir=dir;
 petReset();pet.on=false;ghosts=[];
 $('reg').textContent=`${Z.reg} · ${CH.n} ${CH.title}`;fitReg();showRoom(true);
}
let roomName='';
function showRoom(force){
 let nm=Z.name;(Z.rooms||[]).forEach(([a,b,c,d,n])=>{if(player.x>=a&&player.x<=c&&player.y>=b&&player.y<=d)nm=n});
 if(nm!==roomName||force){roomName=nm;const z=$('zone');z.textContent=nm;if(!dlg)z.classList.remove('dim');clearTimeout(showRoom.t);showRoom.t=setTimeout(()=>z.classList.add('dim'),1500)}  // fades so it never hides a ! marker
}
function update(dt,t){
 if(player.moving){player.t+=dt/(170*(Z.slow||1)); /* Z.slow > 1 = heavy gravity */if(player.t>=1){player.t=0;player.moving=false;if(!arrive())tryMove()}}
 else tryMove();
 if(!dlg)live().forEach(n=>{if(n.still||n.pos||n.walk||sitting(n))return;if(t>n.turnAt){if(chatPair(n)){n.dir=n.home;n.turnAt=t+3000;return}  /* mid-conversation: no glancing around */
  const ds=['down','left','right',n.home,n.home];n.dir=ds[Math.random()*ds.length|0];n.turnAt=t+2500+Math.random()*3500}});
 $('btnA').classList.toggle('ready',!dlg&&!player.moving&&!!facing());
 {const idle=!!dlg&&(choosing()||building())&&sel<0;if($('btnA').dataset.idle!==String(idle)){$('btnA').dataset.idle=idle;$('btnA').style.opacity=idle?'.45':''}}  // a question with nothing selected: A would do nothing, so it dims
}
const dark=document.createElement('canvas');dark.width=cv.width;dark.height=cv.height;const dg=dark.getContext('2d');
/* a scene can point the camera at a tile (step cam:[x,y]); it glides there, and back to the player when the step says cam:null
   or the conversation ends */
let camT=null,camF=null,camLast=0,talkCy=null,talkAt=0,talkExtra=0;
/* during a conversation: the camera y that keeps the player and the speaker above the dialogue box, or null when they already
   are. It only ever moves further (never back and forth as the box grows and shrinks line to line) until the conversation ends.
   Near the bottom of a map it may scroll past the edge by as much as the box covers: that strip is behind the box. */
/* canvas px where the plain dialogue box starts (choices and word tiles don't count), with air for one more line; null when no box */
/* ---------- the dialogue box: as tall as its line (typing lays the whole line out first, so it never grows mid-line), its side
   chosen once per conversation when it opens, as Undertale's dialogue code does (box at the top when you stand low on the screen):
   at the bottom unless the tallest box (three lines, the most linecheck allows) would cover you or whoever you're talking to, then
   at the top. The camera doesn't move for talk. A scene's camera cut (step cam:[x,y]) chooses again, for the tile it shows, and
   frames that tile in the space the tallest box would leave free, so shorter and longer lines don't nudge the view. ---------- */
function boxSpan(){const box=$('dlg'),k=cv.clientHeight/cv.height;if(!dlg||box.hidden||!k)return null;
 return [box.offsetTop/k,(box.offsetTop+box.offsetHeight)/k]}  // canvas px the box covers (choices and tiles included)
function boxReserve(){const box=$('dlg'),t=$('txt'),k=cv.clientHeight/cv.height,m=t.style.minHeight;  // canvas px of the box with three full lines
 t.style.minHeight=3*(parseFloat(getComputedStyle(t).lineHeight)||parseFloat(getComputedStyle(t).fontSize)*1.5)+'px';const h=box.offsetHeight/k;t.style.minHeight=m;return h}
function freeBand(){const b=boxSpan();if(!b)return [0,VH*TS];const h=Math.max(b[1]-b[0],dlg.boxH||0);  // the view's part the tallest box leaves free
 return dlg.atTop?[b[0]+h+4,VH*TS]:[0,b[1]-h-4]}
function placeBox(rows,camY){
 const box=$('dlg'),k=cv.clientHeight/cv.height;if(!dlg||!k)return;
 box.classList.remove('attop');dlg.atTop=false;
 dlg.boxH=Math.max(box.offsetHeight/k,boxReserve());const h=dlg.boxH+6,cy=camY??CAM.y;
 const feet=Math.max(...rows)*TS+16-cy;  // the lowest feet on screen
 if(feet>VH*TS-h){box.classList.add('attop');dlg.atTop=true}
}
function talkRows(){const rows=[player.y],n=dlg&&dlg.npc;if(n&&NPCS.includes(n)&&(!n.hide||!n.hide()))rows.push(npcPos(n)[1]);return rows}
function talkLift(){return null}  // talk never moves the camera (the box chooses its side instead)
/* sing: true | fn on an NPC → three little ♪ rise from above their head, drift and fade, while it's true (a song on air) */
function singNotes(x,y,t,seed){
 for(let i=0;i<3;i++){const p=(t/1600+i/3+seed*.13)%1,X=x+Math.round(Math.sin(p*5+i*2)*3)+(i-1)*4,Y=y-Math.round(p*16);
  g.globalAlpha=p<.2?p/.2:1-(p-.2)/.8;
  const note=(c,o)=>{r(X+o,Y+o+4,3,2,c);r(X+o+2,Y+o,1,5,c);r(X+o+3,Y+o+1,1,1,c);r(X+o+4,Y+o+2,1,1,c)};note('#2B2E36',1);note('#FFF3C4',0)}  // shadow, then the note
 g.globalAlpha=1}
function render(t){
 starDt=starT?Math.min(100,t-starT):0;starT=t;
 const px=player.moving?player.fx+(player.x-player.fx)*player.t:player.x;
 const py=player.moving?player.fy+(player.y-player.fy)*player.t:player.y;
 const [fx,fy]=camT||[px,py];
 let cx=fx*TS+8-VW*TS/2,cy=fy*TS+8-VH*TS/2;
 if(dlg)talkAt=t;else if(talkCy!=null&&t-talkAt>700){talkCy=null;talkExtra=0;camF={...CAM}}  // glide back, never snap  /* held a moment after it ends: a follow-up note (단어 일지) doesn't make it dip and rise */
 const cyMap=Math.max(0,Math.min(cy,MH*TS-VH*TS));  // where the camera would be without a conversation (inside the map)
 if(!camT&&talkCy!=null||!camT&&dlg){const l=dlg?talkLift(cyMap,py):null;if(l!=null)talkCy=Math.max(talkCy??-1e9,l);if(talkCy!=null)cy=Math.max(cyMap,talkCy)}
 let camLift=false;if(camT&&dlg){const [b0,b1]=freeBand();cy=fy*TS+8-(b0+b1)/2;camLift=true}  // a scene's camera target sits in the space above the dialogue box, not behind it
 cx=Math.max(0,Math.min(cx,MW*TS-VW*TS));cy=Math.max(0,Math.min(cy,MH*TS-VH*TS));
 const dt=Math.min(50,t-camLast);camLast=t;
 if(camT||camF||talkCy!=null){if(!camF)camF={...CAM};const k=1-Math.exp(-dt/(camT?180:260));  /* talk shifts glide a little slower */camF.x+=(cx-camF.x)*k;camF.y+=(cy-camF.y)*k;
  if(!camT&&Math.abs(cx-camF.x)<.5&&Math.abs(cy-camF.y)<.5)camF=null;else{cx=camF.x;cy=camF.y}}
 cx=Math.round(cx);cy=Math.round(cy);CAM={x:cx,y:cy};
 const x0=Math.floor(cx/TS),y0=Math.floor(cy/TS);
 for(let y=y0;y<=y0+VH;y++)for(let x=x0;x<=x0+VW;x++)tile(x,y,x*TS-cx,y*TS-cy,t);
 // the chair the player sits on is drawn with the player
 const ents=live().filter(n=>!(player.sit&&player.sit.npc===n)).map(n=>{const wk=walkAt(n,t);if(wk){const [wx,wy,wd,wf]=wk;return {y:wy,f:()=>drawChar(n.look,Math.round(wx*TS-cx),Math.round(wy*TS-cy-2),wd,wf)}}
  const [nx,ny]=npcPos(n);return {y:ny,f:()=>{const X=nx*TS-cx,Y=ny*TS-cy-2;
   if(n.look)n.kind==='andy'?drawAndy(n.look,X,Y,n.dir,0,t):sitting(n)?drawSeated(n.look,X,Y,n.dir,n.chair):drawChar(n.look,X,Y,n.dir,0);
   {const h=typeof n.hold==='function'?n.hold():n.hold,p=h&&((C.PROPS||{})[h]||PROPS[h]);if(p)p(X,Y,n.dir,t)}  // hold: a prop in their hands
   if(n.sleep)for(let i=0;i<2;i++){const p=(t/900+i/2)%1,zx=X+11+Math.round(p*4),zy=Y-2-Math.round(p*10),c='#2E3550';g.globalAlpha=1-p*.7;r(zx,zy,4,1,c);r(zx+2,zy+1,1,1,c);r(zx+1,zy+2,1,1,c);r(zx,zy+3,4,1,c);g.globalAlpha=1}  // asleep: z's drifting up
   // no marker over the player standing just above, over the one you're talking to (or whoever a proxy stands for), or when nomark says so
   const talking=dlg&&(dlg.npc===n||(n.proxy&&dlg.npc===n.proxy())),off=typeof n.nomark==='function'?n.nomark():n.nomark;
   if(!(player.x===nx&&player.y<ny&&player.y>=ny-1-Math.ceil(artLift(n.look)/TS))&&!talking&&!off){const st=status(n),al=st==='star'?starFade(n):1;if(al>0){g.globalAlpha=al;marker(X+(n.markDx||0),Y-artLift(n.look)+(n.markDy??(n.look?0:7)),t,st);g.globalAlpha=1}}}}});  // no look (a stand-in for an object: a chair, a shelf, embers): the mark sits on its own tile, not over whatever is above it
 ghosts=ghosts.filter(gh=>{const wk=walkAt(gh,t);if(!wk)return false;const [wx,wy,wd,wf]=wk;ents.push({y:wy,f:()=>drawChar(gh.look,Math.round(wx*TS-cx),Math.round(wy*TS-cy-2),wd,wf)});return true});
 const walk=player.moving?(player.t<.5?player.step:0):0;
 if(petOn()){
  if(!pet.on){petReset();const n=dlg&&dlg.npc;if(n&&n.name===C.FOLLOW.name){const [x,y]=npcPos(n);pet.x=pet.fx=x;pet.y=pet.fy=y;pet.dir=n.dir}  // joining you in a talk ("앞장서"): from where they stood, not from your square
   else{const [dx,dy]=D[player.dir],b=[[-dx,-dy],[dy,dx],[-dy,-dx]].map(([ax,ay])=>[player.x+ax,player.y+ay]).find(([x,y])=>walkable(x,y)&&!npcAt(x,y));if(b){pet.x=pet.fx=b[0];pet.y=pet.fy=b[1]}}  // after a door: one step behind you (or beside), not hidden on your square until you move
   pet.on=true}
  const qx=player.moving?pet.fx+(pet.x-pet.fx)*player.t:pet.x,qy=player.moving?pet.fy+(pet.y-pet.fy)*player.t:pet.y;
  if(player.moving||pet.x!==player.x||pet.y!==player.y)ents.push({y:qy-.01,f:()=>drawChar(C.FOLLOW.look,Math.round(qx*TS-cx),Math.round(qy*TS-cy-2),pet.dir,walk?3-walk:0)});  // not while it shares your square
 }else pet.on=false;
 const plook=typeof C.PLAYER==='function'?(C.PLAYER()||myLook()):player.look; // PLAYER may be a function → the look can change mid-chapter (disguises)
 const overTall=live().some(n=>{const [nx,ny]=npcPos(n);return nx===player.x&&ny===player.y+1&&artLift(n.look)>=6});  // just above someone tall: drawn over their head, never hidden behind them
 ents.push({y:overTall?py+1.02:py,f:()=>{const X=Math.round(px*TS-cx),Y=Math.round(py*TS-cy-2);player.sit?drawSeated(plook,X,Y,player.dir,player.sit.chair):drawChar(plook,X,Y,player.dir,walk)}});
 ents.sort((a,b)=>a.y-b.y).forEach(e=>e.f());
 // a legend entry's `front` tile (tree canopies) draws after the characters, unclipped: it overhangs and covers whoever walks behind it
 for(let y=y0-4;y<=y0+VH;y++)for(let x=x0-4;x<=x0+VW;x++){const c=at(x,y),L=c!=null&&Z.legend[c];if(L&&L.front&&TILES[L.front])TILES[L.front](x*TS-cx,y*TS-cy,x,y,t)}
 for(const n of live())if(typeof n.sing==='function'?n.sing():n.sing){const [nx,ny]=npcPos(n);singNotes(Math.round(nx*TS-cx)+6,Math.round(ny*TS-cy)-10,t,nx*7+ny)}  // someone singing
 /* lights out in a broken room: everything goes dark except a small circle around the player */
 const dk=Z.dark&&Z.dark();
 if(dk){
  const [a,b,c,d]=dk;dg.clearRect(0,0,dark.width,dark.height);
  dg.globalCompositeOperation='source-over';dg.fillStyle='rgba(4,6,10,.9)';dg.fillRect(a*TS-cx,b*TS-cy-4,(c-a+1)*TS,(d-b+1)*TS+4);
  const flick=Math.random()<.04?4:0;
  const lx=px*TS-cx+8,ly=py*TS-cy+6;const gr=dg.createRadialGradient(lx,ly,6,lx,ly,34-flick);
  gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');
  dg.globalCompositeOperation='destination-out';dg.fillStyle=gr;dg.beginPath();dg.arc(lx,ly,34,0,Math.PI*2);dg.fill();
  g.drawImage(dark,0,0);
  if(Math.floor(t/600)%2){r(a*TS-cx+2,b*TS-cy+1,3,2,'#D2533F');r(c*TS-cx+11,b*TS-cy+1,3,2,'#D2533F')}
 }
}
/* scripted walks. walk:{npc,from}: the NPC appears at `from` and walks to its own spot (e.g. the class president going back to her desk).
   leave:{npc,to}: the NPC (hidden by the same step's flag) walks from its spot to `to` and is gone (out a door, off the map). */
let walks=[],leaves=[],ghosts=[];const WALK_MS=230;
function walkPath([fx,fy],[tx,ty],self){
 const k=(x,y)=>x+','+y,prev={[k(fx,fy)]:null},q=[[fx,fy]];
 while(q.length){const [x,y]=q.shift();if(x===tx&&y===ty)break;
  for(const [dx,dy] of Object.values(D)){const a=x+dx,b=y+dy,kk=k(a,b);if(kk in prev)continue;
   if(!(a===tx&&b===ty)&&(!walkable(a,b)||live().some(o=>o!==self&&npcPos(o)[0]===a&&npcPos(o)[1]===b)))continue;prev[kk]=[x,y];q.push([a,b])}}
 let end=[tx,ty];  // blocked (someone stands in the doorway)? walk as close as possible, then step in / vanish
 if(!(k(tx,ty) in prev)){let best=1e9;for(const kk in prev){const [a,b]=kk.split(',').map(Number),d=Math.abs(a-tx)+Math.abs(b-ty);if(d<best){best=d;end=[a,b]}}}
 const path=[];for(let c=end;c;c=prev[k(...c)])path.unshift(c);return path;
}
/* move:{npc,to:[x,y],dir}: mid-conversation, on that line, the NPC walks from where it stands to `to` and stays there (찬 crossing the
   room to apologise). One or a list. The spot lasts until the chapter reloads; a chapter that needs it to survive a reload gives the NPC pos(). */
function moveNpcs(s){[].concat(s.move).forEach(m=>{const n=C.NPC[m.npc];if(!n)return;const from=npcPos(n);n.at=m.to;
 const path=walkPath(from,m.to,n);if(m.dir)n.home=m.dir;n.walk=path.length>1?{path,t0:performance.now(),end:m.dir||n.dir}:null;if(!n.walk&&m.dir)n.dir=m.dir})}
function queueWalks(s){  // one or a list each
 // arrivals wait for the conversation to close (until then they stand where they start, no pop to the end spot first)
 [].concat(s.walk||[]).forEach(w=>{const n=C.NPC[w.npc];if(!n)return;walks.push(w);n.walk={path:[w.from],hold:1,end:n.dir}});
 // a leave starts at once, on the line that narrates it ("후다닥 나갔어요"), so nobody lingers after the text says they left
 [].concat(s.leave||[]).forEach(w=>{const n=C.NPC[w.npc];if(!n||!NPCS.includes(n))return;const from=npcPos(n),g={look:n.look,from};
  const path=walkPath(from,w.to,null);if(path.length>1){g.walk={path,t0:performance.now()};ghosts.push(g)}});
}
function startWalks(){
 const t0=performance.now();
 walks.splice(0).forEach(w=>{const n=C.NPC[w.npc];if(!n)return;n.walk=null;if(n.hide&&n.hide())return;
  const path=walkPath(w.from,[n.x,n.y],n);if(path.length>1)n.walk={path,t0,end:n.dir}});
 leaves.splice(0).forEach(([w,g])=>{const path=walkPath(g.from,w.to,null);if(path.length>1)g.walk={path,t0};else ghosts=ghosts.filter(x=>x!==g)});
}
function walkAt(n,t){ // → [x,y,dir,frame] while walking, null when arrived
 const w=n.walk;if(!w)return null;if(w.hold)return [w.path[0][0],w.path[0][1],w.dir||w.end||n.dir||'down',0];const p=Math.max(0,(t-w.t0)/WALK_MS),i=Math.floor(p);  // a frame can be stamped just before the walk began
 if(i>=w.path.length-1){n.walk=null;if(w.end)n.dir=w.end;return null}
 const [ax,ay]=w.path[i],[bx,by]=w.path[i+1],f=p-i;
 const dir=bx>ax?'right':bx<ax?'left':by>ay?'down':'up';
 return [ax+(bx-ax)*f,ay+(by-ay)*f,dir,f<.5?(i%2?1:2):0];
}
let last=performance.now();
function loop(t){const dt=Math.min(50,t-last);last=t;if(Z){update(dt,t);render(t)}requestAnimationFrame(loop)}

/* ---------- dialogue ---------- */
let dlg=null,typing=null,pending=null,sel=0;
/* ---------- phone screen and 문화 노트 (both optional: a game's shell opts in with #phonePanel/#pscr and #notes/#noteCard) ----------
   Step phone:{app, post, by, when, count, comments:[[name,text],…], time, battery, culture}: an app on someone's phone fills the game
   view on that line (the D-pad and A/B stay below): the D-pad scrolls it, A finishes the line and then closes it, B closes it, and its
   words are tappable. A step's culture:'id' (or a phone's, when it closes) adds a 문화 노트 from globalThis.CULTURE_NOTES (a game's data:
   {id:{t, lines:[[korean, english, [source numbers]]…], src:[[title, url]…]}}): the culture behind a story moment, every line tied
   to its sources, read in the journal. */
let phoneOpen=false,curPhone=null;
function openPhone(p){
 if(!$('phonePanel'))return;curPhone=p;
 const bars='<i class="sig"><b></b><b></b><b></b><b class="off"></b></i>',bat=p.battery??60;
 if(p.photo){  // an album photo: a pixel picture (a look's portrait, made old) with its caption
  $('pscr').innerHTML=`<div class="pstat"><span>${p.time||'12:30'}</span><span class="pst">LTE${bars}${bat}%<i class="bat"><i style="width:${bat}%"></i></i></span></div>`
   +`<div class="pbar"><span>${p.app||'사진'}</span><span>●●●</span></div><div class="pphoto${p.photo.old?' old':''}"><canvas width="48" height="48"></canvas><div class="pcap txt">${glossHTML(p.photo.caption||'')}</div></div>`;
  const cv=$('pscr').querySelector('canvas');drawPortrait(cv,p.photo.look,p.photo.face||'happy',false);
  if(p.photo.mic){const c=cv.getContext('2d');const R=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h)};R(33,27,7,7,'#1B1E2B');R(34,28,5,5,'#8A8E96');R(35,29,1,1,'#C9CDD4');R(35,34,3,14,'#1B1E2B');R(36,34,1,14,'#3A3E48')}  // a microphone in front
  $('phonePanel').hidden=false;phoneOpen=true;return}
 const c=p.comments.map(([n,t])=>`<div class="pc"><span class="pn">${n}</span><span class="pt txt">${glossHTML(t)}</span></div>`).join('');
 const more=p.count-p.comments.length;
 $('pscr').innerHTML=`<div class="pstat"><span>${p.time||'12:30'}</span><span class="pst">LTE${bars}${bat}%<i class="bat"><i style="width:${bat}%"></i></i></span></div>`
  +`<div class="pbar"><span>${p.app}</span><span>●●●</span></div><div class="ppost"><b class="txt">${glossHTML(p.post)}</b><span class="pmeta">${p.by} · ${p.when}</span></div>`
  +`<div class="pcount txt">${glossHTML('댓글 '+p.count+'개')}</div><div class="plist">${c}${more>0?`<div class="pmore txt">${glossHTML('댓글 '+more+'개 더 보기')}</div>`:''}</div>`;
 $('phonePanel').hidden=false;phoneOpen=true;
}
function closePhone(){if(!phoneOpen)return;phoneOpen=false;$('phonePanel').hidden=true;hideGloss();if(curPhone&&curPhone.culture)unlockCulture(curPhone.culture);curPhone=null}
if($('phonePanel'))$('phonePanel').addEventListener('click',e=>{const w=e.target.closest('.w');if(w){e.stopPropagation();showWord(w)}});
const CULTURE=globalThis.CULTURE_NOTES||{};  // a game's notes (its own file sets globalThis.CULTURE_NOTES)
let cultureSeen=[];try{cultureSeen=JSON.parse(store.get(KEY('culture'))||'[]')}catch(e){}
/* A new note waits on the screen as a tappable chip (#noteChip, made here when the shell has the notes section) until you
   read it: tapping it opens the 일지 on that note. Notes seen before this existed count as read. */
let cultureRead;try{cultureRead=JSON.parse(store.get(KEY('cultureRead'))||'null')}catch(e){}if(!Array.isArray(cultureRead))cultureRead=cultureSeen.slice();
function noteChip(){const el=$('noteChip');if(!el)return;const un=cultureSeen.filter(k=>CULTURE[k]&&!cultureRead.includes(k));
 el.hidden=!un.length;if(un.length){const k=un[un.length-1];el.dataset.k=k;el.innerHTML=`<span>📖 문화 노트 · ${CULTURE[k].t}</span><b>›</b>`}}
function readNote(k){if(!cultureRead.includes(k)){cultureRead.push(k);store.set(KEY('cultureRead'),JSON.stringify(cultureRead))}noteChip()}
function unlockCulture(k){
 if(!CULTURE[k]||cultureSeen.includes(k))return;cultureSeen.push(k);store.set(KEY('culture'),JSON.stringify(cultureSeen));
 setTimeout(()=>{sfx('badge');noteChip()},350);
}
function renderNotes(){
 if(!$('notes'))return;const ks=cultureSeen.filter(k=>CULTURE[k]);
 $('notes').innerHTML=ks.length?ks.map(k=>`<button class="nb" data-k="${k}">${CULTURE[k].t}</button>`).join(''):'<p class="none">아직 없어요.</p>';
 $('noteCard').hidden=true;
}
function showNote(k){
 const n=CULTURE[k],c=$('noteCard');let en=false;
 const draw=()=>{c.innerHTML=`<div class="top"><span class="nt">${n.t}</span><button class="enb" aria-label="English">?</button></div>`
  +`<ol>${n.lines.map(([ko,e,s])=>`<li><span class="txt">${glossHTML(ko)}</span><sup>${s.join(',')}</sup>${en?`<span class="en">${e}</span>`:''}</li>`).join('')}</ol>`
  +`<div class="src"><b>출처</b>${n.src.map(([t,u],i)=>`<span>${i+1}. <a href="${u}" target="_blank" rel="noopener">${t}</a></span>`).join('')}</div>`;
  c.querySelector('.enb').addEventListener('click',e=>{e.stopPropagation();en=!en;draw()})};
 draw();c.hidden=false;c.scrollIntoView({block:'nearest'});readNote(k);
}
if($('notes')){
 $('notes').addEventListener('click',e=>{const b=e.target.closest('.nb');if(b)showNote(b.dataset.k)});
 {const b=document.createElement('button');b.id='noteChip';b.className='notechip';b.type='button';b.hidden=true;$('toast').after(b);
  b.addEventListener('click',e=>{e.stopPropagation();const k=b.dataset.k;openPanel();showNote(k)});noteChip()}
 $('noteCard').addEventListener('click',e=>{const w=e.target.closest('.w');if(w){e.stopPropagation();document.body.classList.add('talkopen');showWord(w)}});  // word help above the journal
 for(const id of ['closePanel','panel'])$(id).addEventListener('click',e=>{if(id==='closePanel'||e.target.id==='panel')document.body.classList.remove('talkopen')});
}

/* a room's greeting: zone greet:'npcId' (or a function returning one, or null) — whoever is there talks to you the moment you walk
   in, before you can move (찬 at the gym door), so a scene can't be met in the wrong order. Also on loading a save in that room, so
   a reload in the middle of it starts it over (its flag is only set on its last line). */
function greet(){
 const g=typeof Z.greet==='function'?Z.greet():Z.greet,n=g&&C.NPC[g];if(!n||!NPCS.includes(n)||(n.hide&&n.hide())||dlg)return false;
 const [nx,ny]=npcPos(n),dx=nx-player.x,dy=ny-player.y;held=null;
 player.dir=Math.abs(dx)>=Math.abs(dy)&&dx?(dx>0?'right':'left'):(dy>0?'down':'up');state.dir=player.dir;  // look at them
 talkWith(n);return true}
function openDialog(name,steps,opts={}){
 steps=steps.filter(s=>!s.when||s.when());
 talkN++;dlg={name,steps:steps.map(s=>({...s})),i:0,cur:null,next:null,missed:new Set(),npc:opts.npc||null,review:!!opts.review};
 $('tag').hidden=!opts.review;$('dlg').hidden=false;$('zone').classList.add('dim');show(dlg.steps[0]);placeBox(talkRows());  // the room label never shows through a box at the top
}
function show(s){
 if(s&&(s.set||s.award||s.give||s.take||s.go)&&dlg)dlg.moved=1;  // a story beat (spaced review counts them)
 if(s&&s.expand){const more=says(s.expand()||[]);dlg.steps.splice(dlg.i,1,...more);if(dlg.i>=dlg.steps.length){closeDialog();return}return show(dlg.steps[dlg.i])}  // expand:()=>steps, made when it's reached (class time picks words you have by then)
 dlg.cur=s;hideGloss();
 lastLines.push(((s.who||dlg.name||'')+': '+plain(s.say||s.ask||'')).slice(0,300));if(lastLines.length>3)lastLines.shift();
 if(s.set){s.set();save()}
 if('black' in s){$('fade').classList.toggle('on',!!s.black);dlg.black=!!s.black}  // black:1 — the line plays over a black screen (a time cut); black:0 or the end of the talk brings the room back
 if(s.walk||s.leave)queueWalks(s);
 if(s.move)moveNpcs(s);
 if(s.phone)openPhone(s.phone);
 if(s.culture)unlockCulture(s.culture);
 if(s.sit)sitDown(s.sit);
 [].concat(s.turn||[]).forEach(o=>{const n=C.NPC[o.npc];if(n){n.dir=o.dir;n.turnAt=performance.now()+60000}});
 if('cam' in s){camT=s.cam||null;if(camT){const cyc=Math.max(0,Math.min(camT[1]*TS+8-VH*TS/2,MH*TS-VH*TS));placeBox([camT[1]],cyc)}else placeBox(talkRows())}
 if(s.go){const [z,x,y,d]=s.go;loadZone(z,x,y,d||'down');talkCy=null;talkExtra=0;save();placeBox(talkRows())}  // a scene that moves you ("다음 날 아침, 학교")
 if(s.sfx||/딩동댕동/.test(s.say||''))sfx(s.sfx||'bell');  /* a step can play a sound; the school bell rings on its own */
 if(s.give){state.items.push(s.give);save();sfx('item');setTimeout(()=>toast('받았어요: '+s.give),200)}
 if(s.take){state.items=state.items.filter(i=>!s.take.includes(i));save()}
 if(s.award)award(s.award);
 if(s.listen)s=prepListen(s);
 $('who').textContent=s.who||dlg.name;
 $('choices').hidden=true;$('choices').innerHTML='';$('build').hidden=true;$('more').hidden=true;
 const text=s.say||s.ask||'';  // a word-order question needs no instruction: the tiles explain themselves
 if(!s.build&&!s.ask)logTalk(s.who||dlg.name,text);  // a question is logged once, as the line it becomes when answered
 typeText(text,()=>{if(s.choose)renderPick(s);else if(s.ask)renderChoices(s);else if(s.build)renderBuild(s);else $('more').hidden=false});
 setPortrait(s,text);
 if(readOn&&!s.listenOnly)speak(s.listen?'':text);
 if(s.listen)setTimeout(()=>speak(s.listenLine||s.listen),readOn?1200:150);
 if(s.take&&!s.set)dlg.questHold=1;else if(s.set)dlg.questHold=0;  // handing an item over: keep the old 목표 until the scene moves the story on (or ends)
 if(!dlg.questHold)updateQuest();
}
function prepListen(s){
 const w=s.listen;const pool=(C.CONFUSE[w]||[]).slice(0,2);
 while(pool.length<2){const o=C.WORDS[Math.random()*C.WORDS.length|0];if(o!==w&&!pool.includes(o))pool.push(o)}
 const again=dlg.npc&&dlg.npc.banmal?`다시 들어 봐. "${w}".`:`다시 들어 보세요. "${w}".`;
 const out=s.listenLine?{...s,ask:s.ask.replace('___','🔊'),done:s.listenLine,own:1,w,opts:[[w,1],...pool.map(p=>[p,0,again])],listenOnly:1}  // someone's review line said aloud: the word is a sound in the text, and the whole line is the answer
  :{...s,ask:'잘 들어 보세요. 무슨 단어예요?',w,opts:[[w,1],...pool.map(p=>[p,0,`"${w}"였어요. 다시 들어 보세요.`])],listenOnly:1};
 dlg.cur=out;return out;
}
/* Every Korean word in a line is tappable: marked glosses ({shown|key}) open the chapter DICT entry,
   all other words open the game's dictionary (LEX, built from the dialogue by lexicon/extract.py). */
function glossHTML(t){
 const esc=x=>x.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const words=x=>esc(x).replace(/[가-힣]+/g,w=>`<span class="w">${w}</span>`);
 let out='',last=0;const re=/\{([^|}]+)\|([^}]+)\}/g;let m;
 while((m=re.exec(t))){out+=words(t.slice(last,m.index))+`<span class="gl" data-k="${esc(m[2])}">${esc(m[1])}</span>`;last=re.lastIndex}
 return out+words(t.slice(last));
}
function lexLookup(w){ // word as written → [[lemma,{k,e}],…]; falls back to the longest known prefix (우주선이 → 우주선)
 const L=window.LEX||{map:{},defs:{}},hit=l=>C.DICT[l]?[l,C.DICT[l]]:carryDict(l)?[l,carryDict(l)]:L.defs[l]?[l,L.defs[l]]:null;
 let ls=L.map[w];
 if(!ls)for(let n=w.length;n>0&&!ls;n--){const pre=w.slice(0,n); // longest known prefix, also as a verb/adjective stem (강해서 → 강하다)
  const tries=[pre,pre+'다',/[해했]$/.test(pre)?pre.slice(0,-1)+'하다':null].filter(Boolean);
  if(L.map[pre])ls=L.map[pre];else{const t=tries.find(x=>hit(x));if(t)ls=[t]}}
 return (ls||[]).map(hit).filter(Boolean);
}
function popGloss(rows){ // rows: [[headword,{k,e}],…] — Korean first; English only behind the ? button. Stays until ×, A, B or the next line
 if(!rows.length){hideGloss();toast('사전에 없는 말이에요.');return}
 const el=$('gloss');
 el.innerHTML=rows.map(([h,d])=>`<div class="gr"><b>${h}</b>${d.k}<span class="en" hidden>${d.e||''}</span></div>`).join('')+'<button class="q" type="button" aria-label="영어로 보기">?</button><button class="gx" type="button" aria-label="닫기">×</button>';
 el.hidden=false;el.querySelector('.q').addEventListener('click',e=>{e.stopPropagation();el.querySelectorAll('.en').forEach(x=>x.hidden=!x.hidden)});
}
function typeText(text,done){
 text=text.replace(/ ___/g,'\u00A0___').replace(/___(?=\S)/g,'___\u2060');  // a blank never starts or ends a line on its own ("국어 수행 ___ / 예요")
 clearInterval(typing?.id);const el=$('txt');const p=plain(text);el.innerHTML='<span style="visibility:hidden">'+p.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</span>';let i=0;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 typing={id:null,finished:false};
 const fin=()=>{clearInterval(typing.id);el.innerHTML=glossHTML(text);typing.finished=true;done()};
 typing.fin=fin;
 if(reduce)return fin();
 const seg=(()=>{try{return [...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(p)].map(x=>x.segment)}catch(e){return Array.from(p)}})();  // whole characters: never half an emoji (it shows as ? for a tick)
 const esc=x=>x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));  // the whole line is laid out from the start: words never jump down a line
 typing.id=setInterval(()=>{i++;el.innerHTML=esc(seg.slice(0,i).join(''))+'<span style="visibility:hidden">'+esc(seg.slice(i).join(''))+'</span>';if(i>=seg.length)fin()},26);
}
let allDicts=null;
const otherDict=k=>{if(!allDicts){allDicts={};for(const ch of CHAPTERS)if(ch!==CH)try{Object.assign(allDicts,ch.make().DICT||{})}catch(e){}}return allDicts[k]};
function showGloss(k){const d=C.DICT[k]||otherDict(k),rows=d?[[k,d]]:lexLookup(k);if(rows.length){noteTap(rows);popGloss(rows)}}  // {form|lemma}: this chapter's entry, else another chapter's (a review asked out of its chapter), else the lexicon
function showWord(w){const rows=lexLookup(w);noteTap(rows);popGloss(rows);lastWord=(w+(rows.length?' → '+rows.map(([h,d])=>h+': '+d.k).join(' / '):' (사전에 없음)')).slice(0,400)}
/* ---------- 찾아본 말: every tap that finds a definition — how many times, and when last (all chapters, one list) ---------- */
const TAPS_KEY=KEY('taps');let taps={},tapSort='t';
try{taps=JSON.parse(store.get(TAPS_KEY)||'{}')||{}}catch(e){taps={}}
function noteTap(rows){const [h,d]=rows[0]||[];if(!h)return;const r=taps[h]||(taps[h]={n:0,t:0});r.n++;r.t=Date.now();r.k=d.k;r.e=d.e;store.set(TAPS_KEY,JSON.stringify(taps))}
function ago(t){const m=Math.floor((Date.now()-t)/60000);if(m<1)return '방금';if(m<60)return m+'분 전';const h=Math.floor(m/60);if(h<24)return h+'시간 전';const d=Math.floor(h/24);return d===1?'어제':d+'일 전'}
function openTaps(){
 const esc=x=>String(x||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const rows=Object.entries(taps).sort((a,b)=>tapSort==='n'?(b[1].n-a[1].n||b[1].t-a[1].t):b[1].t-a[1].t);
 $('tapCount').textContent=rows.length?rows.length+'개':'';
 $('tapList').innerHTML=rows.length?rows.map(([h,r])=>`<div class="tp"><div class="tph"><b>${esc(h)}</b><span class="tpm">${r.n}번 · ${ago(r.t)}</span></div><div class="tpk">${esc(r.k)}</div><div class="tpe" hidden>${esc(r.e)}</div></div>`).join('')
  :'<p class="tl-empty">아직 찾아본 말이 없어요.</p>';
 if(!$('tapCopy')){const b=document.createElement('button');b.className='btn';b.id='tapCopy';b.textContent='복사';b.style.marginLeft='auto';b.addEventListener('click',copyTaps);$('tapSortN').after(b)}
 $('tapCopy').hidden=!rows.length;if($('tapText'))$('tapText').hidden=true;
 $('tapSortT').classList.toggle('on',tapSort==='t');$('tapSortN').classList.toggle('on',tapSort==='n');
 $('tapPanel').hidden=false;document.body.classList.add('talkopen');$('tapList').scrollTop=0;
}
function closeTaps(){$('tapPanel').hidden=true;document.body.classList.remove('talkopen')}
/* 복사: every looked-up word as plain text (word | times | last day | meaning | English), to paste into a chat and practise */
function tapsText(){
 const d=t=>{const x=new Date(t);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
 const rows=Object.entries(taps).sort((a,b)=>tapSort==='n'?(b[1].n-a[1].n||b[1].t-a[1].t):b[1].t-a[1].t);
 return `${G.title||document.title} · 찾아본 말 ${rows.length}개 (${d(Date.now())})\n단어 | 찾은 횟수 | 마지막으로 찾은 날 | 뜻 | English\n`
  +rows.map(([h,r])=>[h,r.n,d(r.t),r.k||'',r.e||''].map(x=>String(x).replace(/\s*\|\s*/g,' / ')).join(' | ')).join('\n')+'\n';
}
function copyTaps(){
 const txt=tapsText();
 const show=()=>{  // no clipboard (some embeds block it): show the text selected, ready for the phone's own copy
  let ta=$('tapText');if(!ta){ta=document.createElement('textarea');ta.id='tapText';ta.readOnly=true;ta.style.cssText='width:100%;height:9em;font-size:.8rem;margin:6px 0;box-sizing:border-box';$('tapList').before(ta)}
  ta.hidden=false;ta.value=txt;ta.focus();ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}if(ok)toast('복사했어요!')};
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(()=>toast('복사했어요!'),show);else show();
}
function hideGloss(){$('gloss').hidden=true}
/* ---------- conversation log: every line shown, scrollable, words tappable like in the dialogue box ---------- */
let talk=[];
const talkKey=()=>CH.save+'-talk';
function loadTalk(){talk=[];try{talk=JSON.parse(localStorage.getItem(talkKey())||'[]')}catch(e){}}
function logTalk(who,text){
 if(!text)return;const last=talk[talk.length-1];if(last&&last[0]===who&&last[1]===text)return;
 talk.push([who,text]);if(talk.length>150)talk=talk.slice(-150);
 try{localStorage.setItem(talkKey(),JSON.stringify(talk))}catch(e){}
}
function openTalk(){
 const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 $('talkList').innerHTML=talk.length?talk.map(([w,t])=>`<div class="tl"><span class="tw">${esc(w)}</span><span class="tt txt">${glossHTML(t)}</span></div>`).join('')
  :'<p class="tl-empty">아직 대화가 없어요.</p>';
 $('talkPanel').hidden=false;document.body.classList.add('talkopen');
 const L=$('talkList');L.scrollTop=L.scrollHeight;
}
function closeTalk(){$('talkPanel').hidden=true;document.body.classList.remove('talkopen');hideGloss()}

const choiceBtns=()=>[...document.querySelectorAll('#choices .choice')];
const tileBtns=()=>[...document.querySelectorAll('#tiles .tile:not(.used)')];
const choosing=()=>!!dlg&&!$('choices').hidden&&choiceBtns().length>0;
const building=()=>!!dlg&&!$('build').hidden;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
function renderChoices(s){
 const box=$('choices');box.hidden=false;
 const order=shuffle(s.opts.map((_,i)=>i));
 box.innerHTML=order.map(i=>`<button class="choice" data-i="${i}">${String(s.opts[i][0]).replace(/[가-힣]+/g,w=>`<span class="cw">${w}</span>`)}</button>`).join('');
 let pressT=null,defined=false;  // long-press a word on a choice = its definition (doesn't answer)
 box.querySelectorAll('.choice').forEach(b=>{
  b.addEventListener('pointerdown',e=>{const w=e.target.closest('.cw');defined=false;clearTimeout(pressT);if(w)pressT=setTimeout(()=>{defined=true;showWord(w.textContent)},450)});
  for(const t of ['pointerup','pointerleave','pointercancel'])b.addEventListener(t,()=>clearTimeout(pressT));
  b.addEventListener('click',e=>{e.stopPropagation();if(defined){defined=false;return}choose(s,+b.dataset.i)})});
 sel=-1;choicesAt=performance.now();markSel();  // nothing selected: A can't answer by accident
}
/* a plain choice (not a quiz): each button closes the conversation and runs its action, e.g. going on to the next chapter */
function renderPick(s){
 const box=$('choices');box.hidden=false;
 box.innerHTML=s.choose.map(([label],i)=>`<button class="choice" data-i="${i}">${label}</button>`).join('');
 box.querySelectorAll('.choice').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const fn=s.choose[+b.dataset.i][1];
  box.hidden=true;box.innerHTML='';sfx('ok');closeDialog();if(fn)setTimeout(fn,150)}));
 sel=-1;choicesAt=performance.now();markSel();
}
/* the gate at the end of a chapter: "go on to the next one?" (nothing after the last chapter) */
function nextChapterAsk(line){
 const i=CHAPTERS.findIndex(c=>c.id===CH.id),nx=CHAPTERS[i+1];if(!nx)return line;
 const ro=(w=>{const c=w.charCodeAt(w.length-1)-0xAC00,b=c>=0&&c<11172?c%28:0;return b===0||b===8?'로':'으로'})(nx.n);  // 2교시로, 2장으로
 return {steps:[{say:(line?line+' ':'')+nx.n+ro+' 갈까요?',choose:[[nx.n+ro+' 가요',()=>{boot(nx.id);sfx('door')}],['아직이요',null]]}]};
}
function markSel(){const bs=choosing()?choiceBtns():tileBtns();bs.forEach((b,i)=>b.classList.toggle('sel',i===sel));bs[sel]?.focus({preventScroll:true});bs[sel]?.scrollIntoView({block:'nearest'})}
function moveSel(d){if(performance.now()-choicesAt<450)return;  // keys still held from walking don't move a fresh question's selection
 const n=(choosing()?choiceBtns():tileBtns()).length;if(!n)return;sel=sel<0?(d>0?0:n-1):(sel+d+n)%n;markSel();sfx('move')}
let choicesAt=0,lastA=0;
function confirmSel(){const t=performance.now();if(t-choicesAt<450)return;
 if(choosing()||(building()&&!dlg.cur.got)){const quick=lastA>choicesAt&&t-lastA<500;lastA=t;if(quick)return}  // mashing A through talk never answers: in a question (or word tiles before the first is placed), presses under 0.5 s apart do nothing (pause, then A picks)
 if(sel<0){sel=0;markSel();return}  // nothing selected: A selects the first one (never does nothing); A again picks it
 const b=(choosing()?choiceBtns():tileBtns())[sel];if(b)b.click()}

function renderBuild(s){
 s.got=0;$('build').hidden=false;
 $('slots').innerHTML='<span class="ph">· · ·</span>';
 let order;const solved=o=>[s.build,...(s.alts||[])].some(a=>o.every((v,i)=>s.build[v]===a[i]));
 do order=shuffle(s.build.map((_,i)=>i));while(s.build.length>1&&solved(order));  /* never start already solved (in any right order) */
 $('tiles').innerHTML=order.map(i=>`<button class="tile" data-i="${i}">${s.build[i]}</button>`).join('');
 $('tiles').querySelectorAll('.tile').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();pickTile(s,b)}));
 sel=-1;choicesAt=performance.now();markSel();if(s.hintOK===undefined)s.hintOK=firstTime('tileHint');hintTile(s,4000);
}
/* the very first word-order question a player meets: after a pause its first right tile bobs, a hint without instruction text.
   Never again after that, and never past the first tile: from then on the player knows how tiles work. */
function hintTile(s,ms){
 clearTimeout(hintTile.t);$('tiles').querySelectorAll('.hint').forEach(b=>b.classList.remove('hint'));
 if(!s.hintOK||s.got>0)return;
 hintTile.t=setTimeout(()=>{if(!(dlg&&dlg.cur===s&&building()))return;const seq=s.seq||[],o=[s.build,...(s.alts||[])].find(o=>seq.every((w,j)=>o[j]===w))||s.build;
  [...$('tiles').querySelectorAll('.tile:not(.used)')].find(b=>s.build[+b.dataset.i]===o[seq.length])?.classList.add('hint')},ms);
}
function pickTile(s,b){
 const i=+b.dataset.i,seq=s.seq||(s.seq=[]),t=s.build[i];
 const fits=o=>seq.every((w,j)=>o[j]===w)&&o[seq.length]===t;  // the order so far, plus this tile, is a prefix of a right order
 if(!fits(s.build)&&!(s.alts||[]).some(fits)){sfx('no');s.missed=true;if(s.w)dlg.missed.add(s.w);b.classList.remove('bad');void b.offsetWidth;b.classList.add('bad');hintTile(s,1200);return}
 sfx('move');seq.push(t);s.got++;b.classList.add('used');b.classList.remove('sel');hintTile(s,4000);
 if(s.got===1)$('slots').innerHTML='';
 $('slots').insertAdjacentHTML('beforeend',`<span class="t">${s.build[i]}</span>`);
 if(s.got===s.build.length){
  const line=seq.join(' ');sfx('ok');
  if(s.review||dlg.review)gradeStep(s);
  dlg.next='advance';$('build').hidden=true;
  show({who:s.who||dlg.name,say:line+(/[.!?…]$/.test(line)?'':'.')});  // the assembled line, said whole: getting it right is the praise (no 맞아요 toast)
  if(readOn)speak(line);
 }else{sel=Math.min(Math.max(sel,0),tileBtns().length-1);markSel()}  // the selection moves on to the next tile: A, A, A builds the line
}
/* Each rule is explained once per player, then only the toasts speak. */
let explained={};try{explained=JSON.parse(localStorage.getItem(KEY('explained'))||'{}')}catch(e){}
function firstTime(k){if(explained[k])return false;explained[k]=1;try{localStorage.setItem(KEY('explained'),JSON.stringify(explained))}catch(e){}return true}
function gradeStep(s){
 if(!s.w)return;
 const before=lv(s.w).b,b=grade(s.w,!s.missed);
 updateHud();
 if(s.missed)setTimeout(()=>toast(`"${s.w}" 다시 연습해요`),250);
 if(!s.missed&&b>=3&&before<3){setTimeout(()=>{toast('★ '+s.w+' 기억했어요!');sfx('star')},250)}
 if(s.missed?firstTime('reviewMiss'):firstTime('reviewLevel'))dlg.steps.splice(dlg.i+1,0,{who:LOGNAME,say:s.missed?`"${s.w}" 다시 연습해요. 곧 또 나와요.`:`"${s.w}" 기억 레벨 ${b}/5.`+(b>=3?' ★':'')});
}
/* praise after a right answer: a step's own `ok`, else 맞아! from a friend who speaks 반말 (NPC banmal:1), else 맞아요! */
const okWord=s=>s.ok||(dlg.npc&&dlg.npc.banmal?'맞아!':'맞아요!');
/* the asked line with its blank filled, minus a question after it that the answer has just settled ("…" 맞춤법에 맞는 건?) */
function answered(ask,a){const f=ask.replace('___',a),i=ask.indexOf('___')+a.length;
 const m=f.slice(i).match(/^([^"”]*["”][.!?]?)\s+([^"”]*\?)$/);return m?f.slice(0,i)+m[1]:f}  // only a quoted example's question
function choose(s,i){
 const o=s.opts[i];if(s.w)askedIn[s.w]=talkN;
 if(o[1]){
  sfx('ok');
  if(s.review||dlg.review)gradeStep(s);
  dlg.next='advance';
  const line=s.done||(s.ask.includes('___')?answered(s.ask,o[0]):o[0]);
  const quiz=/["“][^"”]*___[^"”]*["”]/.test(s.ask)||s.listenOnly;
  if(s.who==='나'&&!s.listenOnly||s.own||s.who==='…'||!quiz){  /* own:1 — the line is the speaker's own words, not a reply to you */
   // an ok: that isn't praise ("뭐?", "…") is the other person's reaction, so they say it next
   const react=s.ok&&!/^(맞아|정답|좋아|딩동댕)/.test(s.ok)?s.ok:null;
   show({who:s.who||dlg.name,say:line});  // the line with its blank filled is the feedback: no 맞아요 toast (the sound and the talk going on say it was right)
   if(react)dlg.next={who:s.reactWho||dlg.name,say:react}}else show({who:s.who==='나'?dlg.name:s.who,say:okWord(s)+' '+(s.listenOnly?`"${o[0]}"`:line)});
 }else{
  sfx('no');s.missed=true;if(s.w)dlg.missed.add(s.w);
  dlg.next=s;show({who:s.who==='나'?'…':s.who,say:o[2]||'다시 해 봐요.'});  // after your own line, the hint is narration
 }
}
function advance(){
 if(!dlg)return;
 if(typing&&!typing.finished){typing.fin();return}
 if(dlg.cur.ask||dlg.cur.build||dlg.cur.choose)return;
 if(dlg.next){const n=dlg.next;dlg.next=null;if(n!=='advance'){show(n);return}}
 if(dlg.cur.finale){const p=pending;pending=null;closeDialog();finish(p);return}  // a note still waiting (20/20 words!) goes before the ending, not under its fade
 dlg.i++;
 if(dlg.i>=dlg.steps.length){closeDialog();return}
 show(dlg.steps[dlg.i]);
}
let closedAt=0;
function closeDialog(){
 const wasBlack=dlg&&dlg.black;if(wasBlack)$('fade').classList.remove('on');
 closedAt=performance.now();if(dlg&&dlg.moved)beat();dlg=null;camT=null;startWalks();clearInterval(typing?.id);$('dlg').hidden=true;$('dlg').classList.remove('attop');closePhone();hideGloss();if(TTS)try{speechSynthesis.cancel()}catch(e){}
 updateQuest();
 if(C.afterTalk)C.afterTalk();  // a chapter's own check after every conversation (단어 마을: the cartridge is complete, every word is ★)
 if(pending){const c=pending;pending=null;setTimeout(()=>{if(!dlg)openDialog(LOGNAME,c)},400)}
}
function cancel(){
 if(phoneOpen){if(!$('gloss').hidden){hideGloss();return}closePhone();return}
 if(CREATOR&&!$('mePanel').hidden){if(me)closeMe(false);return}  // first time: you must pick (no B)
 if(!$('startPanel').hidden){$('startPanel').hidden=true;return}
 if($('repPanel')&&!$('repPanel').hidden){closeReport();return}
 if(!$('tapPanel').hidden){closeTaps();return}
 if(!$('talkPanel').hidden){if(!$('gloss').hidden)hideGloss();else closeTalk();return}
 if(panelOpen()){$('panel').hidden=true;$('chPanel').hidden=true;return}
 if(!$('gloss').hidden){hideGloss();return}
 if(choosing()||building()){speak(dlg.cur.listenLine||dlg.cur.listen||dlg.cur.ask||'');return} // B never throws away a question; it replays it
 if(dlg)closeDialog();
}
const says=a=>(Array.isArray(a)?a:[a]).map(t=>typeof t==='string'?{say:t}:t);  // a line, or a full step (set:, sfx:, …)

function allQuestions(){
 const out=[...(C.BANK||[])];Object.keys(C.Q).forEach(k=>{if(k!=='cafe')out.push(...C.Q[k])});return out;
}
/* In-character review (opt-in): a chapter's C.REVIEW lists lines people say that use a word you've learned —
   {w, by:'npcId'|'이름'|[…], ask, opts, pre?:[lines before it], when?:()=>bool, who?:'나'}. Whoever has a line for a word that is due
   asks it in their own voice (a friend, a teacher, a passer-by), and the answer grades the word as any review does.
   A chapter without C.REVIEW keeps the narrator's review of the person's own badge words. */
const npcId=n=>Object.keys(C.NPC).find(k=>C.NPC[k]===n);
const metIds=()=>state.met||(state.met=[]),met=n=>!!n.badge||metIds().includes(npcId(n));  // someone you've talked to (a teacher always counts)
function linesFor(n){  // their lines for words you have, true right now (when), due or not
 if(!C.REVIEW||(n.badge&&!n.badge.every(has)))return [];  // someone still teaching teaches first
 if(!met(n))return [];  // the first talk with anyone is their own (an introduction, a cameo), never a review
 const id=npcId(n);
 return C.REVIEW.filter(r=>[].concat(r.by).some(b=>b===id||b===n.name)&&known(r.w)&&(!r.when||r.when()));  // known: this chapter's word you have, or one from another chapter (srs.shared)
}
const revAt={};  // when each person last asked a review: at most one per story beat (re-talking isn't a quiz machine)
const cooling=n=>{const r=revAt[npcId(n)];return !!r&&(SRS().beats?r.b===beats():talkN-r.t<3)};
const cooledLine=r=>{const h=(state.heardB||{})[rKey(r)];return h==null||beats()-h>=3};  // a line just heard as plain talk isn't asked for a few beats
const reviewLines=n=>cooling(n)?[]:linesFor(n).filter(r=>isDue(r.w)&&cooledLine(r));
/* Spaced review decides when a line is a question, not whether you hear it: with nothing of theirs due, a person says one of
   their lines you haven't heard yet, the word filled in, as ordinary talk (state.heard keeps which), then their usual chatter. */
const rKey=r=>r.w+'|'+r.ask,heard=()=>state.heard||(state.heard=[]),unheard=r=>!heard().includes(rKey(r));
function hear(r){if(unheard(r)){heard().push(rKey(r));save()}}
function sayLine(n){
 const L=linesFor(n).filter(unheard);if(!L.length)return null;
 const r=L[Math.random()*L.length|0],ok=(r.opts||[]).find(o=>o[1]);hear(r);(state.heardB||(state.heardB={}))[rKey(r)]=beats();
 return [...says(r.pre||[]),{...(r.who?{who:r.who}:{}),say:answered(r.ask,ok?ok[0]:r.w)}];
}
const usual=n=>n.badge?(n.badge.every(has)?says(n.after):null):(n.again&&metIds().includes(npcId(n))?says(typeof n.again==='function'?n.again():n.again):n.talk());  // again: what they say once you've met (no second introduction)  // what they'd say anyway (null: still teaching)
const moves=s=>['set','give','take','award','go','walk','leave','move','phone','culture','sit','choose','finale'].some(k=>k in s);
function reviewPick(n){
 const L=reviewLines(n);if(!L.length)return null;
 const rank=r=>lv(r.w).b*2+((n.badge||[]).includes(r.w)?0:1);  // the weakest word first; their own word before someone else's
 const lo=Math.min(...L.map(rank)),best0=L.filter(r=>rank(r)===lo),fresh=best0.filter(unheard),best=fresh.length?fresh:best0,r=best[Math.random()*best.length|0];hear(r);revAt[npcId(n)]={b:beats(),t:talkN+1};  // a line you haven't heard first
 const q={...r,review:true};delete q.by;delete q.pre;delete q.when;
 if(q.who!=='나'&&canSpeak()&&soundOn&&listenOn&&Math.random()<.35){const ok=(q.opts||[]).find(o=>o[1]);q.listen=q.w;q.listenLine=answered(q.ask,ok?ok[0]:q.w)}  // they say it aloud (the answer as it fits the line: 주워, not 줍다); you pick the word you heard
 return [...says(r.pre||[]),q];
}
function reviewFor(words){ // pick a question for the weakest of these words
 const ws=[...words].sort((a,b)=>(isDue(b)-isDue(a))||(lv(a).b-lv(b).b));
 const w=ws[0];
 let pool=allQuestions().filter(q=>q.w===w);
 if(!pool.length&&SRS().shared)pool=carryBank()[w]||[];  // a word from another chapter: its own chapter's sentences
 if(C.REVIEW){const g=(C.BANK||[]).filter(q=>q.w===w&&!q.scene);if(g.length)pool=g}  // with in-character review, the notebook asks the generic example sentences, not lines from someone's scene
 const gen=pool.filter(q=>!q.scene),all=gen.length?gen:pool;  // scene:1 quotes its own scene: never asked in review (it would play the scene before it happens)
 const own=all.filter(q=>!q.gram),qs=own.length?own:all;  // gram:1 tests a pattern, not the word: no star for the word from it
 const narr={review:true,who:'…',ok:'맞아요!'};  /* asked by the narrator: the sentences are generic examples, not in the NPC's voice */
 if(canSpeak()&&soundOn&&listenOn&&Math.random()<.35)return {listen:w,...narr};  // a muted phone (or 듣기 문제 off) can't answer a listening question
 return {...qs[Math.random()*qs.length|0],...narr};
}
function terminal(){
 const due=dueWords();
 if(!state.badges.length&&!due.length)return [{who:TERM.name,say:TERM.empty}];  // empty only when there's nothing at all: earlier chapters' due words count (srs.shared)
 if(!due.length){const n=nextDue();return [{who:TERM.name,say:TERM.idle+(n?` ${TERM.next}: ${fmtWait(n-now())} 후.`:'')}]}
 const pick=shuffle(due.slice()).slice(0,4);
 const steps=[{who:TERM.name,say:TERM.due(due.length,pick.length)}];  // due(n,k): n words due, k asked this round (at most 4)
 pick.forEach(w=>steps.push(reviewFor([w])));
 steps.push({who:TERM.name,say:TERM.end});
 return steps;
}
function facing(){
 const [dx,dy]=D[player.dir];const tx=player.x+dx,ty=player.y+dy;
 let n=npcAt(tx,ty);
 if(!n&&(Z.legend[at(tx,ty)]||{}).over)n=npcAt(tx+dx,ty+dy);
 if(n)return {n};
 if(petOn()&&pet.x===tx&&pet.y===ty&&!(pet.x===player.x&&pet.y===player.y))return {pet:1};
 const key=tx+','+ty;
 {const L=Z.legend[at(tx,ty)];if(L&&(L.tile==='terminal'||L.term))return {term:1}}  // the review computer: the 'terminal' tile, or any tile marked term:1 (a laptop, …)
 if(Z.spots&&Z.spots[key])return {spot:Z.spots[key]};
 const w=warpAt(tx,ty);if(w&&w.lock&&w.lock())return {spot:w.lock()};
 /* things: a line for every tile of a kind (Z.things[char] = text | [variants, picked by position] | fn(x,y) → either) */
 const th=Z.things&&Z.things[at(tx,ty)],tv=typeof th==='function'?th(tx,ty):th;
 if(tv)return {spot:Array.isArray(tv)?tv[(tx*7+ty*13)%tv.length]:tv};  // tv may also be {steps:[…]} (a conversation)
 return null;
}
/* {chat:'id'} on someone who is answering another: [opener, answerer] when both are here, so either one plays the whole exchange */
function chatPair(n){
 const L=live(),o=n.chat?C.NPC[n.chat]:L.find(m=>m.chat&&C.NPC[m.chat]===n);
 return o&&L.includes(o)&&!(o.badge&&o.badge.length)?(n.chat?[o,n]:[n,o]):null;
}
/* a conversation with n, as when you press A facing them (also a room's greeting) */
function talkWith(n){
 if(n.proxy){const p=n.proxy();if(p)n=p}
 const pair=chatPair(n);  // two people talking to each other: they keep facing each other, and the one who started speaks first
 if(!pair&&!n.pos&&!sitting(n)&&!n.fixed){n.dir=OPP[player.dir];n.turnAt=performance.now()+6000}  // fixed: furniture (a chair) never turns to face you
 let steps=n.script?n.script():null,isReview=false;
 if(!steps&&C.REVIEW){const own=usual(n),rv=own&&!own.some(moves)?reviewPick(n):null;  // a talk that moves the story goes first; the review waits for the next talk
  if(rv){const q=rv[rv.length-1],stems=[q.w.replace(/다$/,''),q.w.replace(/하다$/,'')].filter(x=>x),gives=t=>stems.some(x=>(t.say||'').includes(x));  // their usual line goes first, unless it says the very word they're about to ask (흥정해 → 흥정하다)
   steps=[...(n.badge?own.filter(t=>!gives(t)):[]),...rv];isReview=true}
  else{const sl=own&&!own.some(moves)?sayLine(n):null;steps=sl?[...(n.badge?own:[]),...sl]:own||n.talk()}}
 if(!steps){
  if(n.badge&&n.badge.every(has)){const due=n.badge.some(isDue);steps=due?[...says(n.after),reviewFor(n.badge)]:says(n.after);isReview=due}  // a review question only when one of their words is due
  else steps=n.talk();
 }
 {const id=npcId(n);if(id&&!metIds().includes(id)){metIds().push(id);save()}if(id&&status(n)==='star')starAcc[id]=Math.max(starAcc[id]||0,STAR_MS)}  // met: from now on they can review and chat; a ★ over them starts to fade once you've talked
 if(pair&&!isReview){const said=m=>(m===n?steps:(m.script&&m.script())||m.talk()).map(s=>s.who?s:{...s,who:m.name,look:m.look});steps=[...said(pair[0]),...said(pair[1])]}
 openDialog(n.name,steps,{npc:n,review:isReview});
}
function interact(){
 if(phoneOpen){if(!$('gloss').hidden){hideGloss();return}if(typing&&!typing.finished){typing.fin();return}closePhone();return}  // A finishes the line, then puts the phone away
 if(!$('gloss').hidden){hideGloss();return}  // A closes the definition first, without advancing
 if(panelOpen())return;
 if(choosing()||building()){confirmSel();return}
 if(dlg){advance();return}
 if(performance.now()-closedAt<650)return;  // the tap that closed a talk, doubled, doesn't reopen it
 if(player.moving||warping)return;
 const F=facing();if(!F)return;
 if(F.n){talkWith(F.n);return}
 if(F.pet){openDialog(C.FOLLOW.name,C.FOLLOW.talk());return}
 if(F.term){openDialog(TERM.name,terminal(),{review:true});return}
 if(F.spot){openDialog('…',F.spot.steps||says(F.spot))}
}

function award(words){
 const nw=words.filter(w=>!has(w));if(!nw.length)return;
 state.badges.push(...nw);
 const perfect=nw.filter(w=>!dlg.missed.has(w));
 const L0=SRS().start??2;  // srs.start: the level of a word answered right every time it was taught (★ is level 3)
 nw.forEach(w=>{state.lv[w]=perfect.includes(w)?spaced(L0):{b:0,due:now()}});
 save();updateHud();sfx('badge');
 toast((G.gotToast||'일지에 추가')+': '+nw.join(', '));  // GAME.gotToast: the game's word for it (단어 마을: 배지 획득)
 const note=perfect.length===nw.length
  ?{who:LOGNAME,say:`한 번도 안 틀렸어요! "${nw.join('", "')}" 기억 레벨 ${L0}/5.`}
  :{who:LOGNAME,say:`일지에 적었어요. 틀린 단어는 곧 다시 나와요. 머리 위의 ?를 찾아요.`};
 if(firstTime(perfect.length===nw.length?'awardPerfect':'awardMissed'))dlg.steps.splice(dlg.i+1,0,note);
 if(state.badges.length>=C.WORDS.length&&!state.f.allWords){state.f.allWords=1;save();const all=TERM.allWords(C.WORDS.length);if(all&&all.length)pending=says(all)}  // term.allWords(n): the note when the last word is in ([] = none)
}
function finish(pre){
 $('fade').classList.add('on');sfx('star');
 setTimeout(()=>{$('fade').classList.remove('on');const nx=nextChapterAsk('');openDialog('…',(pre||[]).map(s=>({who:LOGNAME,...s})).concat(says(C.DONE),nx.steps||[]))  /* the ending is narration, then: on to the next chapter? */},900);
}
let toastT;function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2400)}

/* ---------- HUD + log ---------- */
function updateHud(){const n=state.badges.length,st=C.WORDS.filter(w=>has(w)&&lv(w).b>=3).length;$('logBtn').textContent=`${G.hud||'일지'} ${n}/${C.WORDS.length}`+(st?` ★${st}`:'');fitReg()}
/* the header label (room · 교시 title): tighten its letter spacing, then its size, before it would be cut off (…) next to a wide 일지 badge */
function fitReg(){const e=$('reg');if(!e)return;e.style.letterSpacing=e.style.fontSize='';const f0=parseFloat(getComputedStyle(e).fontSize);
 for(const [ls,k] of [['.08em',1],['.03em',1],['.02em',.92],['0',.86]]){if(e.scrollWidth<=e.clientWidth)return;e.style.letterSpacing=ls;e.style.fontSize=k<1?f0*k+'px':''}}
addEventListener('resize',()=>fitReg());
function updateQuest(){$('questTxt').textContent=C.questText();$('quest').classList.toggle('late',!!(C.questLate&&C.questLate()))}  // questLate: the goal is overdue (shell CSS .quest.late)
function updateRead(){$('readBtn').setAttribute('aria-pressed',readOn&&canSpeak()?'true':'false');$('spk').hidden=!canSpeak()}
function updateSound(){$('sndBtn').setAttribute('aria-pressed',soundOn?'true':'false')}
let logSel=null,showEn=false;
function pips(w){const L=lv(w);return `<span class="pips${isDue(w)?' due':''}">${[1,2,3,4,5].map(i=>`<i class="${L.b>=i?'on':''}"></i>`).join('')}</span>`}
function openPanel(){
 renderNotes();if($('itemCard'))$('itemCard').hidden=true;
 const got=C.WORDS.filter(has);
 $('logCount').textContent=`${got.length}/${C.WORDS.length} · 복습 ${dueWords().length}`;
 if(!logSel||!has(logSel))logSel=got[got.length-1]||null;
 $('wlist').innerHTML=C.WORDS.map(w=>has(w)?`<button class="wd${w===logSel?' sel':''}" data-w="${w}"><span class="w">${w}</span>${pips(w)}</button>`:`<div class="wd off"><span class="w">？</span></div>`).join('');
 $('wlist').querySelectorAll('button.wd').forEach(b=>b.addEventListener('click',()=>{logSel=b.dataset.w;showEn=false;openPanel();speak(logSel)}));
 if(logSel){const d=C.DICT[logSel],L=lv(logSel);
  $('card').innerHTML=`<div class="top"><span class="big">${logSel}</span><button class="spk${canSpeak()?'':' '}" id="cardSpk" aria-label="듣기" ${canSpeak()?'':'hidden'}>${$('spk').innerHTML}</button></div>
   <span class="def">${d.k}</span><span class="ex">예: ${d.ex}</span>${d.hj?`<span class="hj">${d.hj}</span>`:''}
   <span class="hj">기억 레벨 ${L.b}/5 · ${isDue(logSel)?'지금 복습할 수 있어요':'다음 복습: '+fmtWait(L.due-now())+' 후'}</span>
   ${showEn?`<span class="en">${d.e}</span>`:'<button class="enb" id="enBtn" aria-label="영어로 보기">?</button>'}`;
  $('cardSpk')?.addEventListener('click',()=>speak(logSel+'. '+d.ex));
  $('enBtn')?.addEventListener('click',()=>{showEn=true;openPanel()});
 }else $('card').innerHTML='<span class="def">아직 단어가 없어요.</span><span class="ex">사람들한테 말을 걸면 일지에 단어가 생겨요.</span>';
 $('items').innerHTML=state.items.length?state.items.map((i,k)=>`<li data-k="${k}" title="${String(C.ITEMS[i]||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${String(i).replace(/</g,'&lt;')}</li>`).join(''):'<li class="none">비어 있어요.</li>';
 /* tap an item to read it again (the 복숭아 쪽지 that starts it all): its description in the card; an item with a photo (C.PHOTOS) opens it */
 $('items').querySelectorAll('li[data-k]').forEach(li=>li.addEventListener('click',()=>{const name=state.items[+li.dataset.k],ph=(C.PHOTOS||{})[name];
  if(ph){$('panel').hidden=true;openPhone(ph);return}
  $('items').querySelectorAll('li').forEach(x=>x.classList.toggle('sel',x===li));
  let ic=$('itemCard');if(!ic){ic=document.createElement('div');ic.id='itemCard';ic.className='card';$('items').after(ic)}  // right under the bag, not in the word card at the top (out of view)
  ic.innerHTML=`<div class="top"><span class="big">${String(name).replace(/</g,'&lt;')}</span></div><span class="def txt">${glossHTML(String(C.ITEMS[name]||''))}</span>`;ic.hidden=false;ic.scrollIntoView({block:'nearest'})}));
 $('panel').hidden=false;
}

/* ---------- saving ---------- */
function fresh(){const st=CH.start;return {v:1,zone:st.zone,x:st.x,y:st.y,dir:st.dir,badges:[],lv:{},items:[],f:{},seenIntro:false}}
function save(){store.set(CH.save,JSON.stringify(state));if(SRS().shared)store.set(KEY('lv'),JSON.stringify(state.lv))}
function loadState(){
 state=fresh();
 try{const s=JSON.parse(store.get(CH.save)||'null');if(s)Object.assign(state,s)}catch(e){}
 if(!C.ZONES[state.zone]){const st=CH.start;Object.assign(state,{zone:st.zone,x:st.x,y:st.y,dir:st.dir})}
 if(CH.migrate)CH.migrate(state);
 refreshCarry();
 const Zs=C.ZONES[state.zone],c=Zs&&Zs.map[state.y]&&Zs.map[state.y][state.x];  /* a map changed under an old save: back to the start */
 if(!c||!(Zs.legend[c]||{}).walk||(Zs.warps||{})[state.x+','+state.y]){const st=CH.start;Object.assign(state,{zone:st.zone,x:st.x,y:st.y,dir:st.dir})}
}

/* ---------- input ---------- */
function dirPress(d){
 if(phoneOpen){const l=$('pscr').querySelector('.plist');if(l&&(d==='up'||d==='down'))l.scrollBy({top:d==='down'?70:-70,behavior:'smooth'});return true}  // the D-pad scrolls the phone
 if(choosing()||building()){moveSel(d==='up'||d==='left'?-1:1);return true}
 return false;
}
document.querySelectorAll('.dpad button').forEach(b=>{
 const on=e=>{e.preventDefault();b.classList.add('on');const d=b.dataset.d;if(dirPress(d))return;held=d;if(dlg)return;tryMove()};
 const off=()=>{b.classList.remove('on');if(held===b.dataset.d)held=null};
 b.addEventListener('pointerdown',e=>{b.setPointerCapture?.(e.pointerId);on(e)});
 b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('lostpointercapture',off);
});
$('btnA').addEventListener('pointerdown',e=>{e.preventDefault();interact()});
$('btnB').addEventListener('pointerdown',e=>{e.preventDefault();cancel()});
$('dlg').addEventListener('click',e=>{const gl=e.target.closest('.gl');if(gl){e.stopPropagation();showGloss(gl.dataset.k);return}const w=e.target.closest('.txt .w');if(w){e.stopPropagation();showWord(w.textContent);return}if(e.target.closest('#spk'))return;advance()});
$('spk').addEventListener('click',e=>{e.stopPropagation();if(dlg)speak(dlg.cur.listenLine||dlg.cur.listen||dlg.cur.say||dlg.cur.ask||'')});
$('gloss').addEventListener('click',e=>{if(e.target.closest('.gx'))hideGloss()});  // × closes; A and B close too
$('choices').addEventListener('pointerdown',e=>{const b=e.target.closest('.choice');if(b){sel=choiceBtns().indexOf(b);markSel()}});
$('logBtn').addEventListener('click',()=>{showEn=false;openPanel()});
$('talkBtn').addEventListener('click',openTalk);
/* 나 꾸미기 panel: pick a look; the walk sprite and talk portrait preview live */
const ME_OPTS={style:[['short','짧은 머리'],['long','긴 머리'],['bob','단발'],['bun','올림머리'],['spiky','삐죽 머리'],['bald','민머리']],
 hair:['#1E1B22','#4A3426','#7A4B2A','#C9A15A','#B23A3A','#5A6FA8','#D8D2C4'],skin:['#F6D7BD','#F1C9A5','#E2AE86','#C68A5E','#8E5A3C']};
let meDraft=null,meDone=null;
function drawMePreview(){
 const L={...CREW_LOOK,...meDraft};drawPortrait($('meFace'),L,'happy',false);
 const c=$('meWalk').getContext('2d');c.clearRect(0,0,16,24);const rows=humanArt(L,'down',0),pal=humanPal(L);
 rows.forEach((r,y)=>[...r].forEach((ch,x)=>{const col=pal[ch];if(col&&ch!=='.'){c.fillStyle=col;c.fillRect(x,y,1,1)}}));
 for(const b of $('meOpts').querySelectorAll('[data-k]'))b.classList.toggle('on',b.dataset.t?!!meDraft[b.dataset.k]&&meDraft[b.dataset.k]!=='0':String(meDraft[b.dataset.k])===b.dataset.v);
}
function openMe(done){
 meDraft={style:'short',hair:'#1E1B22',skin:'#F1C9A5',lashes:0,lips:0,...(me||{})};meDone=done||null;
 const sw=(k,v,label,bg)=>`<button class="mo${bg?' sw':''}" data-k="${k}" data-v="${v}" ${bg?`style="background:${v}" aria-label="${label}"`:''}>${bg?'':label}</button>`;
 $('meOpts').innerHTML=`<div class="mrow"><span>머리 모양</span><div>${ME_OPTS.style.map(([v,l])=>sw('style',v,l)).join('')}</div></div>
  <div class="mrow"><span>머리 색</span><div>${ME_OPTS.hair.map((v,i)=>sw('hair',v,'머리 색 '+(i+1),1)).join('')}</div></div>
  <div class="mrow"><span>피부</span><div>${ME_OPTS.skin.map((v,i)=>sw('skin',v,'피부 '+(i+1),1)).join('')}</div></div>
  <div class="mrow"><span>얼굴</span><div><button class="mo" data-k="lashes" data-v="1" data-t="1">속눈썹</button><button class="mo" data-k="lips" data-v="#C25B6A" data-t="1">립</button></div></div>`;
 drawMePreview();$('mePanel').hidden=false;
}
function closeMe(keep){
 if(keep){me={...meDraft};if(me.lashes==='0'||!+me.lashes)delete me.lashes;else me.lashes=1;if(!me.lips||me.lips==='0')delete me.lips;
  store.set(ME_KEY,JSON.stringify(me));if(typeof C.PLAYER!=='function')player.look=myLook(C.PLAYER||CREW_LOOK);toast('반가워요! 👋')}
 $('mePanel').hidden=true;const d=meDone;meDone=null;if(d)d();
}
if(CREATOR)$('meOpts').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const k=b.dataset.k,on=meDraft[k]&&meDraft[k]!=='0';
 meDraft[k]=b.dataset.t?(on?'0':b.dataset.v):b.dataset.v;drawMePreview()});  // data-t = an on/off toggle
if(CREATOR)$('meRandom').addEventListener('click',()=>{const pick=a=>a[Math.random()*a.length|0];meDraft={style:pick(ME_OPTS.style)[0],hair:pick(ME_OPTS.hair),skin:pick(ME_OPTS.skin),lashes:pick(['1','0']),lips:pick(['#C25B6A','0'])};drawMePreview()});
if(CREATOR)$('meOk').addEventListener('click',()=>closeMe(true));
if(CREATOR)$('meBtn').addEventListener('click',()=>openMe());
/* START: everything that isn't the game itself (logs, dictionary, chapters, reading aloud, sound) */
/* 문제 알리기: a report goes to the word-reports inbox on seldoncortex.com. Artifacts can't call other sites, so 보내기 is a
   plain link that carries the report after the # (never in server logs); the page there posts it once and says thanks. */
const REPORT_URL='https://seldoncortex.com/word-reports/';let lastLines=[],repKind='game',lastWord='';
function reportCtx(){
 return {chapter:CH.n+' '+CH.title,place:roomName||Z.name,zone:ZID,pos:player.x+','+player.y,objective:(C.questText&&C.questText())||'',
  line:dlg&&dlg.cur?lastLines[lastLines.length-1]:'',lines:lastLines.join('\n'),word:lastWord}
}
function reportHref(){
 const r={game:G.prefix,kind:repKind,note:$('repNote').value.trim().slice(0,1000),build:CH.id,ctx:reportCtx()};
 const b=new TextEncoder().encode(JSON.stringify(r));let bin='';b.forEach(x=>bin+=String.fromCharCode(x));
 return REPORT_URL+'#'+btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function openReport(){
 if(!$('repPanel')){
  const P=document.createElement('div');P.className='panel';P.id='repPanel';P.hidden=true;
  P.innerHTML=`<div class="sheet talksheet" role="dialog" aria-label="문제 알리기"><h2><span>문제 알리기</span><button class="btn" id="repClose">닫기</button></h2>
   <div class="row tapsort"><button class="btn" id="repGame">게임이 이상해요</button><button class="btn" id="repKo">한국어가 이상해요</button></div>
   <div id="repCtx" style="font-size:.85rem;opacity:.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0"></div>
   <textarea id="repNote" rows="3" maxlength="1000" placeholder="무엇이 이상해요?" style="width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px"></textarea>
   <div class="row" style="justify-content:flex-end;margin-top:8px"><a class="btn" id="repSend" target="_blank" rel="noopener" style="text-decoration:none">보내기</a></div></div>`;
  document.body.append(P);
  P.addEventListener('click',e=>{if(e.target===P)closeReport()});$('repClose').addEventListener('click',closeReport);
  $('repGame').addEventListener('click',()=>setRepKind('game'));$('repKo').addEventListener('click',()=>setRepKind('korean'));
  $('repNote').addEventListener('input',()=>{$('repSend').href=reportHref()});
  $('repSend').addEventListener('click',()=>{$('repSend').href=reportHref();setTimeout(()=>{closeReport();$('repNote').value='';toast('고마워요!')},300)});
 }
 const c=reportCtx();$('repCtx').textContent=[c.chapter+' · '+c.place,c.line||lastLines[lastLines.length-1]||'',c.word?'단어: '+c.word:''].filter(Boolean).join('\n');
 setRepKind(repKind);$('repPanel').hidden=false;document.body.classList.add('talkopen');hideGloss();
}
function setRepKind(k){repKind=k;$('repGame').classList.toggle('on',k==='game');$('repKo').classList.toggle('on',k==='korean');$('repSend').href=reportHref()}
function closeReport(){$('repPanel').hidden=true;document.body.classList.remove('talkopen')}
function toggleStart(){const P=$('startPanel');if(P.hidden&&panelOpen())return;P.hidden=!P.hidden;hideGloss()}
{const g=$('startPanel').querySelector('.mgrid'),odd=g.querySelectorAll('.mi:not(.wide)').length%2;  // fill the gap next to a lone item, else a full row
 const b=document.createElement('button');b.className=odd?'mi':'mi wide';b.id='repBtn';b.textContent='문제 알리기';b.addEventListener('click',()=>{$('startPanel').hidden=true;openReport()});$('startPanel').querySelector('.mgrid').append(b)}
$('startBtn').addEventListener('click',toggleStart);$('startClose').addEventListener('click',()=>$('startPanel').hidden=true);
$('startPanel').addEventListener('click',e=>{if(e.target.id==='startPanel'){$('startPanel').hidden=true;return}
 const mi=e.target.closest('.mi');if(mi&&!mi.classList.contains('toggle'))$('startPanel').hidden=true},true);  // capture: close the menu before the item opens its panel
$('tapBtn').addEventListener('click',openTaps);$('tapClose').addEventListener('click',closeTaps);
$('tapSortT').addEventListener('click',()=>{tapSort='t';openTaps()});$('tapSortN').addEventListener('click',()=>{tapSort='n';openTaps()});
$('tapPanel').addEventListener('click',e=>{if(e.target.id==='tapPanel'){closeTaps();return}const p=e.target.closest('.tp');if(p){const en=p.querySelector('.tpe');en.hidden=!en.hidden}});$('talkClose').addEventListener('click',closeTalk);
$('talkPanel').addEventListener('click',e=>{if(e.target.id==='talkPanel'){closeTalk();return}const gl=e.target.closest('.gl');if(gl){showGloss(gl.dataset.k);return}const w=e.target.closest('.w');if(w)showWord(w.textContent)});
/* debug (START → 디버그, saved per game): a 건너뛰기 button on every conversation runs it to the end — right answers, finished word
   orders, every flag / item / word it sets, quietly — and stops at a real decision (a plain choice like "2교시로 갈까요?"). For testing. */
let debugOn=store.get(KEY('debug'))==='1';
function skipTalk(){
 const snd=soundOn;soundOn=false;
 for(let n=0;dlg&&n<500;n++){
  if(typing&&!typing.finished)typing.fin();
  const s=dlg.cur;
  if(s.choose)break;
  if(s.ask&&!dlg.next){choose(s,s.opts.findIndex(o=>o[1]));continue}
  if(s.build&&!dlg.next){for(let i=s.got;i<s.build.length;i++)pickTile(s,$('tiles').querySelector(`.tile[data-i="${i}"]`));continue}
  advance();
 }
 soundOn=snd;if(TTS)try{speechSynthesis.cancel()}catch(e){}
}
(()=>{const grid=document.querySelector('#startPanel .mgrid');if(!grid)return;
 grid.insertAdjacentHTML('beforeend','<button class="mi toggle" id="dbgBtn" aria-pressed="false">디버그</button>');
 $('spk').insertAdjacentHTML('beforebegin','<button class="spk" id="skipBtn" type="button" hidden style="width:auto;padding:0 8px;margin-left:auto;margin-right:6px;font-size:.8rem;font-weight:700">건너뛰기</button>');
 const upd=()=>{$('dbgBtn').setAttribute('aria-pressed',debugOn?'true':'false');$('skipBtn').hidden=!debugOn};upd();
 $('dbgBtn').addEventListener('click',()=>{debugOn=!debugOn;store.set(KEY('debug'),debugOn?'1':'0');upd();sfx('ok');toast(debugOn?'디버그: 대화에 건너뛰기 버튼':'디버그 꺼짐')});
 $('skipBtn').addEventListener('click',e=>{e.stopPropagation();skipTalk()});
})();
$('sndBtn').addEventListener('click',()=>{soundOn=!soundOn;store.set(KEY('sound'),soundOn?'1':'0');updateSound();sfx('ok')});
if($('listenBtn')){const upd=()=>$('listenBtn').setAttribute('aria-pressed',String(listenOn));upd();  // a game's shell may offer the 듣기 문제 toggle
 $('listenBtn').addEventListener('click',()=>{listenOn=!listenOn;store.set(KEY('listen'),listenOn?'1':'0');upd();sfx('ok');toast(listenOn?'복습에 듣기 문제가 나와요.':'듣기 문제를 껐어요.')})}
$('readBtn').addEventListener('click',()=>{
 if(!canSpeak()){toast('이 기기에는 한국어 음성이 없어요.');return}
 readOn=!readOn;store.set(KEY('read'),readOn?'1':'0');updateRead();toast(readOn?'대사를 소리 내서 읽어요.':'읽기를 껐어요.');if(readOn&&dlg)speak(dlg.cur.say||dlg.cur.ask||'');
});
$('closePanel').addEventListener('click',()=>$('panel').hidden=true);
$('panel').addEventListener('click',e=>{if(e.target.id==='panel')$('panel').hidden=true});
let armT;
$('resetBtn').addEventListener('click',()=>{
 const b=$('resetBtn');
 if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='한 번 더 누르면 지워져요';clearTimeout(armT);armT=setTimeout(()=>{b.classList.remove('armed');b.textContent='처음부터'},3000);return}
 b.classList.remove('armed');b.textContent='처음부터';
 state=fresh();state.seenIntro=true;save();loadZone(state.zone,state.x,state.y,state.dir);updateHud();updateQuest();$('panel').hidden=true;
 setTimeout(()=>openDialog(CH.introWho||G.title||'이야기',C.INTRO),300);  // starting over replays the intro, like a first start
});
document.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelector('.pad').addEventListener('touchstart',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
const KEYS={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
addEventListener('keydown',e=>{
 if(e.target.closest&&e.target.closest('textarea,input'))return;  // typing a note, not playing
 if(KEYS[e.key]){e.preventDefault();if(dirPress(KEYS[e.key]))return;held=KEYS[e.key];return}
 if(choosing()&&/^[1-4]$/.test(e.key)){const b=choiceBtns()[+e.key-1];if(b){e.preventDefault();b.click()}return}
 if(building()&&/^[1-9]$/.test(e.key)){const b=[...document.querySelectorAll('#tiles .tile')][+e.key-1];e.preventDefault();if(b&&!b.classList.contains('used'))b.click();return}  // N = the Nth tile where it sits (placed tiles leave a gap)
 if([' ','Enter','z','Z'].includes(e.key)){e.preventDefault();if(!e.repeat)interact();return}
 if(['x','X','Escape'].includes(e.key)){e.preventDefault();cancel();return}
 if(['m','M'].includes(e.key)&&!e.repeat){e.preventDefault();toggleStart()}
});
addEventListener('keyup',e=>{if(KEYS[e.key]===held)held=null});

/* ---------- chapters (each keeps its own save; old chapters are never overwritten) ---------- */
const BASE_TILES={...TILES};
function boot(id){
 CH=CHAPTERS.find(c=>c.id===id)||CHAPTERS[0];
 C=CH.make();
 Object.keys(TILES).forEach(k=>{if(!(k in BASE_TILES))delete TILES[k]});Object.assign(TILES,C.TILES||{});
 player.look=typeof C.PLAYER==='function'?myLook():myLook(C.PLAYER||CREW_LOOK);  // PLAYER as a function = a disguise, drawn at render time // a chapter may put the player in someone else's shoes (5장: Terence)
 if(dlg){dlg=null;clearInterval(typing?.id);$('dlg').hidden=true}
 pending=null;held=null;warping=false;$('panel').hidden=true;$('chPanel').hidden=true;$('toast').hidden=true;logSel=null;
 store.set(KEY('chapter'),CH.id);
 loadState();loadTalk();
 loadZone(state.zone,state.x,state.y,state.dir);
 $('chName').textContent=CH.n;
 updateHud();updateQuest();
 if(G.onBoot)G.onBoot(CH,C);  // the game's own page parts for this chapter (단어 마을: tips, news sources)
 if(!state.seenIntro){state.seenIntro=true;save();const intro=()=>setTimeout(()=>openDialog(CH.introWho||G.title||'이야기',C.INTRO),300);if(me||!CREATOR)intro();else openMe(intro)}  // first time ever: make your character first
 else setTimeout(()=>{if(!dlg&&!panelOpen())greet()},400);  // loaded in a room whose greeting hasn't happened (reloaded mid-scene): it starts over
}
function chapterProgress(c){try{const s=JSON.parse(store.get(c.save)||'null');return s?{got:(s.badges||[]).length,done:!!(s.f&&s.f.done)}:{got:0,done:false}}catch(e){return {got:0,done:false}}}
function openChapters(){
 $('chList').innerHTML=CHAPTERS.map(c=>{const p=chapterProgress(c);
  return `<button class="chap${c===CH?' cur':''}" data-id="${c.id}"><span class="cn" style="background:${c.color}">${c.n}</span><span class="ci"><b>${c.title}</b><small>${c.place||''}</small></span><span class="cp">${p.done?'끝':p.got+'/'+c.words}</span></button>`}).join('');
 $('chList').querySelectorAll('.chap').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.id;$('chPanel').hidden=true;if(id!==CH.id){boot(id);sfx('door')}}));
 $('chPanel').hidden=false;$('chList').querySelector('.cur')?.focus();
}
$('chBtn').addEventListener('click',openChapters);
$('chPanel').addEventListener('click',e=>{if(e.target.id==='chPanel')$('chPanel').hidden=true});
$('chClose').addEventListener('click',()=>$('chPanel').hidden=true);

/* ---------- start ---------- */
function start(){
 if(TTS){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
 updateSound();updateRead();
 const want=new URLSearchParams(location.search).get('ch')||store.get(KEY('chapter'));
 boot(CHAPTERS.some(c=>c.id===want)?want:CHAPTERS[0].id); // first visit starts at chapter 1; after that, the last chapter played
 requestAnimationFrame(loop);
}
window.claude?.hot?.ready?window.claude.hot.ready(start):start();
