// 사전 · 문장: every ? that opens a line's English is recorded (KEY('lineQ')) and exported by 복사.
export default async function(t){
 const rec=()=>t.ev(`JSON.parse(localStorage.getItem(KEY('lineQ'))||'{}')`);
 if(!await t.ev(`!!window.LINES_EN`)){  // no line English (단어 마을): no 문장 button until a note's ? records something
  await t.ev(`openTaps(),1`);await t.sleep(300);t.ok(!await t.ev(`!!$('tapLines')`),'no lines-en: no 문장 button yet');await t.ev(`closeTaps(),1`);
  const note=await t.ev(`(()=>{const k=Object.keys(globalThis.CULTURE_NOTES||{})[0];if(!k||!$('noteCard'))return null;showNote('culture',k);$('noteCard').querySelector('.enb').click();return '문화 노트 · '+CULTURE_NOTES[k].t})()`);
  if(note){await t.ev(`openTaps(),1`);await t.sleep(300);t.ok(await t.ev(`!!$('tapLines')`),'after a note ? the 문장 button shows');t.ok(/영어로 본 문장 1개/.test(await t.ev(`tapsText()`)),'and 복사 has it')}
  return}
 // lines with kanji first (furigana must stay out of the record)
 const [K1,K2,K3]=await t.ev(`Object.keys(LINES_EN).filter(k=>!/[A-Za-z:{}<>_]/.test(k)&&k.length>8&&k.length<40).sort((a,b)=>/[一-龯]/.test(b)-/[一-龯]/.test(a)).slice(0,3)`);
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(K1)},who:'하리'}]),1`);await t.sleep(2500);
 await t.shot('dialogue');await t.tap('#enBtn');let r=await rec();
 t.ok(r[K1]?.n===1,'dialogue ? opened → n=1');t.ok(r[K1]?.e===await t.ev(`LINES_EN[${JSON.stringify(K1)}]`),'its English');
 t.ok(r[K1]?.w==='하리','who');t.ok(/\S/.test(r[K1]?.ch||''),'chapter');
 await t.tap('#enBtn');r=await rec();t.ok(r[K1].n===1,'closing adds nothing');
 await t.tap('#enBtn');r=await rec();t.ok(r[K1].n===2,'opening again → n=2');
 await t.ev(`closeDialog(),1`);await t.sleep(300);
 await t.ev(`openTalk(),1`);await t.sleep(400);
 await t.ev(`(()=>{const row=[...document.querySelectorAll('#talkList .tl')].reverse().find(r=>shownText(r.querySelector('.tt')).replace(/\\s+/g,' ').includes(${JSON.stringify(K1)}));row.querySelector('.tq').id='__tq';return 1})()`);
 await t.tap('#__tq');r=await rec();t.ok(r[K1].n===3,'talk log ? on the same line → n=3');
 await t.ev(`closeTalk(),1`);await t.sleep(300);
 if(await t.ev(`!!$('phonePanel')`)){
  await t.ev(`openPhone({app:'앱',post:${JSON.stringify(K2)},by:'구름',when:'방금',count:1,comments:[['찬',${JSON.stringify(K3)}]]}),1`);await t.sleep(400);
  await t.tap('#pscr .pc .tq');r=await rec();t.ok(r[K3]?.n===1&&r[K3]?.w==='찬','phone comment ? → who=찬');
  await t.tap('#pscr .ppost .tq');r=await rec();t.ok(r[K2]?.w==='구름','phone post ? → who=구름');
  await t.ev(`closePhone(),1`);await t.sleep(300)}
 await t.ev(`openTaps(),1`);await t.sleep(400);
 await t.tap('#tapLines');t.ok(await t.ev(`$('tapList').querySelectorAll('.tp').length`)===Object.keys(await rec()).length,'문장 lists every recorded line');
 await t.shot('lines');
 const txt=await t.ev(`tapsText()`);
 t.ok(txt.includes(K1+' | 3 | ')&&/\| \d{4}-\d\d-\d\d \d\d:\d\d \|/.test(txt),'복사: the line, its count, date and time');
 await t.tap('#tapLines');t.ok(await t.ev(`!$('tapLines').classList.contains('on')`),'문장 again: back to the words');
 await t.ev(`closeTaps(),1`);
}
