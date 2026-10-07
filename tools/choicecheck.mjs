// Choice check: opens every question with answer choices in every chapter of a game at phone width (400px, like the playtests)
// and measures how its choices lay out, so a layout change is checked on the real answers, longest ones included.
// From a game's repo root, after python3 build.py:
//   node ../walk-engine/tools/choicecheck.mjs <out-dir>
// Prints, per number of choices, how many rows they took; flags any answer cut off or wrapped to 3+ lines; and saves screenshots of
// the tallest boxes and the longest answers to <out-dir> (worst first). Exit code 1 if any answer is cut off.
import {spawn,execSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();
if(!fs.existsSync(path.join(ROOT,'index.html'))){console.log('run from a game repo root (no index.html here)');process.exit(1)}
const outDir=process.argv[2];if(!outDir){console.log('usage: node ../walk-engine/tools/choicecheck.mjs <out-dir>');process.exit(1)}
fs.mkdirSync(outDir,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// one Chrome at a time on this machine: share the playtest lock
const LOCK='/tmp/seongsilho-play.lock';
for(;;){try{fs.writeFileSync(LOCK,String(process.pid),{flag:'wx'});break}catch(e){let stale=true;try{process.kill(+fs.readFileSync(LOCK,'utf8'),0);stale=false}catch(_){}if(stale){fs.rmSync(LOCK,{force:true});continue}await wait(1000)}}
const DIR=fs.mkdtempSync('/tmp/choicecheck-');fs.copyFileSync(path.join(ROOT,'index.html'),DIR+'/index.html');
const PORT=9700+Math.floor(Math.random()*90);
const done=()=>{try{execSync(`pkill -9 -f "user-data-dir=${DIR}/prof"`)}catch(e){}try{if(fs.readFileSync(LOCK,'utf8')===String(process.pid))fs.rmSync(LOCK)}catch(e){}fs.rmSync(DIR,{recursive:true,force:true})};
process.on('exit',done);for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>process.exit(130));
spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,'about:blank'],{stdio:'ignore',detached:true}).unref();
let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const p=l.find(x=>x.type==='page');if(p)ws=p.webSocketDebuggerUrl}catch(e){}if(!ws)await wait(500)}
if(!ws){console.log('chrome did not start');process.exit(2)}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);let id=0;const pend={};
sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d.result||d);delete pend[d.id]}};
const cdp=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async(e,aw=false)=>{const r=await cdp('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:aw,timeout:120000});return r.result?.value};
await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:820,deviceScaleFactor:1,mobile:true});
await cdp('Page.navigate',{url:`file://${DIR}/index.html?listen=0`});await wait(2500);

// in the page: every chapter, every question with opts, opened as a conversation; measure the choices once they show
const results=await ev(`(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),out=[];
 for(const ch of CHAPTERS){
  boot(ch.id);await sleep(400);
  if($('mePanel'))$('mePanel').hidden=true;  // the first-run 나 꾸미기 panel would cover the screen
  if(dlg)closeDialog();
  const qs=[...(C.BANK||[])];Object.values(C.Q||{}).forEach(a=>qs.push(...a));
  const seen=new Set();
  for(const q of qs){
   if(!q||!q.opts)continue;const key=q.ask+'|'+q.opts.map(o=>o[0]).join('/');if(seen.has(key))continue;seen.add(key);
   openDialog('검사',[{...q,who:q.who||'나'}]);
   for(let i=0;i<40&&$('choices').hidden;i++){if(typing&&!typing.finished)typing.fin();await sleep(25)}
   await sleep(30);
   const bs=[...document.querySelectorAll('#choices .choice')],scr=$('screen').getBoundingClientRect(),box=$('dlg').getBoundingClientRect();
   const lh=parseFloat(getComputedStyle(bs[0]||document.body).lineHeight)||22;
   const rows=new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top))).size;
   const lines=Math.max(...bs.map(b=>{const cs=getComputedStyle(b);return Math.round((b.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom))/lh)}));
   const cut=bs.some(b=>b.scrollWidth>b.clientWidth+1);
   out.push({ch:ch.id,ask:q.ask,opts:q.opts.map(o=>o[0]),n:bs.length,rows,lines,cut,boxPct:Math.round(box.height/scr.height*100)});
   closeDialog();await sleep(10);
  }
 }
 return out})()`,true);
if(!Array.isArray(results)){console.log('the page did not answer:',results);process.exit(2)}

const byN={};for(const r of results){const k=r.n+' choices';byN[k]=byN[k]||{};byN[k][r.rows+' row(s)']=(byN[k][r.rows+' row(s)']||0)+1}
console.log(`${results.length} questions`);for(const [k,v] of Object.entries(byN))console.log(`  ${k}: `+Object.entries(v).map(([a,b])=>`${b}× ${a}`).join(', '));
const cut=results.filter(r=>r.cut),tall=results.filter(r=>r.lines>=3);
console.log(`cut off: ${cut.length}`+cut.map(r=>`\n  ${r.ch} ${r.opts.join(' / ')}`).join(''));
console.log(`answers wrapped to 3+ lines: ${tall.length}`+tall.map(r=>`\n  ${r.ch} ${r.opts.join(' / ')}`).join(''));
const worst=[...results].sort((a,b)=>b.boxPct-a.boxPct).slice(0,4).concat([...results].sort((a,b)=>Math.max(...b.opts.map(o=>o.length))-Math.max(...a.opts.map(o=>o.length))).slice(0,4));
console.log('tallest boxes: '+[...results].sort((a,b)=>b.boxPct-a.boxPct).slice(0,4).map(r=>`${r.boxPct}% (${r.opts.join(' / ')})`).join(', '));
// screenshots of the worst cases, reopened one at a time
let n=0;for(const r of worst){
 await ev(`(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const ch=CHAPTERS.find(c=>c.id===${JSON.stringify(r.ch)});if(CH!==ch){boot(ch.id);await sleep(400)}if(dlg)closeDialog();
  const qs=[...(C.BANK||[])];Object.values(C.Q||{}).forEach(a=>qs.push(...a));const q=qs.find(q=>q&&q.opts&&q.ask===${JSON.stringify(r.ask)});
  openDialog('검사',[{...q,who:q.who||'나'}]);for(let i=0;i<40&&$('choices').hidden;i++){if(typing&&!typing.finished)typing.fin();await sleep(25)}await sleep(80)})()`,true);
 const s=await cdp('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:400,height:460,scale:1}});
 fs.writeFileSync(path.join(outDir,`${String(++n).padStart(2,'0')}-${r.ch}-${r.boxPct}pct.png`),Buffer.from(s.data,'base64'));
}
fs.writeFileSync(path.join(outDir,'choices.json'),JSON.stringify(results,null,1));
console.log(`screenshots → ${outDir}`);
sock.close();process.exit(cut.length?1:0);
