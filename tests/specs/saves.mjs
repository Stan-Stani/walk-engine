// 저장 옮기기: 내보내기 puts every walk key of this site in the box (not walk-count); 가져오기 (twice: the first tap only arms it)
// writes pasted text back, leaves other keys alone and reloads into the imported progress.
export default async function(t){
 await t.ev(`localStorage.setItem('walk-count','0'),localStorage.setItem('zz-other-game','kept'),save(),1`);
 const key=await t.ev('CH.save'),before=await t.ev(`localStorage.getItem(CH.save)`);
 await t.ev(`openSaves(),1`);await t.sleep(300);await t.tap('#saveOut');
 const txt=await t.ev(`$('saveText').value`),o=JSON.parse(txt);
 t.ok(o.walkSaves===1&&o.data[key]===before,'내보내기: the chapter save is in it');
 t.ok(!('walk-count' in o.data),'walk-count stays out');
 t.ok(o.data['zz-other-game']==='kept','other games on the site are in it too');
 // change the browser, then bring the text back
 await t.ev(`localStorage.setItem(${JSON.stringify(key)},'{"changed":1}'),localStorage.setItem('zz-only-here','x'),1`);
 await t.ev(`$('saveText').value='not a save',1`);await t.tap('#saveIn');
 t.ok(await t.ev(`localStorage.getItem(${JSON.stringify(key)})`)==='{"changed":1}','text that isn\'t a save: nothing written');
 await t.ev(`$('saveText').value=${JSON.stringify(txt)},1`);await t.tap('#saveIn');
 t.ok(await t.ev(`localStorage.getItem(${JSON.stringify(key)})`)==='{"changed":1}','first 가져오기 tap only arms it');
 await t.shot('armed');
 await t.tap('#saveIn');await t.sleep(3000);  // reloads
 t.ok(await t.ev(`localStorage.getItem(${JSON.stringify(key)})`)===before,'second tap: the save is back, after the reload');
 t.ok(await t.ev(`localStorage.getItem('zz-only-here')`)==='x','keys the text doesn\'t have are left alone');
 t.ok(await t.ev(`typeof state==='object'&&!!state`),'the game runs again');
}
