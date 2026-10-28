// 본 말: words read (lines left up long enough) are counted by dictionary form; a lookup makes a word 'learning' until it is read
// 3 more times; 찾아본 말 복습 stops asking a word that's become known; the chapter list estimates how much of a chapter is known.
export default async function(t){
 const [a,b]=await t.ev(`[...Object.keys(window.LINES_EN||{}),...(C.INTRO||[]).map(s=>s.say)].filter(x=>typeof x==='string'&&!/[{}_<>]/.test(x)&&x.length>10&&x.length<40).slice(0,2)`);
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(a)},who:'하리'},{say:${JSON.stringify(b)},who:'하리'}]),1`);await t.sleep(2500);
 const r=await t.ev('reading&&{ws:reading.ws,need:reading.need}');t.ok(!!r&&r.ws.length>0,`a line on screen: ${r&&r.ws.length} words to count`);
 await t.sleep(Math.min(r.need+200,6000));await t.ev('reading&&(reading.at-=1e5),advance(),1');await t.sleep(400);
 t.ok(r.ws.every(w=>true)&&(await t.ev(`${JSON.stringify(r.ws)}.every(w=>seen[w]&&seen[w][0]>=1)`)),'read long enough: its words are counted');
 const bw=await t.ev(`(reading&&reading.ws||[]).filter(w=>!${JSON.stringify(r.ws)}.includes(w))`);
 await t.ev('closeDialog(),1');t.ok(await t.ev(`${JSON.stringify(bw)}.every(w=>!seen[w])`),'closed right away: the next line\'s words are not');
 // a lookup: learning until read 3 more times
 const w=r.ws[0];
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(a)},who:'하리'}]),1`);await t.sleep(2500);
 await t.ev(`[...$('txt').querySelectorAll('.w,.gl')].find(x=>(x.dataset.k||(lexLookup(x.dataset.w||x.textContent)[0]||[])[0])===${JSON.stringify(w)}).id='__w',1`);
 await t.tap('#__w');await t.ev('hideGloss(),1');t.ok(await t.ev(`wordState(${JSON.stringify(w)})`)==='learning','looked up: learning');
 await t.ev(`taps[${JSON.stringify(w)}].n=2;taps[${JSON.stringify(w)}].k=taps[${JSON.stringify(w)}].k||'뜻';1`);
 const untaught=await t.ev(`!taught(${JSON.stringify(w)})&&!known(${JSON.stringify(w)})`);
 if(untaught)t.ok((await t.ev('lookDue()')).includes(w),'looked up twice, not taught: due at the review computer');
 for(let i=0;i<3;i++){await t.ev('reading&&(reading.at-=1e5),closeDialog(),1');await t.ev(`openDialog('하리',[{say:${JSON.stringify(a)},who:'하리'}]),1`);await t.sleep(2200)}
 await t.ev('reading&&(reading.at-=1e5),closeDialog(),1');
 const st=await t.ev(`seen[${JSON.stringify(w)}]`);
 t.ok(await t.ev(`wordState(${JSON.stringify(w)})`)==='known',`read 4 times since: known (${JSON.stringify(st)})`);
 if(untaught)t.ok(!(await t.ev('lookDue()')).includes(w),'known: the review computer stops asking it');
 // the chapter estimate (games with LINE_GRAMMAR), once there's enough reading
 if(await t.ev('!!(globalThis.LINE_GRAMMAR&&LINE_GRAMMAR.chw&&LINE_GRAMMAR.chw[CH.id])')){
  t.ok(await t.ev('chapterKnown(CH.id)')===null||await t.ev('Object.keys(seen).length')>=50,'little reading: no estimate');
  await t.ev(`Object.keys(LINE_GRAMMAR.chw[CH.id]).slice(0,80).forEach(w=>{seen[w]=[6,0,6]}),1`);
  const k=await t.ev('chapterKnown(CH.id)');t.ok(k>0&&k<=100,`chapter estimate: about ${k}% known`);
  await t.ev(`openChapters(),1`);t.ok(await t.ev(`$('chList').textContent.includes(T('아는 말')+' '+chapterKnown(CH.id)+'%')`),'the chapter list shows it');
 }
 t.ok(await t.ev(`JSON.parse(localStorage.getItem('walk-seen-'+lang2())||'{}')&&new Promise(r=>setTimeout(()=>r(!!JSON.parse(localStorage.getItem('walk-seen-'+lang2())||'{}')[${JSON.stringify(w)}]),1800))`),'saved for every game in this language (walk-seen-'+await t.ev('lang2()')+')');
}
