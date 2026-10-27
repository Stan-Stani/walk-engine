// What the 사전 taps do to review: looking up a word you have makes it due (its level stays); a word no chapter teaches, looked up
// twice, comes back at the review computer (찾아본 말 복습) quoted in its line, graded in its own record (KEY('looks')), never in badges.
export default async function(t){
 // 1. a word you have, not due: a tap makes it due now, at the same level
 const w=await t.ev(`(()=>{const w=C.WORDS.find(w=>C.DICT[w]);if(!w)return null;if(!state.badges.includes(w))state.badges.push(w);state.lv[w]={b:2,due:now()+1e7};save();return w})()`);
 if(w){
  await t.ev(`openDialog('하리',[{say:${JSON.stringify('{'+'X'+'|'+'X'+'}')}.replace(/X/g,${JSON.stringify(w)}),who:'하리'}]),1`);await t.sleep(1800);
  await t.tap('#txt .gl');const L=await t.ev(`lv(${JSON.stringify(w)})`);
  t.ok(L.due<=await t.ev('now()')&&L.b===2,`tapping a word you have (${w}) makes it due, level kept`);
  await t.ev(`hideGloss(),closeDialog(),1`);await t.sleep(300);
 }else t.ok(true,'(no DICT word in this chapter: skipped the badge-word part)');
 // 2. an untaught word, tapped twice in a real line
 const lines=JSON.stringify(await t.ev(`[...Object.keys(window.LINES_EN||{}),...(C.INTRO||[]).map(s=>s.say)].filter(x=>typeof x==='string'&&!/[{}_<>]/.test(x)&&x.length>6).slice(0,60)`));
 const found=await t.ev(`(async()=>{for(const say of ${lines}){openDialog('하리',[{say,who:'하리'}]);await new Promise(r=>setTimeout(r,1400));typing&&typing.fin&&typing.fin();
  for(const el of document.querySelectorAll('#txt .w')){const rows=lexLookup(el.dataset.w||el.textContent),h=rows[0]&&rows[0][0];
   if(h&&rows[0][1].k&&!taught(h)&&!known(h)&&!taps[h]){el.id='__lk';return {h,say}}}closeDialog()}return null})()`);
 if(!found){t.ok(false,'no untaught word in the first lines');return}
 const h=found.h;
 await t.tap('#__lk');await t.ev(`hideGloss(),1`);await t.tap('#__lk');await t.ev(`hideGloss(),closeDialog(),1`);await t.sleep(300);
 const r=await t.ev(`taps[${JSON.stringify(h)}]`);
 t.ok(r.n===2,`looked up twice: ${h}`);t.ok(!!r.s&&found.say.replace(/\s+/g,' ').includes(r.s.slice(0,6)),'the line it was met in is kept');
 t.ok((await t.ev('lookDue()')).includes(h),'it is due at the review computer');
 t.ok((await t.ev('terminal()')).some(s=>s.lookup===h),'terminal() asks it');
 const before=await t.ev(`JSON.stringify([state.badges,state.lv])`);
 // 3. answered right, through the real buttons
 const answer=async right=>{await t.ev(`openDialog(TERM.name,[lookQ(${JSON.stringify(h)})],{review:true}),1`);await t.sleep(2600);await t.ev('typing&&typing.fin&&typing.fin(),1');await t.sleep(300);
  await t.ev(`(()=>{const k=taps[${JSON.stringify(h)}].k.replace(/\s*[.。]$/,'');const b=[...$('choices').querySelectorAll('button')].find(b=>(b.textContent.trim()===k)===${right});b.id='__pick';return 1})()`);
  await t.shot(right?'ask':'ask-wrong');await t.tap('#__pick')};
 await answer(true);
 const L1=await t.ev(`looks[${JSON.stringify(h)}]`);
 t.ok(L1&&L1.b===1&&L1.due-await t.ev('now()')>3*3600e3,'right → level 1, due in about 4 hours');
 t.ok(before===await t.ev(`JSON.stringify([state.badges,state.lv])`),'badges and review levels untouched');
 t.ok(!(await t.ev('lookDue()')).includes(h),'not due again right away');
 await t.ev(`closeDialog(),1`);await t.sleep(300);
 // 4. a wrong answer resets it
 await t.ev(`looks[${JSON.stringify(h)}].due=0,1`);await answer(false);await t.sleep(400);
 await t.ev('advance(),1');await t.sleep(1500);await t.ev('typing&&typing.fin&&typing.fin(),1');await t.sleep(300);  // past the hint, the question again
 await t.ev(`(()=>{const k=taps[${JSON.stringify(h)}].k.replace(/\s*[.。]$/,'');[...$('choices').querySelectorAll('button')].find(b=>b.textContent.trim()===k).id='__right';return 1})()`);await t.tap('#__right');
 t.ok((await t.ev(`looks[${JSON.stringify(h)}]`)).b===0,'wrong first → back to level 0');
 await t.ev(`closeDialog(),1`);
}
