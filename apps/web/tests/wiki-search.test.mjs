import { test } from "node:test";
import assert from "node:assert/strict";
import { wikiSearchParts } from "../helpers/wiki-search.ts";
test("highlights Thai and English terms without changing the original text", () => {
  const text = "คู่มือทดสอบ ReleaseGate and RELEASEGATE";
  const parts = wikiSearchParts(text, "คู่มือทดสอบ releasegate");
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(
    parts.filter((p) => p.match).map((p) => p.text),
    ["คู่มือทดสอบ", "ReleaseGate", "RELEASEGATE"]
  );
});
test("regex characters and markup are plain text, never interpreted", () => {
  for (const term of ["[a]", ".*", "<script>", "100%", "_literal_"]) {
    const text = `Prefix ${term} suffix`;
    const parts = wikiSearchParts(text, term);
    assert.deepEqual(
      parts.filter((p) => p.match).map((p) => p.text),
      [term]
    );
    assert.equal(parts.map((p) => p.text).join(""), text);
  }
  assert.deepEqual(wikiSearchParts("Plain", "   "), [{ text: "Plain", match: false, start: 0 }]);
  assert.deepEqual(wikiSearchParts("Plain", "missing"), [{ text: "Plain", match: false, start: 0 }]);
});
