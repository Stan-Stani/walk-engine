// Hands-on controller for manual playtests of any game on this engine: one persistent phone-sized Chrome; each command does one
// thing like a player would and saves a screenshot. Usage, from a game's repo root (after its build):
//   C=../walk-engine/tools/ctl.mjs
//   node $C start [ch1]     open the game fresh (no saves) at 400×820
//   node $C resume [ch1]    reopen the game where its save is (after stop, a crash, or a break), keeping saves and screenshots
//   node $C key <Key> [n]   press a key n times: ArrowUp/Down/Left/Right, z (A), x (B), m (START), Enter, 1–4
//   node $C walk <dir> <n>  take n steps (up/down/left/right)
//   node $C tap <x> <y>     tap the screen at a point (CSS px of the 400×820 screenshot)
//   node $C tapword <word>  tap the first visible word with this text (as a finger would)
//   node $C shot            just look
//   node $C look            look closer, like holding the phone up to your eyes: the game screen around you, 6× and unsmoothed
//   node $C look all        the whole game screen, 4×
//   node $C look <col> <row> [w] [h]   a part of the game screen, in its squares (0–10 across, 0–9 down from the top left), 6×
//   node $C stop
// After each action it prints the screenshot path and the text a player can see (dialogue, choices, popups, toasts).
import {spawn,execSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();if(!fs.existsSync(ROOT+'/index.html')){console.log('run from a game repo root (no index.html here)');process.exit(1)}
// CTL_SESSION=name: a separate Chrome (profile, port, screenshots) per tester, so two can play at once (never more than two)
const SES=(process.env.CTL_SESSION||'').replace(/[^\w-]/g,'');
const DIR='/tmp/'+path.basename(ROOT)+'-manual'+(SES?'-'+SES:'');const PORT=9555+(SES?1+[...SES].reduce((h,c)=>(h*31+c.charCodeAt(0))%200,7):0);
const [,,cmd,...args]=process.argv;const wait=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(DIR+'/shots',{recursive:true});
if(cmd==='stop'){try{execSync(`pkill -9 -f "user-data-dir=${DIR}/[p]rof"`)}catch(e){}console.log('stopped');process.exit(0)}
if(cmd==='resume'){  // relaunch Chrome on the same profile: the game's saves (localStorage) are still there
  try{execSync(`pkill -9 -f "user-data-dir=${DIR}/[p]rof"`)}catch(e){}await wait(500);
  if(!fs.existsSync(DIR+'/index.html'))fs.copyFileSync(ROOT+'/index.html',DIR+'/index.html');
  const c=spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,'about:blank'],{stdio:'ignore',detached:true});c.unref();
}
if(cmd==='start'){
  try{execSync(`pkill -9 -f "user-data-dir=${DIR}/[p]rof"`)}catch(e){}await wait(500);
  fs.rmSync(DIR+'/prof',{recursive:true,force:true});fs.copyFileSync(ROOT+'/index.html',DIR+'/index.html');
  for(const f of fs.readdirSync(DIR+'/shots'))fs.unlinkSync(DIR+'/shots/'+f);
  const c=spawn('flatpak',['run',`--filesystem=${DIR}`,'com.google.Chrome','--headless=new','--mute-audio','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,`--user-data-dir=${DIR}/prof`,'about:blank'],{stdio:'ignore',detached:true});c.unref();
}
let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const p=l.find(x=>x.type==='page');if(p)ws=p.webSocketDebuggerUrl}catch(e){}if(!ws)await wait(500)}
if(!ws){console.log('browser not running — use: start');process.exit(1)}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);let id=0;const pend={};
sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d.result||d);delete pend[d.id]}};
const cdp=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async e=>(await cdp('Runtime.evaluate',{expression:e,returnByValue:true})).result?.value;
await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:820,deviceScaleFactor:2,mobile:true});
const KEYS={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,z:90,x:88,m:77,Enter:13,' ':32,'1':49,'2':50,'3':51,'4':52};
const press=async(k,hold=60)=>{const code=KEYS[k]||0;await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:k,windowsVirtualKeyCode:code});await wait(hold);await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:k,windowsVirtualKeyCode:code});await wait(120)};
const tap=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await wait(250)};
if(cmd==='start'||cmd==='resume'){await cdp('Page.navigate',{url:`file://${DIR}/index.html?ch=${args[0]||'ch1'}`});await wait(2500)}
else if(cmd==='key'){for(let i=0;i<(+args[1]||1);i++)await press(args[0]);await wait(500)}
else if(cmd==='walk'){const k={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[args[0]];for(let i=0;i<(+args[1]||1);i++){await press(k,170);await wait(80)}await wait(300)}
else if(cmd==='tap'){await tap(+args[0],+args[1]);await wait(300)}
else if(cmd==='tapword'){const r=await ev(`(()=>{const w=[...document.querySelectorAll('.w,.gl,button,.mo,.mi,.choice,.tile,a')].find(e=>!e.closest("[hidden]")&&e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(args.join(' '))});if(!w)return null;const b=w.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`);
  if(!r){console.log('no visible "'+args.join(' ')+'" to tap')}else{await tap(r[0],r[1]);await wait(300)}}
else if(cmd==='look'){
  /* read the live game canvas pixel for pixel and blow it up without smoothing; faint lines mark the map's 16px squares */
  const url=await ev(`(()=>{if(typeof cv==='undefined'||typeof CAM==='undefined')return null;const W=cv.width,H=cv.height,a=${JSON.stringify(args)};
    let x0,y0,w,h,k=6;
    if(a[0]==='all'){x0=0;y0=0;w=W;h=H;k=4}
    else if(a.length>=2){x0=+a[0]*16;y0=+a[1]*16;w=(+a[2]||5)*16;h=(+a[3]||4)*16}
    else{const px=player.x*TS-CAM.x+8,py=player.y*TS-CAM.y+6;w=112;h=80;x0=Math.round(px-w/2);y0=Math.round(py-h/2)}
    x0=Math.max(0,Math.min(x0,W-1));y0=Math.max(0,Math.min(y0,H-1));w=Math.min(w,W-x0);h=Math.min(h,H-y0);
    const o=document.createElement('canvas');o.width=w*k;o.height=h*k;const c=o.getContext('2d');c.imageSmoothingEnabled=false;
    c.drawImage(cv,x0,y0,w,h,0,0,w*k,h*k);c.strokeStyle='rgba(0,0,0,.16)';
    for(let x=x0;x<x0+w;x++)if((x+CAM.x)%16===0){c.beginPath();c.moveTo((x-x0)*k+.5,0);c.lineTo((x-x0)*k+.5,o.height);c.stroke()}
    for(let y=y0;y<y0+h;y++)if((y+CAM.y)%16===0){c.beginPath();c.moveTo(0,(y-y0)*k+.5);c.lineTo(o.width,(y-y0)*k+.5);c.stroke()}
    return o.toDataURL('image/png')})()`);
  if(!url){console.log('no game screen to look at');process.exit(1)}
  const n=fs.readdirSync(DIR+'/shots').length,file=`${DIR}/shots/${String(n).padStart(3,'0')}-look${args.length?'-'+args.join('_'):''}.png`;
  fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64'));console.log(file);sock.close();process.exit(0);
}
else if(cmd!=='shot'&&cmd!=='start'&&cmd!=='resume'){console.log('unknown command');process.exit(1)}
const n=fs.readdirSync(DIR+'/shots').length;const file=`${DIR}/shots/${String(n).padStart(3,'0')}-${cmd}${args.length?'-'+args.join('_').replace(/[^\w가-힣-]/g,''):''}.png`;
const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(shot.data,'base64'));
const seen=await ev(`(()=>{const vis=e=>e&&!e.closest("[hidden]")&&e.getClientRects().length>0,o=[];const t=id=>document.getElementById(id);
 if(vis(t('dlg')))o.push('DIALOGUE ['+(t('who')?.textContent||'')+'] '+t('txt').textContent);
 const ch=[...document.querySelectorAll('.choice')].filter(vis).map((b,i)=>(i+1)+') '+b.textContent.trim());if(ch.length)o.push('CHOICES '+ch.join('  '));
 const tl=[...document.querySelectorAll('#tiles .tile, #tiles button')].filter(vis).map(b=>b.textContent.trim());if(tl.length)o.push('WORD TILES '+tl.join(' | '));
 if(vis(t('gloss')))o.push('POPUP '+t('gloss').innerText.replace(/\\s+/g,' '));
 if(vis(t('toast')))o.push('TOAST '+t('toast').textContent);
 const q=t('questTxt')||t('quest');if(q&&q.textContent)o.push('목표 '+q.textContent);
 for(const p of document.querySelectorAll('.panel'))if(vis(p))o.push('PANEL '+p.innerText.replace(/\\s+/g,' ').slice(0,400));
 return o.join('\\n')})()`);
console.log(file+'\n'+(seen||'(no text on screen)'));sock.close();process.exit(0);
