// 보내기 (the 사전 to an AI tutor, through the share sheet) and 물어보기 (one line, explained). navigator.share is stubbed to keep
// what was shared; without one the text is copied.
export default async function(t){
 await t.ev(`window.__shared=[];navigator.share=d=>{__shared.push(d.text);return Promise.resolve()};1`);
 const shared=()=>t.ev('__shared');
 // something to send: a word looked up in a real line, and (with line English) that line's English opened
 const say=await t.ev(`[...Object.keys(window.LINES_EN||{}),...(C.INTRO||[]).map(s=>s.say)].find(x=>typeof x==='string'&&!/[{}_<>]/.test(x)&&x.length>8&&x.length<40)`);
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(say)},who:'하리'}]),1`);await t.sleep(2500);
 await t.tap('#txt .w');await t.ev('hideGloss(),1');
 const h=await t.ev(`Object.keys(taps)[0]`);
 if(await t.ev(`!!window.LINES_EN&&!!$('enBtn')&&!$('enBtn').hidden`)){
  t.ok(await t.ev(`$('askBtn').hidden`),'물어보기 hidden until the English is open');
  await t.tap('#enBtn');t.ok(!await t.ev(`$('askBtn').hidden`),'English open: 물어보기 shows');await t.shot('ask');
  await t.tap('#askBtn');const a=(await shared()).pop()||'';
  t.ok(a.includes('Please explain this line')&&a.includes(say.replace(/\s+/g,' '))&&a.includes('English: ')&&a.includes('하리'),'물어보기 shares the line, its English and who says it');
  await t.tap('#enBtn');t.ok(await t.ev(`$('askBtn').hidden`),'English closed: 물어보기 hidden again');
 }
 await t.ev(`closeDialog(),openTaps(),1`);await t.sleep(400);await t.shot('taps');
 await t.tap('#tapSend');let s=(await shared()).pop()||'';
 t.ok(/I'm learning (Korean|Japanese)/.test(s)&&s.includes('quiz me'),'보내기: the tutor brief first');
 t.ok(s.includes(`- ${h}`),'보내기: the word looked up');
 t.ok(+await t.ev(`store.get(KEY('sentAt'))||0`)>0,'sent: the time is kept');
 await t.tap('#tapSend');s=(await shared()).pop()||'';
 t.ok(s.includes(`- ${h}`)&&!/ since /.test(s.split('\n\n')[1]||''),'nothing new since: everything is sent again');
 await t.ev(`delete navigator.share,closeTaps(),1`);
}
