import { test } from "node:test";
import assert from "node:assert/strict";
import { availableWikiParents } from "../helpers/wiki-page-tree.ts";
test("editing a page excludes itself and all descendants from parent choices", () => {
  const pages = [
    { id: "root", collection_id: "a", parent_id: null },
    { id: "child", collection_id: "a", parent_id: "root" },
    { id: "grand", collection_id: "a", parent_id: "child" },
    { id: "other", collection_id: "a", parent_id: null },
    { id: "outside", collection_id: "b", parent_id: null },
  ];
  assert.deepEqual(
    availableWikiParents(pages, "a", "child").map((p) => p.id),
    ["root", "other"]
  );
  assert.deepEqual(
    availableWikiParents(pages, "a").map((p) => p.id),
    ["root", "child", "grand", "other"]
  );
});
test("malformed cyclic ancestry cannot be offered as a parent", () => {
  const pages = [
    { id: "a", collection_id: "c", parent_id: "b" },
    { id: "b", collection_id: "c", parent_id: "a" },
  ];
  assert.deepEqual(availableWikiParents(pages, "c"), []);
});

import { canMoveWikiPage, wikiDropPosition } from "../helpers/wiki-page-tree.ts";
test("drop zones distinguish ordering from nesting and reject cyclic/private/cross-collection moves", () => {
  const pages = [
    { id: "root", parent_id: null, collection_id: "a", can_move: true, access: 0 },
    { id: "child", parent_id: "root", collection_id: "a", can_move: true, access: 0 },
    { id: "other", parent_id: null, collection_id: "a", can_move: true, access: 0 },
    { id: "private", parent_id: null, collection_id: "a", can_move: true, access: 1 },
    { id: "locked", parent_id: null, collection_id: "a", can_move: false, access: 0 },
    { id: "outside", parent_id: null, collection_id: "b", can_move: true, access: 0 },
  ];
  assert.equal(wikiDropPosition(100, 40, 105), "before");
  assert.equal(wikiDropPosition(100, 40, 120), "inside");
  assert.equal(wikiDropPosition(100, 40, 135), "after");
  assert.equal(canMoveWikiPage(pages, "root", "child", "inside"), false);
  assert.equal(canMoveWikiPage(pages, "root", "child", "before"), false);
  assert.equal(canMoveWikiPage(pages, "child", "root", "after"), true);
  assert.equal(canMoveWikiPage(pages, "child", null, "root"), true);
  assert.equal(canMoveWikiPage(pages, "root", "private", "inside"), false);
  assert.equal(canMoveWikiPage(pages, "root", "locked", "inside"), false);
  assert.equal(canMoveWikiPage(pages, "locked", "root", "after"), false);
  assert.equal(canMoveWikiPage(pages, "root", "outside", "before"), false);
  assert.equal(canMoveWikiPage(pages, "root", "other", "after"), true);
});
