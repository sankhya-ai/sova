"""Delete CTFd's rate-limit counters from its filesystem cache, and nothing else (sessions live there too).
A counter is a cache entry whose value is a plain integer."""
import glob, os, pickle, struct, sys
cache = sys.argv[1]
removed = 0
for path in glob.glob(os.path.join(cache, "*")):
    try:
        with open(path, "rb") as f:
            f.read(4)  # expiry
            value = pickle.load(f)
    except Exception:
        continue
    if type(value) is int:
        os.remove(path); removed += 1
print(removed)
