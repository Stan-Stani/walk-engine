// A built game in headless Chrome for the engine tests: open(html, outDir) → t with
//   t.ev(js)     evaluate in the page (awaits promises, returns plain values)
//   t.tap(sel)   a real tap (mouse press + release) in the middle of a visible element
//   t.ok(c, m)   one check: prints ok / FAIL; t.fails counts the failures
//   t.shot(name) a screenshot in outDir;  t.sleep(ms);  t.errors: uncaught page errors;  t.close()
// The page starts fresh (its own profile) at ?ch=<ch>&listen=0, and 나 꾸미기 is taken as it is.
import {spawn,execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
import {chrome} from '../tools/chrome.mjs';
export async function open(html,out,ch){
 fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
 const dir=path.dirname(html),prof=path.join(dir,'prof-'+Math.random().toString(36).slice(2)),port=9800+Math.floor(Math.random()*150);
 const c=spawn(...chrome(dir,['--headless=new','--mute-audio','--hide-scrollbars','--disable-gpu',`--remote-debugging-port=${port}`,'--window-size=420,860',
  `--user-data-dir=${prof}`,`file://${html}?listen=0${ch?'&ch='+ch:''}`]),{stdio:'ignore'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const close=async()=>{try{sock.close()}catch(e){}c.kill();try{execFileSync('pkill',['-9','-f',`user-data-dir=${prof}`])}catch(e){}try{fs.rmSync(prof,{recursive:true,force:true})}catch(e){}};
 process.on('exit',()=>{c.kill();try{execFileSync('pkill',['-9','-f',`user-data-dir=${prof}`])}catch(e){}});
 let ws;for(let i=0;i<60&&!ws;i++){try{const l=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const pg=l.find(t=>t.type==='page');if(pg)ws=pg.webSocketDebuggerUrl}catch(e){}if(!ws)await sleep(300)}
 if(!ws)throw new Error('chrome did not start');
 const sock=new WebSocket(ws);let id=0;const pend={},errors=[];
 sock.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend[m.id]){pend[m.id](m.result);delete pend[m.id]}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]||m.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method,params}))});
 await new Promise(r=>sock.onopen=r);await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:400,height:820,deviceScaleFactor:2,mobile:true});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(e.slice(0,80)+' → '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value};
 const tap=async sel=>{const b=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.offsetParent===null)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  if(!b)throw new Error('not visible: '+sel);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:b[0],y:b[1],button:'left',clickCount:1});await sleep(250)};
 const t={ev,tap,sleep,errors,fails:0,close,
  ok(c,m){console.log((c?'  ok   ':'  FAIL ')+m);if(!c)t.fails++},
  async shot(n){const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,n+'.png'),Buffer.from(s.data,'base64'))}};
 await sleep(2500);
 if(await ev(`typeof $==='function'&&!!$('mePanel')&&!$('mePanel').hidden`)){  // a fresh profile starts in 나 꾸미기: take it as it is
  await ev(`[...$('mePanel').querySelectorAll('button')].find(b=>/이걸로|これで|OK/.test(b.textContent)).id='__meOk',1`);await tap('#__meOk');await sleep(800)}
 await ev(`(()=>{if(dlg)closeDialog();$('startPanel')&&($('startPanel').hidden=true);return 1})()`);await sleep(300);
 return t;
}
