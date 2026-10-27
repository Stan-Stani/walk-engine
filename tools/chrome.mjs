// Which Chrome to start, on any machine: chrome(dir, args) → [command, argv] for spawn(...chrome(dir, args), opts).
// $CHROME if set; else the flatpak Chrome (bluefin; --nodevice=all keeps it off the GPU, and --filesystem=dir lets it read the page);
// else Google Chrome on macOS; else google-chrome / chromium on the PATH.
import {execFileSync} from 'node:child_process';import fs from 'node:fs';
let found;
function pick(){
 if(found)return found;
 if(process.env.CHROME)return found={bin:process.env.CHROME};
 try{execFileSync('flatpak',['info','com.google.Chrome'],{stdio:'ignore'});return found={flatpak:true}}catch(e){}
 const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';if(fs.existsSync(mac))return found={bin:mac};
 for(const b of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])try{execFileSync('which',[b],{stdio:'ignore'});return found={bin:b}}catch(e){}
 throw new Error('no Chrome found: set CHROME to its path');
}
export function chrome(dir,args){const c=pick();return c.flatpak?['flatpak',['run','--nodevice=all',`--filesystem=${dir}`,'com.google.Chrome',...args]]:[c.bin,args]}
