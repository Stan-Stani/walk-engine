// Line check: every Korean string in a game's sources, laid out in the dialogue box at phone width (400px, as the playtests),
// with and without a portrait, counted in lines. The box is a fixed three lines, so anything longer must be split or shortened.
// From a game's repo root, after python3 build.py:
//   node ../walk-engine/tools/linecheck.mjs [max-lines=3]
// Prints every string over the limit (with its file) and exits 1 if there is one.
import {spawn,execSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();
if(!fs.existsSync(path.join(ROOT,'index.html'))){console.log('run from a game repo root (no index.html here)');process.exit(1)}
const MAX=+(process.argv[2]||3);
// every quoted string with Hangul in src/chapters/*.js and the game's other data files (not the engine), minus /*nolex*/ lines
const files=[...fs.readdirSync(path.join(ROOT,'src/chapters')).filter(f=>f.endsWith('.js')).map(f=>'src/chapters/'+f),
 ...fs.readdirSync(path.join(ROOT,'src')).filter(f=>f.endsWith('.js')&&!/^(engine|lexicon)/.test(f)).map(f=>'src/'+f)];
const strings=[];const seen=new Set();
for(const f of files)for(const line of fs.readFileSync(path.join(ROOT,f),'utf8').split('\n')){
 if(line.includes('/*nolex*/'))continue;
 for(const m of line.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)){const s=(m[1]??m[2]).replace(/\\(.)/g,'$1');
  if(/[가-힣]/.test(s)&&s.length>12&&!seen.has(s)){seen.add(s);strings.push([s,f])}}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const LOCK='/tmp/seongsilho-play.lock';
for(;;){try{fs.writeFileSync(LOCK,String(process.pid),{flag:'wx'});break}catch(e){let stale=true;try{process.kill(+fs.readFileSync(LOCK,'utf8'),0);stale=false}catch(_){}if(stale){fs.rmSync(LOCK,{force:true});continue}await wait(1000)}}
const DIR=fs.mkdtempSync('/tmp/linecheck-');fs.copyFileSync(path.join(ROOT,'index.html'),DIR+'/index.html');
const PORT=9600+Math.floor(Math.random()*90);
process.on('exit',()=>{try{execSync(`pkill -9 -f "user-data-dir=${DIR}/prof"`)}catch(e){}try{if(fs.readFileSync(LOCK,'utf8')===String(process.pid))fs.rmSync(LOCK)}catch(e){}fs.rmSync(DIR,{recursive:true,force:true})});
spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,'about:blank'],{stdio:'ignore',detached:true}).unref();
let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const p=l.find(x=>x.type==='page');if(p)ws=p.webSocketDebuggerUrl}catch(e){}if(!ws)await wait(500)}
if(!ws){console.log('chrome did not start');process.exit(2)}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);let id=0;const pend={};
sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d.result||d);delete pend[d.id]}};
const cdp=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method:m,params:p}))});
await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:820,deviceScaleFactor:1,mobile:true});
await cdp('Page.navigate',{url:`file://${DIR}/index.html?listen=0`});await wait(5000);
const res=(await cdp('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
 if($('mePanel'))$('mePanel').hidden=true;const box=$('dlg'),t=$('txt');box.hidden=false;t.style.minHeight='0';
 const lh=parseFloat(getComputedStyle(t).lineHeight);const out=[];
 for(const [s,f] of ${JSON.stringify(strings)}){const r={s,f};
  for(const face of [false,true]){box.classList.toggle('hasface',face);t.innerHTML=glossHTML(s);r[face?'face':'plain']=Math.round(t.scrollHeight/lh)}
  out.push(r)}
 box.hidden=true;t.style.minHeight='';return JSON.stringify({lh,out})})()`})).result.value;
const {out}=JSON.parse(res);
const over=out.filter(r=>r.face>MAX||r.plain>MAX);
const dist={};for(const r of out)dist[r.face]=(dist[r.face]||0)+1;
console.log(`${out.length} strings · lines with a portrait: `+Object.entries(dist).map(([k,v])=>`${k}: ${v}`).join(', '));
console.log(`over ${MAX} lines: ${over.length}`+over.map(r=>`\n  ${r.face}/${r.plain} lines · ${r.f} · ${r.s}`).join(''));
sock.close();process.exit(over.length?1:0);
