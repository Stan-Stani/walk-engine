// The engine's own tests: node tests/run.mjs [spec …]   (from walk-engine; specs are tests/specs/<name>.mjs, default all)
// Each test game (TEST_GAMES: Korean with phone and notes, Japanese with furigana, one without line English) is copied to a temp
// folder and built there with THIS engine.js, the working copy, before any sync; then every spec runs on each in headless
// Chrome with real taps. A spec that doesn't apply to a game (no line English, no phone…) says so and skips that part.
// Python: $WALK_PYTHON (ことばのむら needs fugashi), else python3.
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {open} from './lib.mjs';
const eng=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),top=path.dirname(eng);
const games=JSON.parse(fs.readFileSync(path.join(eng,'games.json'),'utf8')).games;
const TEST_GAMES=process.env.WALK_TEST_GAMES?.split(',')||['sora-vocab','kotoba-mura','daneo-maul'];  // WALK_TEST_GAMES=sora-vocab: just that one
const want=process.argv.slice(2);
const specs=fs.readdirSync(path.join(eng,'tests/specs')).filter(f=>f.endsWith('.mjs')).map(f=>f.slice(0,-4)).filter(s=>!want.length||want.includes(s));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'walk-tests-'));process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));
fs.symlinkSync(eng,path.join(tmp,'walk-engine'));  // a game's build reads ../walk-engine/tools/lines_en.py
let failed=0;
for(const g of TEST_GAMES){
 const src=path.join(top,g);if(!fs.existsSync(src)){console.log(`-- ${g}: no clone next to walk-engine, skipped`);continue}
 const dir=path.join(tmp,g);fs.cpSync(src,dir,{recursive:true,filter:p=>!/\/(\.git|shots|node_modules)(\/|$)/.test(p.slice(src.length))});
 fs.writeFileSync(path.join(dir,'src/engine.js'),'/* walk-engine working copy, for the engine tests */\n'+fs.readFileSync(path.join(eng,'engine.js'),'utf8'));
 execFileSync(process.env.WALK_PYTHON||'python3',['build.py','--out',path.join(dir,'test.html')],{cwd:dir,stdio:['ignore','ignore','inherit']});
 for(const s of specs){
  const t=await open(path.join(dir,'test.html'),path.join(eng,'tests/out',g,s),games.find(x=>x.dir===g)?.smoke);
  console.log(`-- ${g} · ${s}`);
  try{await (await import(`./specs/${s}.mjs`)).default(t)}catch(e){t.ok(false,'threw: '+(e.message||e).split('\n')[0])}
  t.ok(!t.errors.length,'no page errors'+(t.errors.length?' '+JSON.stringify(t.errors):''));
  failed+=t.fails;await t.close();
 }
}
console.log(failed?`\n${failed} FAILED`:'\nALL OK');process.exit(failed?1:0);
