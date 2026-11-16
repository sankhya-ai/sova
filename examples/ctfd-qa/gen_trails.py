"""Writes the hand-authored CTFd flows as Trailblaze trail files (trails/<id>/trail.yaml)."""
import os, json

B = "http://127.0.0.1:4000"
trails = {}

def flow(id, *steps):
    out = ["config:", "  devices:", "    web:", "      driver: PLAYWRIGHT_NATIVE", f"  title: {id}", "", "trail:"]
    for text, call, args in steps:
        out += [f'  - step: "{text}"', "    recording:", "      web:", f"        - {call}:"]
        for k, v in args.items():
            out.append(f"            {k}: {json.dumps(v)}")
        out.append("")
    trails[id] = "\n".join(out)

nav = lambda t, p: (t, "web_navigate", {"url": B + p})
typ = lambda t, ref, text: (t, "web_type", {"text": text, "ref": ref})
click = lambda t, ref: (t, "web_click", {"ref": ref})
see = lambda t, ref: (t, "web_verifyElementVisible", {"ref": ref})
val = lambda t, ref, exp: (t, "web_verifyValue", {"ref": ref, "expected": exp, "type": "VALUE"})

def login(who, pw=None):
    name = "{{env.%s_NAME}}" % who
    return [nav("Open the login page", "/login"),
            typ("Type the user name", 'textbox "User Name or Email"', name),
            typ("Type the password", 'textbox "Password"', pw or "{{env.%s_PASSWORD}}" % who),
            click("Press Submit", 'button "Submit"')]

flow("sign-in-admin", *login("ADMIN"), see("The admin panel link is shown", "css=a[href=\"/admin\"]"))
flow("sign-in-user", *login("USER"), see("The logout link is shown", "css=a[href=\"/logout\"]"))
flow("login-wrong-password", *login("USER", "definitely-wrong-pass"), see("The error is shown", "css=text=Your username or password is incorrect"))
flow("signed-out-redirects-to-login", nav("Open the challenges while signed out", "/challenges"),
     see("The login form is shown", 'textbox "User Name or Email"'))
def register(id, name, email, pw, err, title):
    flow(id, nav("Open the register page", "/register"), typ("Type a name", 'textbox "User Name"', name),
         typ("Type an email", 'textbox "Email"', email), typ("Type a password", 'textbox "Password"', pw),
         click("Press Submit", 'button "Submit"'), see(title, "css=text=" + err))
register("register-duplicate-name", "{{env.USER_NAME}}", "{{unique.sova-dup@example.com}}", "secret-pass-123", "That user name is already taken", "The taken-name error is shown")
solver = lambda: login("SOLVER") + [nav("Open the challenges", "/challenges"), click("Open Warmup", 'button "Warmup 100"')]
submit = lambda flag: [typ("Type a flag", "css=input[name=submission]", flag), click("Submit the flag", 'button "Submit"')]
flow("challenge-wrong-flag", *solver(), *submit("flag{nope}"), see("The flag is rejected", "css=text=Incorrect"))
flow("challenge-wrong-flag-same-length", *solver(), *submit("flag{warmuq}"), see("The flag is rejected", "css=text=Incorrect"))
flow("challenge-flag-prefix", *solver(), *submit("flag{warmu"), see("The flag is rejected", "css=text=Incorrect"))
flow("challenge-correct-flag-scores", *solver(), *submit("flag{warmup}"), see("The flag is accepted", "css=text=Correct"),
     nav("Open the scoreboard", "/scoreboard"), see("The solver is listed", "css=a >> text=qa-solver >> visible=true >> nth=0"),
     see("The solver has the 100 points", "css=td >> text=100 >> visible=true >> nth=0"))
flow("admin-area-redirects-user", nav("Open the admin users page as a regular user", "/admin/users"),
     see("The login form is shown instead of the admin users page", 'textbox "User Name or Email"'))
flow("admin-challenges-list", nav("Open the admin challenges", "/admin/challenges"), see("Warmup is listed", "css=a >> text=Warmup >> visible=true >> nth=0"))
flow("admin-users-list", nav("Open the admin users", "/admin/users"), see("The regular user is listed", 'link "qa-user"'))
for id, t in trails.items():
    os.makedirs(f"trails/{id}", exist_ok=True)
    open(f"trails/{id}/trail.yaml", "w").write(t + "\n")
print(len(trails), "trails")
