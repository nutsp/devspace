import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWikiSidebarState,
  parseWikiSidebarState,
  wikiSidebarStorageKey,
  revealWikiSidebarPage,
  wikiSidebarWidth,
} from "../helpers/wiki-sidebar-state.ts";

test("saved sidebar state round-trips closed groups, independent collections and nested branches", () => {
  const state = {
    ...defaultWikiSidebarState(),
    collectionsOpen: false,
    expandedCollections: { engineering: true, product: false },
    collapsedPages: { root: true, child: false },
  };
  assert.deepEqual(parseWikiSidebarState(JSON.stringify(state)), state);
  const first = defaultWikiSidebarState();
  first.expandedCollections.a = true;
  assert.deepEqual(defaultWikiSidebarState().expandedCollections, {});
});

test("missing, corrupt and incompatible preferences fall back without throwing", () => {
  for (const raw of [
    null,
    "",
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...defaultWikiSidebarState(), version: 2 }),
    JSON.stringify({ ...defaultWikiSidebarState(), collectionsOpen: "false" }),
    JSON.stringify({ ...defaultWikiSidebarState(), expandedCollections: [] }),
    JSON.stringify({ ...defaultWikiSidebarState(), collapsedPages: { root: "true" } }),
  ]) {
    assert.equal(parseWikiSidebarState(raw), undefined);
  }
});

test("storage scope separates users and workspaces and never uses anonymous preferences", () => {
  assert.notEqual(wikiSidebarStorageKey("pm", "demo"), wikiSidebarStorageKey("guest", "demo"));
  assert.notEqual(wikiSidebarStorageKey("pm", "demo"), wikiSidebarStorageKey("pm", "other"));
  assert.notEqual(wikiSidebarStorageKey("a:b", "c"), wikiSidebarStorageKey("a", "b:c"));
  assert.equal(wikiSidebarStorageKey(undefined, "demo"), null);
  assert.equal(wikiSidebarStorageKey("pm", ""), null);
});

const pages = [
  { id: "root", collection_id: "a", parent_id: null },
  { id: "child", collection_id: "a", parent_id: "root" },
  { id: "leaf", collection_id: "a", parent_id: "child" },
  { id: "other", collection_id: "b", parent_id: null },
];
test("new document selection reveals only its collection and ancestors without mutating saved state", () => {
  const state = {
    ...defaultWikiSidebarState(),
    collectionsOpen: false,
    expandedCollections: { a: false, b: false },
    collapsedPages: { root: true, child: true, leaf: true, other: true },
  };
  const before = structuredClone(state);
  const next = revealWikiSidebarPage(state, "a", "leaf", pages);
  assert.equal(next.collectionsOpen, true);
  assert.deepEqual(next.expandedCollections, { a: true, b: false });
  assert.deepEqual(next.collapsedPages, { root: false, child: false, leaf: true, other: true });
  assert.deepEqual(state, before);
});

test("removed pages, cross-collection parents and corrupt cycles do not reveal unrelated branches or loop", () => {
  const state = { ...defaultWikiSidebarState(), collapsedPages: { other: true } };
  assert.deepEqual(revealWikiSidebarPage(state, "a", "removed", pages).collapsedPages, { other: true });
  const foreign = [{ id: "leaf", collection_id: "a", parent_id: "other" }, pages[3]];
  assert.deepEqual(revealWikiSidebarPage(state, "a", "leaf", foreign).collapsedPages, { other: true });
  const cycle = [
    { id: "x", collection_id: "a", parent_id: "y" },
    { id: "y", collection_id: "a", parent_id: "x" },
  ];
  assert.deepEqual(revealWikiSidebarPage(state, "a", "x", cycle).collapsedPages, { other: true, x: false, y: false });
});

test("sidebar width uses Project bounds and restores legacy or invalid preferences safely", () => {
  assert.equal(wikiSidebarWidth(300), 300);
  assert.equal(wikiSidebarWidth(100), 236);
  assert.equal(wikiSidebarWidth(1000), 350);
  for (const value of [undefined, null, "300", NaN, Infinity]) assert.equal(wikiSidebarWidth(value), 250);
  const legacy = defaultWikiSidebarState();
  delete legacy.width;
  assert.equal(parseWikiSidebarState(JSON.stringify(legacy)).width, 250);
  assert.equal(parseWikiSidebarState(JSON.stringify({ ...legacy, width: 310 })).width, 310);
  assert.equal(parseWikiSidebarState(JSON.stringify({ ...legacy, width: 900 })).width, 350);
});
