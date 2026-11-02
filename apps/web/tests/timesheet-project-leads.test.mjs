import test from "node:test";
import assert from "node:assert/strict";
import { timesheetProjectLeads } from "../helpers/timesheet-project-leads.ts";
test("review routing deduplicates project entries and blocks absent or ineligible leads", () => {
  const entries = [
    { project_id: "a", project_name: "A" },
    { project_id: "a", project_name: "A" },
    { project_id: "b", project_name: "B" },
    { project_id: null, project_name: "Deleted" },
  ];
  const result = timesheetProjectLeads(entries, [
    { id: "a", project_lead_name: "Lead A", lead_eligible: true },
    { id: "b", project_lead_name: "Self", lead_eligible: false },
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].lead, "Lead A");
  assert.equal(result[0].eligible, true);
  assert.equal(result[1].eligible, false);
  assert.equal(result[2].eligible, false);
  assert.deepEqual(timesheetProjectLeads([], []), []);
});
