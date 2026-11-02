import test from "node:test";
import assert from "node:assert/strict";
import { wikiCollectionPermissions } from "../helpers/wiki-permissions.ts";

test("collection mutations follow existing member/editor and administrator permissions", () => {
  for (const role of [undefined, 0, 5, 10])
    assert.deepEqual(wikiCollectionPermissions(role), { canEdit: false, canDelete: false });
  assert.deepEqual(wikiCollectionPermissions(15), { canEdit: true, canDelete: false });
  assert.deepEqual(wikiCollectionPermissions(20), { canEdit: true, canDelete: true });
});
