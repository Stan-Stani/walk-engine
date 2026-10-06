// Pixel inspector: renders game states and saves tile regions of the canvas, blown up without smoothing, so sprite art can be
// checked pixel by pixel (a phone-sized screenshot hides overlaps and odd shapes).
// Works for every game on this engine. Usage, from a game's repo root after python3 build.py:
//   node ../walk-engine/tools/zoom.mjs <spec.json> <out-dir>
// spec.json: {ch:'ch1', scale:8, scenes:[{name, save:{…chapter save…}, setup:'js run after load', wait:ms, tiles:[x0,y0,x1,y1]}]}
//   save: written to the chapter's save key before loading (zone, x, y, dir, badges, items, f …; seenIntro is set for you)
//   tiles: map tiles to keep (inclusive); the camera is pointed at their centre first
// Writes <out-dir>/<name>.png per scene and <out-dir>/sheet.png with every scene side by side, labelled.
import {spawn,execSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();  // the game whose built index.html is inspected
if(!fs.existsSync(path.join(ROOT,'index.html'))){console.log('run from a game repo root (no index.html here)');process.exit(1)}
const [,,specPath,outDir]=process.argv;if(!specPath||!outDir){console.log('usage: node ../walk-engine/tools/zoom.mjs <spec.json> <out-dir>');process.exit(1)}
const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));fs.mkdirSync(outDir,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// one Chrome at a time on this machine: share the playtest lock
const LOCK='/tmp/seongsilho-play.lock';
for(;;){try{fs.writeFileSync(LOCK,String(process.pid),{flag:'wx'});break}catch(e){let stale=true;try{process.kill(+fs.readFileSync(LOCK,'utf8'),0);stale=false}catch(_){}if(stale){fs.rmSync(LOCK,{force:true});continue}await wait(1000)}}
const DIR=fs.mkdtempSync('/tmp/zoom-');fs.copyFileSync(path.join(ROOT,'index.html'),DIR+'/index.html');
const PORT=9800+Math.floor(Math.random()*150);
const done=()=>{try{execSync(`pkill -9 -f "user-data-dir=${DIR}/prof"`)}catch(e){}try{if(fs.readFileSync(LOCK,'utf8')===String(process.pid))fs.rmSync(LOCK)}catch(e){}fs.rmSync(DIR,{recursive:true,force:true})};
process.on('exit',done);
spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,`file://${DIR}/index.html?ch=${spec.ch||'ch1'}`],{stdio:'ignore'});
let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const p=l.find(x=>x.type==='page');if(p)ws=p.webSocketDebuggerUrl}catch(e){}if(!ws)await wait(500)}
if(!ws){console.log('chrome did not start');process.exit(2)}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);let id=0;const pend={};
sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d.result||d);delete pend[d.id]}};
const cdp=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async e=>{const r=await cdp('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'eval failed');return r.result?.value};
await wait(1500);
const ch=spec.ch||'ch1',scale=spec.scale||8,crops=[];
for(const sc of spec.scenes){
  const save={v:1,badges:[],lv:{},items:[],f:{},seenIntro:true,...sc.save};
  // a fixed avatar, so the 나 꾸미기 panel never opens; then load the state fresh
  await ev(`localStorage.clear();localStorage.setItem(KEY('me'),JSON.stringify(${JSON.stringify(spec.me||{hair:'#2A2F4A',skin:'#F1C9A5',shirt:'#F4F2EA',pants:'#2B3A5C',belt:'#9B2D30',style:'short'})}));
    localStorage.setItem(CHAPTERS.find(c=>c.id===${JSON.stringify(ch)}).save,${JSON.stringify(JSON.stringify(save))});location.reload();1`).catch(()=>{});
  await wait(1800);
  if(sc.setup)await ev(sc.setup);
  const [x0,y0,x1,y1]=sc.tiles;
  await ev(`camT=[${(x0+x1)/2},${(y0+y1)/2}];1`);await wait(sc.wait||900);
  const url=await ev(`(()=>{const sx=${x0}*TS-CAM.x,sy=${y0}*TS-CAM.y,w=${x1-x0+1}*TS,h=${y1-y0+1}*TS,k=${scale};
    const o=document.createElement('canvas');o.width=w*k;o.height=h*k;const c=o.getContext('2d');c.imageSmoothingEnabled=false;
    c.fillStyle='#ff00ff';c.fillRect(0,0,o.width,o.height);  // magenta = outside the camera view
    c.drawImage(cv,sx,sy,w,h,0,0,w*k,h*k);
    c.strokeStyle='rgba(0,0,0,.18)';for(let i=1;i<${x1-x0+1};i++){c.beginPath();c.moveTo(i*16*k+.5,0);c.lineTo(i*16*k+.5,o.height);c.stroke()}
    for(let j=1;j<${y1-y0+1};j++){c.beginPath();c.moveTo(0,j*16*k+.5);c.lineTo(o.width,j*16*k+.5);c.stroke()}  // faint tile grid
    return o.toDataURL('image/png')})()`);
  fs.writeFileSync(path.join(outDir,sc.name+'.png'),Buffer.from(url.split(',')[1],'base64'));crops.push([sc.name,url]);console.log('saved',sc.name);
}
// all scenes side by side, labelled
const sheet=await ev(`(async()=>{const items=${JSON.stringify(crops)};const ims=await Promise.all(items.map(([n,u])=>new Promise(r=>{const i=new Image();i.onload=()=>r([n,i]);i.src=u})));
  const pad=16,lab=28,W=ims.reduce((a,[,i])=>a+i.width+pad,pad),H=Math.max(...ims.map(([,i])=>i.height))+lab+pad*2;
  const o=document.createElement('canvas');o.width=W;o.height=H;const c=o.getContext('2d');c.fillStyle='#1d2128';c.fillRect(0,0,W,H);
  c.font='16px sans-serif';c.fillStyle='#f4d9a6';let x=pad;for(const [n,i] of ims){c.fillText(n,x,pad+14);c.drawImage(i,x,pad+lab);x+=i.width+pad}
  return o.toDataURL('image/png')})()`);
fs.writeFileSync(path.join(outDir,'sheet.png'),Buffer.from(sheet.split(',')[1],'base64'));console.log('sheet →',path.join(outDir,'sheet.png'));
sock.close();process.exit(0);
