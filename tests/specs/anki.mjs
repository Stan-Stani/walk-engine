// Anki (the app with AnkiDroid): the 사전's Anki button sends every word and line not sent before; the app answers __ankiDone.
// WalkAnki is stubbed here; the app side is tested on a phone or emulator with AnkiDroid.
export default async function(t){
 await t.ev(`window.__anki=[];window.WalkAnki={available:()=>true,add:p=>{__anki.push(JSON.parse(p));setTimeout(()=>__ankiDone(JSON.parse(p).notes.length,''),50)}};1`);
 const say=await t.ev(`[...Object.keys(window.LINES_EN||{}),...(C.INTRO||[]).map(s=>s.say)].find(x=>typeof x==='string'&&!/[{}_<>]/.test(x)&&x.length>8&&x.length<40)`);
 await t.ev(`openDialog('하리',[{say:${JSON.stringify(say)},who:'하리'}]),1`);await t.sleep(2500);
 await t.tap('#txt .w');await t.ev('hideGloss(),1');const h=await t.ev('Object.keys(taps)[0]');
 if(await t.ev(`!!window.LINES_EN&&!!$('enBtn')&&!$('enBtn').hidden`))await t.tap('#enBtn');
 await t.ev('closeDialog(),openTaps(),1');await t.sleep(400);
 t.ok(await t.ev(`!!$('tapAnki')&&!$('tapAnki').hidden`),'with AnkiDroid: an Anki button');await t.shot('anki');
 await t.tap('#tapAnki');await t.sleep(300);const p=(await t.ev('__anki'))[0];
 const w=p.notes.find(n=>n.word.startsWith(h));
 t.ok(!!w&&w.front.includes('<b>')&&w.meaning.length>0,`the word ${h}: its line, the word in bold, its meaning`);
 t.ok(p.deck&&p.lang,'deck and language: '+p.deck+' / '+p.lang);
 if(await t.ev('!!window.LINES_EN'))t.ok(p.notes.some(n=>!n.word&&n.english),'the line whose English was opened');
 t.ok(Object.keys(await t.ev(`JSON.parse(localStorage.getItem(KEY('ankiSent'))||'{}')`)).length===p.notes.length,'what went in is remembered');
 await t.tap('#tapAnki');await t.sleep(300);t.ok((await t.ev('__anki')).length===1,'again: nothing new, nothing sent');
 await t.ev('delete window.WalkAnki,closeTaps(),1');
}
