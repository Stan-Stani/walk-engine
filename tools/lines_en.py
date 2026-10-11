#!/usr/bin/env python3
"""Whole-line English (the ? by the speaker button): which lines a game can show, and which have no English yet.
From a game's repo root:  python3 ../walk-engine/tools/lines_en.py .
Reads every quoted string with Hangul in src/chapters/*.js and src/school.js (culture.js / grammar.js have their own English),
keeps the ones that are lines (a space or end punctuation; not names, dictionary text or object keys), and compares them with
src/lines-en.json ({Korean line as written, gloss markup {shown|key} → shown: close English}). Writes src/lines-todo.json (the
lines with no English: ko, answer for a fill-in question, file) and prints the counts. A fill-in question's English is the whole
line with the blank filled by its answer: it shows only after the question is answered. Lines built at run time (with ${…})
can't be keyed and are skipped."""
import json,re,sys,pathlib
repo=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.')
SKIP={'k','e','ex','hj','name','who','title','place','reg','n','introWho','label','w','look','tile','zone','by','id','t','src','reactWho'}
STR=re.compile(r"'((?:[^'\\\n]|\\.)*)'|`([^`]*)`|\"((?:[^\"\\\n]|\\.)*)\"")
ANSWER=re.compile(r"\[(['\"])((?:[^'\"\\]|\\.)*)\1,1[,\]]")
plain=lambda t:re.sub(r'\{([^|}]+)\|[^}]+\}',r'\1',t)
files=sorted((repo/'src/chapters').glob('ch*.js'),key=lambda p:int(re.search(r'\d+',p.stem).group()))+[q for q in [repo/'src/school.js'] if q.exists()]
lines={}  # ko → {answer?, file}
dynamic=0
for p in files:
    rows=p.read_text(encoding='utf-8').split('\n')
    for i,row in enumerate(rows):
        if '/*nolex*/' in row: continue
        for m in STR.finditer(row):
            raw=next(g for g in m.groups() if g is not None)
            if not re.search('[가-힣]',raw): continue
            if m.group(2) is not None and '${' in raw: dynamic+=1; continue
            before,after=row[:m.start()],row[m.end():]
            if re.search(r'[{,]\s*$',before) and re.match(r'\s*:',after): continue  # an object key ('방송실':{k:…})
            key=re.search(r'(\w+)\s*:\s*$',before)
            if key and key.group(1) in SKIP: continue
            t=plain(raw.replace("\\'","'").replace('\\"','"'))
            if ' ' not in t.strip() and not re.search(r'[.?!…~]$',t.strip()): continue  # one word: a choice, a tile, a name
            if t in lines: continue
            e={'file':str(p.relative_to(repo))}
            if key and key.group(1)=='ask' and '___' in t:
                a=ANSWER.search(after+' '+' '.join(rows[i+1:i+3]))  # the choices can start on the next line
                if a: e['answer']=a.group(2)
            lines[t]=e
en_p=repo/'src/lines-en.json'
en=json.loads(en_p.read_text(encoding='utf-8')) if en_p.exists() else {}
todo=[{'ko':k,**v} for k,v in lines.items() if not (en.get(k) or '').strip()]
stale=[k for k in en if k not in lines]
(repo/'src/lines-todo.json').write_text(json.dumps(todo,ensure_ascii=False,indent=0)+'\n',encoding='utf-8')
print(f'{repo.resolve().name}: {len(lines)} lines, {len(lines)-len(todo)} with English, {len(todo)} without (src/lines-todo.json)'
      f' · {len(stale)} English entries no longer in the game · {dynamic} built at run time (skipped)')
