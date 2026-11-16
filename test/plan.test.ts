import assert from "node:assert/strict";
import { test } from "node:test";
import { draftTrail, isDestructive, normalizeRoute, planCases, screenId, type PlanPage } from "../src/plan.js";

const form: PlanPage = {
  route: "/register", anonymous: "open",
  forms: [{ submit: "Submit", fields: [{ label: "Email", type: "email", required: true }, { label: "Password", type: "password", required: true, maxlength: 128 }] }],
};

test("routes become screen ids and numeric segments collapse", () => {
  assert.equal(screenId("/admin/users"), "admin-users");
  assert.equal(screenId("/"), "home");
  assert.equal(normalizeRoute("/users/12/edit"), "/users/:id/edit");
});

test("the case plan comes from what the markup declares, and says why a case is n/a", () => {
  const plan = planCases(form);
  assert.ok(plan.valid!.draft && plan.invalid!.draft && plan.empty!.draft && plan.boundary!.draft);
  assert.match(plan.permission!.na!, /open to signed-out/);
  assert.ok(plan["server-error"]!.skip);
  const bare = planCases({ route: "/about", anonymous: "login", forms: [] });
  assert.match(bare.invalid!.na!, /no form/);
  assert.ok(bare.permission!.draft);
});

test("draft flows type each field, submit, and only assert what the page itself shows", () => {
  const valid = draftTrail("http://x.test", form, "valid")!;
  assert.match(valid, /web_type/);
  assert.match(valid, /textbox \\"Email\\"/);
  assert.doesNotMatch(valid, /verify/);
  assert.match(draftTrail("http://x.test", form, "empty")!, /web_verifyElementVisible/);
  assert.equal(draftTrail("http://x.test", form, "boundary"), null);
  assert.match(draftTrail("http://x.test", { route: "/a", anonymous: "login", forms: [] }, "permission")!, /web_waitForUrl/);
});

test("a reset or delete form gets no draft that submits it, only the signed-out check", () => {
  assert.ok(isDestructive("/admin/reset", "Reset"));
  assert.ok(!isDestructive("/settings", "Submit"));
  const page: PlanPage = { route: "/admin/reset", anonymous: "login", forms: [{ submit: "Reset", fields: [{ label: "Pages", type: "text", required: false }] }] };
  assert.equal(draftTrail("http://x.test", page, "valid"), null);
  assert.match(draftTrail("http://x.test", page, "permission")!, /web_waitForUrl/);
  assert.match(planCases(page).valid!.skip!, /destructive/);
});
