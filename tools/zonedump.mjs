// Zone dump: draws every zone of every chapter whole (every tile plus the front layer, no people, no player) into PNGs, so an
// art or layout refactor can be checked pixel by pixel instead of by eye. From a game's repo root, after python3 build.py:
//   node ../walk-engine/tools/zonedump.mjs <out-dir> [ch1,ch2,…]
// Each zone is drawn with the story flags all off, all on and in two fixed random mixes (so posters, lamps and festival art show), at two moments of the
// animation clock, with Math.random seeded. Writes <out-dir>/<ch>/<zone>.<off|on>.<t>.png. Compare two dumps with zonediff.py.
// A tile that throws (e.g. under the all-on flags) is drawn magenta and listed; that happens the same way before and after.
import {spawn,execSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();
if(!fs.existsSync(path.join(ROOT,'index.html'))){console.log('run from a game repo root (no index.html here)');process.exit(1)}
const [,,outDir,only]=process.argv;if(!outDir){console.log('usage: node ../walk-engine/tools/zonedump.mjs <out-dir> [ch1,ch2,…]');process.exit(1)}
fs.mkdirSync(outDir,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// one Chrome at a time on this machine: share the playtest lock
const LOCK='/tmp/seongsilho-play.lock';
for(;;){try{fs.writeFileSync(LOCK,String(process.pid),{flag:'wx'});break}catch(e){let stale=true;try{process.kill(+fs.readFileSync(LOCK,'utf8'),0);stale=false}catch(_){}if(stale){fs.rmSync(LOCK,{force:true});continue}await wait(1000)}}
const DIR=fs.mkdtempSync('/tmp/zonedump-');fs.copyFileSync(path.join(ROOT,'index.html'),DIR+'/index.html');
const PORT=9800+Math.floor(Math.random()*150);
const done=()=>{try{execSync(`pkill -9 -f "user-data-dir=${DIR}/prof"`)}catch(e){}try{if(fs.readFileSync(LOCK,'utf8')===String(process.pid))fs.rmSync(LOCK)}catch(e){}fs.rmSync(DIR,{recursive:true,force:true})};
process.on('exit',done);
spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,`file://${DIR}/index.html`],{stdio:'ignore',detached:true}).unref();
let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const p=l.find(x=>x.type==='page');if(p)ws=p.webSocketDebuggerUrl}catch(e){}if(!ws)await wait(500)}
if(!ws){console.log('chrome did not start');process.exit(2)}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);let id=0;const pend={};
sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d.result||d);delete pend[d.id]}};
const cdp=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async e=>{const r=await Promise.race([cdp('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}),wait(60000).then(()=>{throw new Error('page did not answer in 60 s')})]);  // a hung page fails loudly instead of holding the lock
 if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'eval failed');return r.result?.value};
await wait(1500);
const chs=(await ev('CHAPTERS.map(c=>c.id)')).filter(c=>!only||only.split(',').includes(c));
const ME={hair:'#2A2F4A',skin:'#F1C9A5',shirt:'#F4F2EA',pants:'#2B3A5C',belt:'#9B2D30',style:'short'};
let errors=0;
for(const ch of chs){
 // a fresh save at the chapter's start, intro seen, then load the chapter
 await ev(`localStorage.clear();localStorage.setItem(KEY('me'),${JSON.stringify(JSON.stringify(ME))});
  {const CH=CHAPTERS.find(c=>c.id===${JSON.stringify(ch)}),st=CH.start;
   localStorage.setItem(CH.save,JSON.stringify({v:1,zone:st.zone,x:st.x,y:st.y,dir:st.dir,badges:[],lv:{},items:[],f:{},seenIntro:true}))}
  setTimeout(()=>location.href=location.pathname+'?ch=${ch}',30);1`);
 await wait(2200);
 // all in one synchronous call, so no game frame draws in between; the canvas is put back afterwards
 const res=await ev(`(()=>{
  const seeded=s=>()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const ALL=new Proxy({},{get:(o,k)=>typeof k==='string'?1:undefined});
  // two fixed random mixes too, so art that needs one flag on and another off (a poster before a meeting) gets compared
  const mix=seed=>new Proxy({},{get:(o,k)=>{if(typeof k!=='string')return undefined;let h=seed;for(const c of k)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>7)&1}});
  const keep={W:cv.width,H:cv.height,f:state.f,rnd:Math.random,Z,ZID,MAP,MW,MH,NPCS,px:player.x,py:player.y,sit:player.sit};
  const out=[],bad=[];Object.assign(player,{x:-99,y:-99,sit:null});NPCS=[];
  const safe=(fn,x,y,X,Y,t)=>{try{fn(X,Y,x,y,t)}catch(e){g.fillStyle='#FF00FF';g.fillRect(X,Y,16,16);bad.push(ZID+' '+x+','+y)}};
  for(const id of Object.keys(C.ZONES)){Z=C.ZONES[id];ZID=id;MAP=Z.map.map(r=>r.split(''));MW=MAP[0].length;MH=MAP.length;
   for(const [fl,f] of [['off',{}],['on',ALL],['mixA',mix(2166136261)],['mixB',mix(97)]])for(const t of [0,1750]){
    state.f=f;Math.random=seeded(7);cv.width=MW*TS;cv.height=MH*TS;g.imageSmoothingEnabled=false;
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)safe((X,Y,x,y,t)=>tile(x,y,X,Y,t),x,y,x*TS,y*TS,t);  // the engine's own tile(): floor layer included
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const L=Z.legend[at(x,y)];if(L&&L.front&&TILES[L.front])safe(TILES[L.front],x,y,x*TS,y*TS,t)}
    out.push([id+'.'+fl+'.'+t,cv.toDataURL('image/png')])}}
  state.f=keep.f;Math.random=keep.rnd;Z=keep.Z;ZID=keep.ZID;MAP=keep.MAP;MW=keep.MW;MH=keep.MH;NPCS=keep.NPCS;
  Object.assign(player,{x:keep.px,y:keep.py,sit:keep.sit});cv.width=keep.W;cv.height=keep.H;g.imageSmoothingEnabled=false;
  return {out,bad:[...new Set(bad)]}})()`);
 fs.mkdirSync(path.join(outDir,ch),{recursive:true});
 for(const [n,u] of res.out)fs.writeFileSync(path.join(outDir,ch,n+'.png'),Buffer.from(u.split(',')[1],'base64'));
 console.log(`${ch}: ${res.out.length} images${res.bad.length?` · ${res.bad.length} tiles threw: ${res.bad.slice(0,8).join('; ')}${res.bad.length>8?' …':''}`:''}`);errors+=res.bad.length;
}
console.log('dump →',outDir);sock.close();process.exit(0);
