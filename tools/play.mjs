// The playtest runner every game uses (its tests/play.mjs calls play(root)): builds the game into a temp folder, plays
// tests/walk/<chapter>.js by keyboard in headless Chrome with the game's own tests/driver.js, saves screenshots to tests/shots/<walk>/.
//   node tests/play.mjs ch1            the chapter (default: the game's smoke chapter in games.json)
//   node tests/play.mjs ch1 ch1-alt    another authored walk of that chapter (its own shots folder)
//   node tests/play.mjs ch1 --fast     the quick check after an engine change: the page's clock runs 3× (timers, animation frames,
//     performance.now and Date, so the review schedule keeps pace and it plays out like the full run; the game loop takes at most
//     50 ms a frame, so more would only skip frames) and only the end screenshot is kept. The full speed run is for chapter work.
//   node ../walk-engine/tools/play.mjs ch1 --fast   (from a game's root) the same without the game's wrapper
// In fast mode the real clock stays at window.__realNow: a driver measures its time limits with it, so a busy machine (slow frames)
// doesn't turn a wait into a failure.
import {execFileSync,spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {chrome} from './chrome.mjs';
const here=path.dirname(new URL(import.meta.url).pathname);
export async function play(root){
 const FAST=process.argv.includes('--fast'),argv=process.argv.slice(2).filter(a=>a!=='--fast');
 const me=JSON.parse(fs.readFileSync(path.join(here,'../games.json'),'utf8')).games.find(g=>g.dir===path.basename(root)||g.repo===path.basename(root));
 const ch=argv[0]||me?.smoke||'ch1',walkName=argv[1]||ch;
 // Alternate authored walks keep their own evidence instead of deleting the main chapter's contact sheets.
 const out=path.join(root,'tests/shots',walkName);fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
 // One Chrome at a time on this machine (7 GB RAM froze when several ran at once): take a lock, wait for it.
 // Watch handoffs so a queued run cannot miss the gap between another consumer's sequential tests.
 const LOCK='/tmp/seongsilho-play.lock';  // the same lock as zoom, zonedump, linecheck, choicecheck
 let lockLogAt=0;
 for(;;){try{fs.writeFileSync(LOCK,String(process.pid),{flag:'wx'});break}catch(e){
  let stale=true;try{process.kill(+fs.readFileSync(LOCK,'utf8'),0);stale=false}catch(_){}
  if(stale){fs.rmSync(LOCK,{force:true});continue}
  if(Date.now()-lockLogAt>=60000){console.log('waiting for another playtest to finish…');lockLogAt=Date.now()}
  // Watch the current inode for removal; a timeout still catches a crashed owner with a stale PID file.
  await new Promise(resolve=>{let watcher;const done=()=>{clearTimeout(timer);watcher?.close();resolve()},timer=setTimeout(done,2000);
   try{watcher=fs.watch(LOCK,done);watcher.on('error',done)}catch(e){done()}})}}
 const unlock=()=>{try{if(fs.readFileSync(LOCK,'utf8')===String(process.pid))fs.rmSync(LOCK)}catch(e){}};
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'play-'));
 // Killing the flatpak wrapper leaves Chrome running inside the sandbox (287 orphans once) — kill everything using this run's profile.
 const reap=()=>{try{execFileSync('pkill',['-9','-f',`user-data-dir=${tmp}/prof`])}catch(e){}};
 process.on('exit',()=>{reap();unlock();try{fs.rmSync(tmp,{recursive:true,force:true})}catch(e){}});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{unlock();process.exit(130)});
 execFileSync(process.env.WALK_PYTHON||'python3',[path.join(root,'build.py'),'--out',path.join(tmp,'built.html')]); // own build: safe when several chapters are tested at once
 const html=fs.readFileSync(path.join(tmp,'built.html'),'utf8');
 const driver=fs.readFileSync(path.join(root,'tests/driver.js'),'utf8');
 const walk=fs.readFileSync(path.join(root,'tests/walk',walkName+'.js'),'utf8');
 const WARP=`(()=>{const K=3,pn=performance.now.bind(performance),t0=pn(),st=setTimeout,si=setInterval,raf=requestAnimationFrame;window.__realNow=pn;performance.now=()=>t0+(pn()-t0)*K;
  window.setTimeout=(f,ms,...a)=>st(f,(+ms||0)/K,...a);window.setInterval=(f,ms,...a)=>si(f,(+ms||0)/K,...a);window.requestAnimationFrame=f=>raf(t=>f(t0+(t-t0)*K));
  const D=Date,dn=D.now.bind(D),d0=dn(),now=()=>d0+(dn()-d0)*K;window.Date=class extends D{constructor(...a){a.length?super(...a):super(now())}static now(){return now()}}})();`;
 fs.writeFileSync(path.join(tmp,'play.html'),(FAST?html.replace('<head>',`<head><script>${WARP}</script>`):html).replace('</body></html>',`<script>${driver}\ntry{localStorage.clear()}catch(e){}\nsetTimeout(()=>__play(${walk}),900);</script>\n</body></html>`));
 const port=9300+Math.floor(Math.random()*500);
 const c=spawn(...chrome(tmp,['--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${port}`,
  '--window-size=420,860',`--user-data-dir=${tmp}/prof`,'--autoplay-policy=no-user-gesture-required',`file://${tmp}/play.html?ch=${ch}`]),{stdio:'ignore'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const pg=l.find(t=>t.type==='page');if(pg)ws=pg.webSocketDebuggerUrl}catch(e){}if(!ws)await sleep(500)}
 if(!ws){console.error('chrome did not start');c.kill();process.exit(2)}
 const sock=new WebSocket(ws);let id=0;const pend={};
 const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method,params}))});
 let done=false;const queue=[];
 sock.onmessage=async ev=>{const m=JSON.parse(ev.data);if(m.id&&pend[m.id]){pend[m.id](m.result);delete pend[m.id];return}
  if(m.method==='Runtime.consoleAPICalled'){const t=(m.params.args[0]||{}).value||'';
   if(typeof t==='string'&&t.startsWith('SHOT:'))queue.push(t.slice(5));if(t==='DONE')done=true}};
 await new Promise(r=>sock.onopen=r);await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:400,height:820,deviceScaleFactor:1,mobile:true});
 const t0=Date.now();
 while(!done&&Date.now()-t0<600000){
  while(queue.length){const name=queue.shift();if(FAST){await send('Runtime.evaluate',{expression:'window.__shotDone=true'});continue}await sleep(300);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));await send('Runtime.evaluate',{expression:'window.__shotDone=true'})}
  await sleep(100);
 }
 const res=await send('Runtime.evaluate',{expression:'JSON.stringify({err:window.__err||["no run"],log:window.__log||[]})',returnByValue:true});
 const {err,log}=JSON.parse(res.result.value);
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'99-end.png'),Buffer.from(shot.data,'base64'));
 fs.writeFileSync(path.join(out,'log.txt'),'ERRORS:\n'+(err.join('\n')||'none')+'\n\nLOG:\n'+log.join('\n'));
 sock.close();c.kill();reap();
 console.log((done?'':'TIMEOUT\n')+'ERRORS: '+(err.length?'\n'+err.join('\n'):'none'));console.log('shots:',fs.readdirSync(out).filter(f=>f.endsWith('.png')).length,'→',out);
 process.exit(err.length||!done?1:0);
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)await play(process.cwd());
