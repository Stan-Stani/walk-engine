// 문법: the patterns that the lines you opened English for share (LINE_GRAMMAR), as chips over 사전 · 문장 and in 보내기.
export default async function(t){
 if(!await t.ev('!!(globalThis.LINE_GRAMMAR&&LINE_GRAMMAR.n)')){t.ok(true,'(no grammar lines in this game: nothing to show)');t.ok(!(await t.ev('gramGaps()')).length,'and no patterns');return}
 const pick=await t.ev(`(()=>{const L=LINE_GRAMMAR,by={};for(const [l,v] of Object.entries(L.lines))if(!l.includes('___')&&LINES_EN[l])for(const i of v)(by[i]=by[i]||[]).push(l);
  const i=Object.keys(by).map(Number).filter(i=>by[i].length>=3&&L.cnt[i]/L.n<0.02).sort((a,b)=>by[b].length-by[a].length)[0];
  return {p:L.pats[i],lines:by[i].slice(0,3),other:Object.keys(LINES_EN).find(l=>!l.includes('___')&&!(L.lines[l]||[]).includes(i))}})()`);
 await t.ev(`for(const l of ${JSON.stringify([...pick.lines,pick.other])})noteLineQ(l,LINES_EN[l],'하리');1`);
 const gaps=await t.ev('gramGaps()');
 t.ok(gaps.some(g=>g.p===pick.p&&g.k===3),`gramGaps finds ${pick.p} in 3 of 4 lines`);
 await t.ev(`openTaps(),1`);await t.sleep(300);await t.tap('#tapLines');
 t.ok(await t.ev(`!!document.querySelector('.tpgp')`),'문장 shows the patterns');
 const chip=`(()=>{const b=[...document.querySelectorAll('.tpgp')].find(b=>b.dataset.p===${JSON.stringify(pick.p)});b.id='__pat';return 1})()`;
 await t.ev(chip);await t.tap('#__pat');
 t.ok(await t.ev(`$('tapList').querySelectorAll('.tp').length`)===3,'a pattern tapped: only its 3 lines');await t.shot('pattern');
 await t.ev(chip);await t.tap('#__pat');t.ok(await t.ev(`$('tapList').querySelectorAll('.tp').length`)===4,'tapped again: all 4');
 t.ok((await t.ev('sendText()')).includes(pick.p+' 3'),'보내기 names it for the tutor');
 await t.ev('closeTaps(),1');
}
