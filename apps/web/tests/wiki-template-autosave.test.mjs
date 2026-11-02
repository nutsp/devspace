import { test } from "node:test";
import assert from "node:assert/strict";
import { createTemplateAutosave } from "../helpers/wiki-template-autosave.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
test("debounces edits and only writes the latest draft", async () => {
  const writes = [],
    saved = [];
  const saver = createTemplateAutosave({
    delay: 2,
    persist: async (value) => {
      writes.push(value);
      return value;
    },
    status: () => {},
    saved: (value) => saved.push(value),
  });
  saver.schedule("old");
  saver.schedule("latest");
  await tick();
  assert.deepEqual(writes, ["latest"]);
  assert.deepEqual(saved, ["latest"]);
  saver.dispose();
});
test("serializes writes, keeps newer edits pending, and never marks an older response saved", async () => {
  const first = deferred(),
    second = deferred(),
    writes = [],
    saved = [];
  const saver = createTemplateAutosave({
    delay: 2,
    persist: (value) => {
      writes.push(value);
      return writes.length === 1 ? first.promise : second.promise;
    },
    status: () => {},
    saved: (value) => saved.push(value),
  });
  saver.schedule("a");
  await tick();
  saver.schedule("b");
  await tick();
  assert.deepEqual(writes, ["a"]);
  first.resolve("a");
  await tick();
  assert.deepEqual(writes, ["a", "b"]);
  assert.deepEqual(saved, []);
  second.resolve("b");
  await tick();
  assert.deepEqual(saved, ["b"]);
  saver.dispose();
});
test("retains failed content for an explicit retry without a retry loop", async () => {
  let attempts = 0;
  const states = [],
    saved = [];
  const saver = createTemplateAutosave({
    delay: 2,
    persist: async (value) => {
      if (++attempts === 1) throw Error("offline");
      return value;
    },
    status: (s) => states.push(s),
    saved: (v) => saved.push(v),
  });
  saver.schedule("draft");
  await tick();
  await tick();
  assert.equal(attempts, 1);
  assert.equal(states.at(-1), "error");
  saver.retry();
  await tick();
  assert.deepEqual(saved, ["draft"]);
  saver.dispose();
});
test("invalid drafts and disposed editors cannot report an older write saved", async () => {
  const first = deferred(),
    saved = [];
  const saver = createTemplateAutosave({
    delay: 2,
    persist: () => first.promise,
    status: () => {},
    saved: (v) => saved.push(v),
  });
  saver.schedule("valid");
  await tick();
  saver.pause();
  first.resolve("valid");
  await tick();
  assert.deepEqual(saved, []);
  saver.schedule("discarded");
  saver.dispose();
  await tick();
  assert.deepEqual(saved, []);
});
