// 저장 옮기기, with files: 내보내기 downloads walk-saves-….json with every walk key of the site (not walk-count); 가져오기 picks a
// file, says what's in it, and on a second tap writes it and reloads, and the GAME then has that progress (not only the storage).
import fs from 'node:fs';import path from 'node:path';
export default async function(t){
 await t.cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:t.out});
 await t.ev(`localStorage.setItem('walk-count','0'),localStorage.setItem('zz-other-game','kept'),1`);
 // progress: three badges, two steps along
 await t.ev(`state.badges.push(...C.WORDS.slice(0,3));player.x+=2;state.x=player.x;save(),1`);
 const want=await t.ev(`({badges:state.badges.slice(),x:player.x})`);
 await t.ev(`openSaves(),1`);await t.sleep(300);await t.tap('#saveOut');
 let file=null;for(let i=0;i<30&&!file;i++){await t.sleep(200);file=fs.readdirSync(t.out).find(f=>/^walk-saves-\d{8}-\d{6}\.json$/.test(f))}
 t.ok(!!file,'내보내기: a walk-saves-….json download ('+file+')');if(!file)return;
 const o=JSON.parse(fs.readFileSync(path.join(t.out,file),'utf8'));
 t.ok(o.walkSaves===1&&!!o.data[await t.ev('CH.save')]&&o.data['zz-other-game']==='kept'&&!('walk-count' in o.data),'every walk key of the site in it, not walk-count');
 // the progress goes away here, then comes back from the file
 await t.ev(`state.badges.length=0;player.x-=2;state.x=player.x;save(),localStorage.setItem('zz-only-here','x'),1`);
 const pick=async f=>{const d=await t.cdp('DOM.getDocument',{});const n=await t.cdp('DOM.querySelector',{nodeId:d.root.nodeId,selector:'#saveFile'});
  await t.cdp('DOM.setFileInputFiles',{nodeId:n.nodeId,files:[f]});await t.sleep(500)};
 const bad=path.join(t.out,'not-a-save.json');fs.writeFileSync(bad,'{"hello":1}');await pick(bad);
 t.ok(/저장 파일이 아니에요|セーブの ファイル/.test(await t.ev(`$('saveMsg').textContent`))&&!(await t.ev(`$('saveIn').classList.contains('armed')`)),'a file that isn\'t a save: said so, nothing armed');
 await pick(path.join(t.out,file));
 t.ok(await t.ev(`$('saveIn').classList.contains('armed')`)&&(await t.ev(`$('saveMsg').textContent`)).includes(file),'the save file: what\'s in it, and 가져오기 armed');
 t.ok((await t.ev('state.badges.length'))===0,'nothing written before the second tap');await t.shot('armed');
 await t.tap('#saveIn');await t.sleep(3500);  // writes, reloads
 const got=await t.ev(`({badges:state.badges.slice(),x:player.x})`);
 t.ok(JSON.stringify(got)===JSON.stringify(want),`after the reload the game has the progress: ${JSON.stringify(got)}`);
 t.ok(await t.ev(`localStorage.getItem('zz-only-here')`)==='x','keys the file doesn\'t have are left alone');
}
