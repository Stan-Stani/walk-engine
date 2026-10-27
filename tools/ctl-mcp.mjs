// ctl.mjs as an MCP server, so Claude Code can play a game with tool calls and see each screenshot (no shell, no file reads).
// Each tool runs one ctl command in the game's root and returns the text a player can see plus the screenshot as an image.
// Register it in a game repo's .mcp.json (Claude Code starts it in the repo root; WALK_GAME=<dir> overrides):
//   {"mcpServers":{"walk-ctl":{"command":"node","args":["../walk-engine/tools/ctl-mcp.mjs"]}}}
// CTL_SESSION in its env gives that Claude its own Chrome, as with ctl.mjs. Plain MCP over stdio (JSON-RPC, one message a line).
import {execFile} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';
const CTL=path.join(path.dirname(new URL(import.meta.url).pathname),'ctl.mjs'),ROOT=path.resolve(process.env.WALK_GAME||process.cwd());
const str=d=>({type:'string',description:d}),int=d=>({type:'integer',description:d});
const TOOLS=[
 ['start','Open the game fresh (no saves) at phone size, at a chapter.',{chapter:str('chapter id, e.g. ch1 (default: the first)')},a=>['start',...(a.chapter?[a.chapter]:[])]],
 ['resume','Reopen the game where its save is, keeping saves.',{chapter:str('chapter id')},a=>['resume',...(a.chapter?[a.chapter]:[])]],
 ['key','Press a key n times: ArrowUp/Down/Left/Right, z (A), x (B), m (START), Enter, 1–4.',{key:str('the key'),n:int('times (default 1)')},a=>['key',a.key,...(a.n?[String(a.n)]:[])],['key']],
 ['walk','Take n steps in a direction.',{dir:{type:'string',enum:['up','down','left','right']},n:int('steps')},a=>['walk',a.dir,String(a.n||1)],['dir']],
 ['tap','Tap the screen at a point (CSS px of the 400×820 screenshot).',{x:int('x'),y:int('y')},a=>['tap',String(a.x),String(a.y)],['x','y']],
 ['tapword','Tap the first visible word with this text, as a finger would.',{word:str('the word as shown')},a=>['tapword',a.word],['word']],
 ['shot','Just look at the screen.',{},()=>['shot']],
 ['look','Look closer at the game screen, unsmoothed: around you (no args), "all", or a part in squares (col,row,w,h).',{area:str('"all", or "col row [w] [h]"; empty: around you')},a=>['look',...(a.area?a.area.split(/\s+/):[])]],
 ['stop','Close the game.',{},()=>['stop']],
];
const run=args=>new Promise(res=>execFile('node',[CTL,...args],{cwd:ROOT,env:process.env,timeout:120000,maxBuffer:1<<20},(e,out,err)=>{
 const text=String(out||'')+(e&&err?'\n'+err:''),lines=text.trim().split('\n'),png=lines[0]&&/\.png$/.test(lines[0])&&fs.existsSync(lines[0])?lines.shift():null;
 const content=[{type:'text',text:lines.join('\n')||'(nothing)'}];
 if(png)content.push({type:'image',data:fs.readFileSync(png).toString('base64'),mimeType:'image/png'});
 res({content,isError:!!e})}));
let queue=Promise.resolve();
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const fail=(id,code,message)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');
readline.createInterface({input:process.stdin}).on('line',async line=>{
 let m;try{m=JSON.parse(line)}catch(e){return}
 if(m.id===undefined)return;  // notifications (initialized, cancelled): nothing to answer
 if(m.method==='initialize')return reply(m.id,{protocolVersion:m.params?.protocolVersion||'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'walk-ctl',version:'1.0.0'},
  instructions:`Play the walk game in ${ROOT} like a player: start, then walk/key/tap/tapword, and look at each screenshot.`});
 if(m.method==='ping')return reply(m.id,{});
 if(m.method==='tools/list')return reply(m.id,{tools:TOOLS.map(([name,description,properties,,required])=>({name,description,inputSchema:{type:'object',properties,...(required?{required}:{})}}))});
 if(m.method==='tools/call'){const t=TOOLS.find(x=>x[0]===m.params?.name);if(!t)return fail(m.id,-32602,'unknown tool '+m.params?.name);
  queue=queue.then(()=>run(t[3](m.params.arguments||{}))).then(r=>reply(m.id,r));return}  // one action at a time, in order, like a player
 fail(m.id,-32601,'unknown method '+m.method);
});
