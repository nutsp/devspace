import test from "node:test";
import assert from "node:assert/strict";
import { mondayOf, offsetDate, formatDuration } from "../helpers/timesheet.ts";
test("week boundaries handle Sunday, month and year rollover", () => {
  assert.equal(mondayOf("2026-11-01"), "2026-10-26");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(offsetDate("2026-12-28", 6), "2027-01-03");
  assert.equal(formatDuration(485), "8:05");
});
