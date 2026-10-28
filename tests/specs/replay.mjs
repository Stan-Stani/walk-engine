// 다시 보기: a finished chapter played again in its own save. The real save (badges, done, levels) stays as it was, a level only ever
// goes up, the shared record isn't touched, a reload goes on with the replay, and leaving it is the real save again. 듣기 hides each
// line until a tap.
export default async function(t){
 const real=()=>t.ev(`JSON.parse(localStorage.getItem(CH.save))`);
 // a finished chapter: three words, the first at level 4
 await t.ev(`state.badges=C.WORDS.slice(0,3);C.WORDS.slice(0,3).forEach(w=>state.lv[w]={b:4,due:Date.now()-1});state.f.done=1;save();1`);
 const w0=await t.ev('C.WORDS[0]'),line=await t.ev(`[...Object.keys(window.LINES_EN||{}),...(C.INTRO||[]).map(s=>s.say)].find(x=>typeof x==='string'&&!/[{}_<>]/.test(x)&&x.length>8&&x.length<40)`);
 await t.ev('openChapters(),1');await t.ev(`$('chList').querySelector('.chap.cur').click(),1`);
 t.ok(await t.ev(`[...$('chList').querySelectorAll('.rpo')].some(b=>b.dataset.m==='plain')&&[...$('chList').querySelectorAll('.rpo')].some(b=>b.dataset.m==='')`),'its menu: 그대로 보기, 다시 보기 · 보통 / 듣기 (with a voice)');
 await t.shot('menu');
 await t.ev(`$('chList').querySelector('.rpo[data-m="plain"]').click(),1`);await t.sleep(600);
 t.ok(await t.ev('!!RP&&state.badges.length===0'),'다시 보기: a fresh run');
 t.ok(await t.ev(`$('chName').textContent.includes(T('다시 보기'))`),'the header says so');
 t.ok((await real()).badges.length===3&&(await real()).f.done===1,'the real save is as it was');
 // levels only go up: learned again with a miss, missed in review
 await t.ev(`closeDialog&&closeDialog(),openDialog('하리',[{say:${JSON.stringify(line)},who:'하리'}]),dlg.missed.add(${JSON.stringify(w0)}),award([${JSON.stringify(w0)}]),1`);
 t.ok(await t.ev(`state.badges.includes(${JSON.stringify(w0)})&&lv(${JSON.stringify(w0)}).b===4`),'earned again with a miss: still level 4');
 await t.ev(`grade(${JSON.stringify(w0)},false),1`);
 t.ok(await t.ev(`lv(${JSON.stringify(w0)}).b===4`),'a missed review in a replay: still level 4');
 t.ok((await real()).badges.length===3,'the real 일지 still has its 3 words');
 // the shared record isn't written
 const sh0=await t.ev(`localStorage.getItem(KEY('shared'))`);await t.ev(`shared.__rp=1;saveShared();1`);
 t.ok(await t.ev(`localStorage.getItem(KEY('shared'))`)===sh0,'the shared record is left alone');
 t.ok(await t.ev(`JSON.parse(localStorage.getItem(KEY('replay'))).id===CH.id`),'kept over a reload');
 // 듣기 (with a voice): hidden until tapped
 await t.ev(`closeDialog(),koVoice={name:'test',lang:'ko-KR'},boot(CH.id,{mode:'listen'}),1`);await t.sleep(500);
 t.ok(await t.ev(`RP.mode==='listen'`),'듣기 with a Korean voice');
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(line)},who:'하리'},{say:${JSON.stringify(line)},who:'하리'}]),1`);await t.sleep(2500);
 t.ok(await t.ev(`$('txt').classList.contains('lhide')`),'듣기: the line is hidden');
 await t.shot('listen');
 await t.tap('#txt');await t.sleep(200);
 t.ok(await t.ev(`!$('txt').classList.contains('lhide')&&dlg&&dlg.i===0`),'a tap shows it (and doesn\'t go on)');
 // 장면 고르기: a checkpoint (tools/play.mjs --checkpoints) starts the replay at that moment
 await t.ev(`closeDialog(),boot(CH.id),1`);await t.sleep(400);
 await t.ev(`(()=>{const s=JSON.parse(JSON.stringify(state));s.f={...s.f,__scene:1};s.lv={};cpAll=Promise.resolve({[CH.id]:[{ch:CH.id,q:'시작',zone:ZID,state:{...s,f:{}},talk:[]},{ch:CH.id,q:'장면 하나',zone:ZID,state:s,talk:[]}]})})(),1`);
 await t.ev('openChapters(),1');await t.ev(`$('chList').querySelector('.chap.cur').click(),1`);await t.ev(`$('chList').querySelector('.rpo[data-m="scenes"]').click(),1`);await t.sleep(400);
 t.ok(await t.ev(`$('chList').querySelectorAll('.rpo[data-i]').length===3`),'장면 고르기 lists the chapter\'s moments');
 await t.ev(`$('chList').querySelector('.rpo[data-i="1"]').click(),1`);await t.sleep(600);
 t.ok(await t.ev(`!!RP&&state.f.__scene===1&&!JSON.parse(localStorage.getItem(CH.save)).f.__scene`),'a 장면 starts the replay there; the real save is as it was');
 t.ok(await t.ev(`lv(${JSON.stringify(w0)}).b===4`),'with the player\'s own levels');
 // back to the real save
 await t.ev(`closeDialog(),koVoice=null,boot(CH.id),1`);await t.sleep(500);
 t.ok(await t.ev(`!RP&&state.badges.length===3&&state.f.done===1&&localStorage.getItem(KEY('replay'))===''`),'그대로 보기: the real save again');
 t.ok(await t.ev(`lv(${JSON.stringify(w0)}).b===4`),'its level as it was');
}
