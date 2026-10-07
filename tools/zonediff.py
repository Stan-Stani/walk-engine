#!/usr/bin/env python3
"""Compare two zonedump.mjs dumps tile by tile: python3 ../walk-engine/tools/zonediff.py <before> <after> [<out-dir>]
Lists every 16x16 tile whose pixels changed (grouped by chapter and zone, with the dump variants it changed in), zones that
appeared, vanished or changed size. With <out-dir>: one image per changed zone variant, before | after at 3x, changed tiles boxed.
Exits 1 when anything differs, so it can gate a refactor that is meant to change nothing on screen."""
import sys,pathlib
from PIL import Image,ImageChops,ImageDraw
if len(sys.argv)<3:print(__doc__);sys.exit(2)
A,B=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]);OUT=pathlib.Path(sys.argv[3]) if len(sys.argv)>3 else None
if OUT:OUT.mkdir(parents=True,exist_ok=True)
TS=16;fa={p.relative_to(A) for p in A.rglob('*.png')};fb={p.relative_to(B) for p in B.rglob('*.png')}
changed={}  # (ch, zone) → {tile: set(variants)}
problems=[]
for p in sorted(fa-fb):problems.append(f'gone: {p}')
for p in sorted(fb-fa):problems.append(f'new:  {p}')
for p in sorted(fa&fb):
    a=Image.open(A/p).convert('RGB');b=Image.open(B/p).convert('RGB')  # RGB: on RGBA, getbbox() looks at alpha only and misses every change
    ch=p.parts[0];zone,var=p.stem.split('.',1)
    if a.size!=b.size:problems.append(f'size: {p} {a.size} → {b.size}');continue
    box=ImageChops.difference(a,b).getbbox()
    if not box:continue
    d=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v else 0)
    tiles=[]
    for ty in range(box[1]//TS,(box[3]-1)//TS+1):
        for tx in range(box[0]//TS,(box[2]-1)//TS+1):
            if d.crop((tx*TS,ty*TS,tx*TS+TS,ty*TS+TS)).getbbox():tiles.append((tx,ty))
    for t in tiles:changed.setdefault((ch,zone),{}).setdefault(t,set()).add(var)
    if OUT:
        k=3;W,H=a.size;im=Image.new('RGB',(W*2*k+12,H*k),(29,33,40))
        im.paste(a.resize((W*k,H*k),Image.NEAREST),(0,0));im.paste(b.resize((W*k,H*k),Image.NEAREST),(W*k+12,0))
        dr=ImageDraw.Draw(im)
        for tx,ty in tiles:
            for ox in (0,W*k+12):dr.rectangle((ox+tx*TS*k,ty*TS*k,ox+(tx+1)*TS*k-1,(ty+1)*TS*k-1),outline=(255,0,90),width=2)
        im.save(OUT/f'{ch}-{zone}.{var}.png')
for s in problems:print(s)
for (ch,zone),tiles in sorted(changed.items()):
    print(f'{ch} {zone}: {len(tiles)} tile(s) changed')
    for (tx,ty),vs in sorted(tiles.items(),key=lambda kv:(kv[0][1],kv[0][0])):print(f'   {tx},{ty}  in {",".join(sorted(vs))}')
n=sum(len(t) for t in changed.values())
print(f'{len(fa&fb)} images compared · {n} changed tile(s) in {len(changed)} zone(s) · {len(problems)} other difference(s)')
sys.exit(1 if n or problems else 0)
