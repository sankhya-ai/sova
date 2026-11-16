// The suite's fixtures. Every generated spec imports `test` and `expect` from here.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test as base } from '@playwright/test';

const api = process.env.SOVA_BASE_URL ?? 'http://127.0.0.1:4000';
const headers = () => ({ Authorization: `Token ${process.env.CTFD_ADMIN_TOKEN}`, 'Content-Type': 'application/json' });
// CTFd keeps its rate-limit counters in this cache folder (no Redis), next to the login sessions. Rate limiting stays ON;
// each test starts with empty counters, and clear_limits.py leaves everything else in the cache (the sessions) alone.
const cacheDir = process.env.CTFD_CACHE_DIR ?? join(process.cwd(), 'ctfd', '.data', 'filesystem_cache');

type Cleanup = { register: (undo: () => Promise<void>) => void };

export const test = base.extend<{ cleanup: Cleanup }>({
  cleanup: [
    async ({ playwright }, use) => {
      execFileSync(process.env.CTFD_PY ?? `${process.env.HOME}/ctfd-venv/bin/python`, [join(process.cwd(), 'clear_limits.py'), cacheDir]);
      // A fresh request context with no cookies: CTFd lets an API token upgrade the session cookie
      // it arrives with, so reusing the test's own context would turn the regular user into an admin.
      const request = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
      const undo: Array<() => Promise<void>> = [];
      await use({ register: (fn) => undo.push(fn) });
      for (const fn of undo.reverse()) await fn();
      // Put the server back as the seed left it, whatever the test did.
      const users = await request.get(`${api}/api/v1/users?view=admin&per_page=100`, { headers: headers() });
      if (!users.ok()) {
        await request.dispose();
        return;
      }
      const all = ((await users.json()).data ?? []) as Array<{ id: number; name: string }>;
      const del = (path: string) => request.delete(`${api}${path}`, { headers: headers() });
      // 1. Every submission by the solver account, so the challenge is unsolved again.
      const solver = all.find((u) => u.name === process.env.SOLVER_NAME);
      if (solver) {
        const subs = await request.get(`${api}/api/v1/submissions?user_id=${solver.id}&per_page=100`, { headers: headers() });
        for (const s of ((await subs.json()).data ?? []) as Array<{ id: number }>) await del(`/api/v1/submissions/${s.id}`);
      }
      // 2. Every account a test registered (named sova-...).
      for (const u of all.filter((x) => x.name.startsWith('sova-'))) await del(`/api/v1/users/${u.id}`);
      // 3. A second account with a seeded name (a broken duplicate check lets a test register one).
      const seen = new Set<string>();
      for (const u of [...all].sort((a, b) => a.id - b.id)) {
        if (seen.has(u.name)) await del(`/api/v1/users/${u.id}`);
        seen.add(u.name);
      }
      await request.dispose();
    },
    { auto: true },
  ],
});

export { expect };
