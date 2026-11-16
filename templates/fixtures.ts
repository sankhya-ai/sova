// The suite's fixtures. Every generated spec imports `test` and `expect` from here.
// Put shared setup, page objects and cleanup in this file. `sova init` creates it once and never overwrites it.
import { expect, test as base } from '@playwright/test';

type Cleanup = { register: (undo: () => Promise<void>) => void };

export const test = base.extend<{ cleanup: Cleanup }>({
  // Register how to remove anything a test created; it runs after the test, pass or fail.
  //   cleanup.register(async () => { await request.delete(`/api/customers/${id}`); });
  cleanup: [
    async ({}, use) => {
      const undo: Array<() => Promise<void>> = [];
      await use({ register: (fn) => undo.push(fn) });
      for (const fn of undo.reverse()) await fn();
    },
    { auto: true },
  ],
});

export { expect };
