#!/usr/bin/env python3
"""flow.py <id> <role|anon|default> <<< steps. Drives sova act per line; saves on success."""
import sys, shlex, subprocess, os
S=["npx","--no-install","sova"]
def run(args, quiet=True):
    p=subprocess.run(S+args,capture_output=True,text=True,cwd="/home/sandbox/qa/app")
    return p.returncode,(p.stdout+p.stderr)
fid, role = sys.argv[1], sys.argv[2]
lines=[l for l in sys.stdin.read().splitlines() if l.strip() and not l.startswith('#')]
run(["reset"])
if role!="anon":
    rc,o=run(["login"]+([] if role=="default" else ["--as",role]))
    if "Signed in" not in o: print("LOGIN FAIL",o[-300:]); sys.exit(1)
for i,l in enumerate(lines):
    t=shlex.split(l); c=t[0]
    if c=="open": args=["open",t[1],"-s",t[2]]
    elif c=="type": args=["act","type","ref="+t[1],"text="+t[2],"-s",t[3]]
    elif c in("click","see","hover"): args=["act",c,"ref="+t[1],"-s",t[2]]
    elif c=="select": args=["act","select","ref="+t[1],"values="+t[2],"-s",t[3]]
    elif c=="press": args=["act","press","key="+t[1],"-s",t[2]]
    elif c=="url": args=["act","url","pattern="+t[1],"-s",t[2]]
    elif c=="value": args=["act","value","ref="+t[1],"expected="+t[2],"-s",t[3]]
    elif c=="look":
        rc,o=run(["look"]); print("\n".join(x for x in o.splitlines() if "[e" in x or "Page URL" in x)); continue
    else: print("bad dsl",l); sys.exit(2)
    rc,o=run(args)
    bad=[x for x in o.splitlines() if x.startswith("→ Error") or "one of" in x or "Tool " in x[:6] or "refus" in x.lower()]
    if rc!=0 or bad or "Error" in o[:40]:
        print(f"STEP {i+1} FAILED: {l}\n"+"\n".join(o.splitlines()[:6])); 
        print("--- screen:"); rc,o=run(["look"]); print("\n".join(x for x in o.splitlines() if "[e" in x or "Page URL" in x)[:2500])
        run(["discard"]); sys.exit(1)
if os.environ.get("DRY"): run(["discard"]); print("dry ok"); sys.exit(0)
rc,o=run(["save",fid]); print("\n".join(x for x in o.splitlines() if any(k in x for k in("wrote","blocked","note","assert"))))
