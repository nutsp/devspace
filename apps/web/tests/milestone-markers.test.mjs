import test from "node:test";
import assert from "node:assert/strict";
import { milestoneMarkerOffset, groupMilestonesByDate, splitMilestoneMarkers } from "../helpers/milestone-markers.ts";
test("milestone markers align with calendar-day centers across DST and chart scales without mutating the start", () => {
  const start = new Date(2026, 2, 7, 17, 30);
  const before = start.getTime();
  assert.equal(milestoneMarkerOffset("2026-03-07", start, 28), 14);
  assert.equal(milestoneMarkerOffset("2026-03-09", start, 28), 70);
  assert.equal(milestoneMarkerOffset("2026-03-06", start, 28), -14);
  assert.equal(milestoneMarkerOffset("2026-03-09", start, 8), 20);
  assert.equal(start.getTime(), before);
  assert.equal(milestoneMarkerOffset("invalid", start, 28), null);
  assert.equal(milestoneMarkerOffset("2026-03-09", start, 0), null);
});
test("milestones sharing a date stay in one marker; undated targets stay out of the chart", () => {
  const a = { id: "a", target_date: "2026-11-01" },
    b = { id: "b", target_date: "2026-11-01" };
  const rows = [{ id: "undated", target_date: null }, { id: "later", target_date: "2026-11-02" }, a, b];
  assert.deepEqual(groupMilestonesByDate(rows), [
    { date: "2026-11-01", items: [a, b] },
    { date: "2026-11-02", items: [rows[1]] },
  ]);
  assert.equal(rows[0].id, "undated");
});

test("same-day markers show up to four and retain all overflow targets without mutating data", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: String(i), target_date: "2026-11-05" }));
  const result = splitMilestoneMarkers(rows);
  assert.deepEqual(
    result.visible.map((m) => m.id),
    ["0", "1", "2", "3"]
  );
  assert.deepEqual(
    result.overflow.map((m) => m.id),
    ["4", "5", "6"]
  );
  assert.equal(rows.length, 7);
  assert.deepEqual(splitMilestoneMarkers(rows.slice(0, 4)).overflow, []);
  assert.deepEqual(splitMilestoneMarkers([]), { visible: [], overflow: [] });
});
