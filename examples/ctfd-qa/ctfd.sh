#!/bin/sh
# Usage: ctfd.sh start | stop | fresh | reset | restart
#   fresh   build the seed snapshot (blank database, setup, seed accounts and challenges)
#   reset   put the snapshot back and clear the cache (so rate-limit counters start at zero), then start
#   restart stop and start on the current data (used after a source edit)
HERE=$(cd "$(dirname "$0")" && pwd); SRC=$HERE/ctfd; PY=${CTFD_PY:-$HOME/ctfd-venv/bin/python}
stop() { pkill -f "serve.py --port 4000" 2>/dev/null; sleep 1; }
start() {
  cd "$SRC" && SECRET_KEY=sova-qa-secret setsid nohup "$PY" serve.py --port 4000 > /tmp/ctfd.log 2>&1 &
  for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:4000/login && return 0; sleep 0.5; done
  echo "CTFd did not start"; tail -5 /tmp/ctfd.log; return 1
}
case "$1" in
  stop) stop;;
  start) start;;
  restart) stop; start;;
  fresh) stop; rm -rf "$SRC/CTFd/ctfd.db" "$SRC/.data"; start && (cd "$HERE" && "$PY" seed.py) && stop && cp "$SRC/CTFd/ctfd.db" "$HERE/seed.db" && start;;
  reset) stop; cp "$HERE/seed.db" "$SRC/CTFd/ctfd.db"; rm -rf "$SRC/.data/filesystem_cache"; start;;
esac
