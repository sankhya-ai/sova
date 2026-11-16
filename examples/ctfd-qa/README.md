# CTFd QA example (Flask app with login, roles, scoring)

A Sova suite for [CTFd](https://github.com/CTFd/CTFd) at commit 485d59e, run on a 2GB box. Local throwaway accounts only.

Setup:
1. Clone CTFd at commit 485d59e anywhere, then `ln -s /path/to/CTFd ctfd` inside this folder.
2. A Python 3.11 venv with CTFd's requirements at `~/ctfd-venv` (or set `CTFD_PY`).
3. `sh ctfd.sh fresh` builds the seed database (admin, user, solver, two challenges) and writes `sova/.env`.
4. `npm install`, then `npx sova check` and `npx sova mutate`.

Rate limiting is ON. CTFd keeps its counters in a cache folder next to the login sessions, so the fixture deletes only the counter entries (`clear_limits.py`) before each test.
`ctfd.sh reset` puts the seed database back and is the project's `mutationReset`.

`gen_trails.py` writes the hand-authored trails. Four checks are hand-written specs instead (form POSTs and an API call a browser cannot send).
