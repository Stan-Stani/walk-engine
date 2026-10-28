#!/usr/bin/env python3
"""Grammar patterns and words of every line, for the 사전's 문법 summary and the chapter word estimate. From a Korean game's root:
    python3 ../walk-engine/tools/grammar_tags.py .
Needs kiwipiepy (the analyzer lexicon/extract.py uses). Reads src/lines-en.json (every line that has English: the lines a ? can
open) and writes src/grammar-tags.json, which build.py puts in as globalThis.LINE_GRAMMAR:
  pats: pattern names ("-는데", "-다 보니", "-(으)ㄹ 수 있다"…);  lines: {line: [pattern indexes]} (lines with at least one);
  cnt: how many lines have each pattern, n: lines in all (the game's baseline: a pattern counts as a stumble when it is more common
  in the lines you opened English for than in the game);  chw: {chapter file: {dictionary form: times}} (content words only), the
  words each chapter uses, for the "about N% known" estimate. Run it after the lines or lines-en.json change; the build only reads.
A game without lines-en.json (단어 마을: English only per word) gets just chw, from every Korean string in its chapter files
(dialogue, quiz options, definitions: all read on screen); with no ? to open there's nothing for the 문법 summary.
Endings a TOPIK 3 learner has (-어요, -고, -었-, -(으)면…) are left out: they would top every list without saying anything."""
import json,re,sys,pathlib
from kiwipiepy import Kiwi
repo=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.')
en_p=repo/'src/lines-en.json'
en=json.loads(en_p.read_text(encoding='utf-8')) if en_p.exists() else None
plain=lambda t:re.sub(r'\{([^|}]+)\|[^}]+\}',r'\1',t)
norm=lambda t:re.sub(r'\s+',' ',plain(t)).strip()
kiwi=Kiwi()
JONG={'ᆫ':'ㄴ','ᆯ':'ㄹ','ᆷ':'ㅁ','ᆸ':'ㅂ'}
jamo=lambda s:''.join(JONG.get(c,c) for c in s)
BASIC={'어요','아요','여요','요','다','어','아','여','야','지','니','냐','자','ㅂ니다','습니다','ㅂ니까','습니까','고','어서','아서','여서','게','죠','지요',
       '었','았','였','시','으시','는','ㄴ','은','ㄹ','을','면','으면','지만','기','음','ㅁ','라','이라','에요','예요','이에요','네','네요'}
SAME={'은데':'는데','ㄴ데':'는데','으니까':'니까','으니':'니','으려고':'려고','으러':'러','을게요':'ㄹ게요','을까요':'ㄹ까요','을까':'ㄹ까','을게':'ㄹ게',
      '은지':'는지','ㄴ지':'는지','았는데':'는데','었는데':'는데','아도':'어도','여도':'어도','아야':'어야','여야':'어야','아서요':'어서요'}
def patterns(toks):
    out=[];i=0;n=len(toks)
    while i<n:
        t=toks[i];f=jamo(t.form);g=t.tag;nx=toks[i+1] if i+1<n else None;nn=toks[i+2] if i+2<n else None
        if g=='ETM' and nx and nx.form=='수' and nn and nn.form in ('있','없'): out.append('-(으)ㄹ 수 있다/없다');i+=3;continue
        if g=='ETM' and nx and nx.form=='것' and nn and nn.form=='같': out.append('-(으)ㄴ/는/ㄹ 것 같다');i+=3;continue
        if g=='ETM' and nx and nx.form=='때': out.append('-(으)ㄹ 때');i+=2;continue
        if g=='ETN' and nx and nx.form=='때문': out.append('-기 때문에');i+=2;continue
        if g=='ETM' and nx and nx.form=='적' and nn and nn.form in ('있','없'): out.append('-(으)ㄴ 적이 있다/없다');i+=3;continue
        if g=='EC' and f=='다' and nx and nx.form=='보': out.append('-다 보니(까)');i+=2;continue
        if g=='EC' and nx and nx.tag=='VX': out.append('-'+SAME.get(f,f)+' '+jamo(nx.form)+'다');i+=2;continue  # -어 보다, -고 있다, -다 보다…
        if g=='EC' and f in ('어야','아야','여야') and nx and nx.form=='하': out.append('-어야 하다');i+=2;continue
        if g in ('EC','EF','EP') :
            f=SAME.get(f,f)
            if f.endswith('요') and len(f)>1 and f[:-1] in BASIC: f=f[:-1]
            if f not in BASIC: out.append('-'+f+('-' if g=='EP' else ''))
        i+=1
    return list(dict.fromkeys(out))
CONTENT={'NNG','NNP','VV','VA','MAG','XR'}
def words(toks):
    out=[]
    for i,t in enumerate(toks):
        if t.tag not in CONTENT: continue
        nx=toks[i+1] if i+1<len(toks) else None
        if t.tag in ('NNG','XR') and nx and nx.tag in ('XSV','XSA') and nx.form=='하': out.append(t.form+'하다')
        elif t.tag in ('VV','VA'): out.append(t.form+'다')
        else: out.append(t.form)
    return out
def strings(js):  # the string literals of a JS file (comments skipped, so an English "don't" can't pair up quotes)
    out=[];i=0;n=len(js)
    while i<n:
        c=js[i]
        if js.startswith('//',i): i=js.find('\n',i);i=n if i<0 else i;continue
        if js.startswith('/*',i): i=js.find('*/',i+2);i=n if i<0 else i+2;continue
        if c in '\'"`':
            j=i+1;buf=[]
            while j<n and js[j]!=c:
                if js[j]=='\\': j+=1
                elif c=='`' and js.startswith('${',j): j=js.find('}',j);buf.append(' ')
                else: buf.append(js[j])
                j+=1
            out.append(''.join(buf));i=j+1;continue
        i+=1
    return out
files={p.stem:norm(p.read_text(encoding='utf-8')) for p in sorted((repo/'src/chapters').glob('*.js'))}
if en is None:
    chw={}
    for p in sorted((repo/'src/chapters').glob('*.js')):
        d=chw.setdefault(p.stem,{})
        for t in strings(p.read_text(encoding='utf-8')):
            t=norm(t).replace('___','')
            if not re.search(r'[가-힣]',t): continue
            for w in words(kiwi.tokenize(t)): d[w]=d.get(w,0)+1
    (repo/'src/grammar-tags.json').write_text(json.dumps({'pats':[],'lines':{},'cnt':[],'n':0,'chw':chw},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f"{repo.resolve().name}: no lines-en.json, chapter words only: "+', '.join(f"{k} {len(v)} words" for k,v in chw.items()))
    sys.exit()
pats=[];idx={};lines={};chw={}
for key in en:
    line=norm(key).replace('___','')
    if not re.search(r'[가-힣]',line): continue
    toks=kiwi.tokenize(line)
    ps=patterns(toks)
    if ps: lines[norm(key)]=[idx.setdefault(p,len(idx)) for p in ps]
    ch=next((f for f,txt in files.items() if norm(key) in txt),None)
    if ch:
        d=chw.setdefault(ch,{})
        for w in words(toks): d[w]=d.get(w,0)+1
pats=[p for p,_ in sorted(idx.items(),key=lambda x:x[1])]
cnt=[0]*len(pats)
for v in lines.values():
    for i in v: cnt[i]+=1
out={'pats':pats,'lines':lines,'cnt':cnt,'n':len(en),'chw':chw}
(repo/'src/grammar-tags.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'),sort_keys=False)+'\n',encoding='utf-8')
top=sorted(zip(cnt,pats),reverse=True)[:12]
print(f"{repo.resolve().name}: {len(en)} lines, {len(lines)} with patterns, {len(pats)} patterns; chapters: "+', '.join(f"{k} {len(v)} words" for k,v in chw.items()))
print('most common: '+' · '.join(f'{p} {c}' for c,p in top))
