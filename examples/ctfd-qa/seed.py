"""Set up a fresh CTFd (users mode) and seed it. Throwaway local accounts only. Writes sova/.env."""
import http.cookiejar, json, re, sys, urllib.parse, urllib.request

BASE = "http://127.0.0.1:4000"
ADMIN = ("qa-admin", "qa-admin@example.com", "qa-admin-pass-1")
USER = ("qa-user", "qa-user@example.com", "qa-user-pass-1")
SOLVER = ("qa-solver", "qa-solver@example.com", "qa-solver-pass-1")

jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(path):
    return op.open(BASE + path).read().decode()

def post_form(path, fields):
    return op.open(BASE + path, urllib.parse.urlencode(fields).encode()).read().decode()

def nonce(html):
    return re.search(r'name="nonce"[^>]*value="([^"]+)"', html).group(1)

def api(method, path, body=None, csrf=None, token=None):
    headers = {"Content-Type": "application/json"}
    if csrf: headers["CSRF-Token"] = csrf
    if token: headers["Authorization"] = f"Token {token}"
    req = urllib.request.Request(BASE + path, json.dumps(body).encode() if body is not None else None, headers, method=method)
    return json.load(op.open(req))

page = get("/setup")
post_form("/setup", {"ctf_name": "Sova QA CTF", "ctf_description": "qa", "user_mode": "users", "challenge_visibility": "private",
    "account_visibility": "public", "score_visibility": "public", "registration_visibility": "public", "verify_emails": "false",
    "team_size": "", "name": ADMIN[0], "email": ADMIN[1], "password": ADMIN[2], "ctf_theme": "core", "theme_color": "",
    "start": "", "end": "", "nonce": nonce(page)})
csrf = re.search(r"csrfNonce': \"([^\"]+)\"", get("/settings")).group(1)
token = api("POST", "/api/v1/tokens", {"expiration": "2030-01-01", "description": "sova"}, csrf)["data"]["value"]
for n, e, p in (USER, SOLVER):
    api("POST", "/api/v1/users", {"name": n, "email": e, "password": p, "type": "user", "verified": True, "hidden": False, "banned": False}, token=token)
for name, cat, value, flag in (("Warmup", "Misc", 100, "flag{warmup}"), ("Crypto One", "Crypto", 250, "flag{crypto-one}")):
    c = api("POST", "/api/v1/challenges", {"name": name, "category": cat, "description": name, "value": value, "state": "visible", "type": "standard"}, token=token)
    api("POST", "/api/v1/flags", {"challenge_id": c["data"]["id"], "content": flag, "type": "static", "data": ""}, token=token)
open("sova/.env", "w").write(f"""CTFD_ADMIN_TOKEN={token}
ADMIN_NAME={ADMIN[0]}
ADMIN_PASSWORD={ADMIN[2]}
USER_NAME={USER[0]}
USER_PASSWORD={USER[2]}
SOLVER_NAME={SOLVER[0]}
SOLVER_PASSWORD={SOLVER[2]}
""")
print("seeded")
