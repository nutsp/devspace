import assert from "node:assert/strict";
import { test } from "node:test";
import { getWorkspaceSection } from "../helpers/workspace-app-navigation.ts";

test("existing Work routes stay in Work, including project Pages", () => {
  for (const path of [
    "/team",
    "/team/",
    "/team/projects/p/issues/",
    "/team/projects/p/pages/wiki/",
    "/team/profile/u/",
  ]) {
    assert.equal(getWorkspaceSection(path, "team"), "work");
  }
});

test("new app routes and nested URLs select only their own application", () => {
  assert.equal(getWorkspaceSection("/team/wiki/", "team"), "wiki");
  assert.equal(getWorkspaceSection("/team/wiki/collections/c", "team"), "wiki");
  assert.equal(getWorkspaceSection("/team/timesheet", "team"), "timesheet");
  assert.equal(getWorkspaceSection("/team/timesheet/weekly", "team"), "timesheet");
  assert.equal(getWorkspaceSection("/team/settings/members", "team"), "settings");
});

test("app and workspace prefixes cannot select an unrelated app", () => {
  assert.equal(getWorkspaceSection("/team/wiki-old", "team"), "work");
  assert.equal(getWorkspaceSection("/team/timesheet-export", "team"), "work");
  assert.equal(getWorkspaceSection("/team-other/wiki", "team"), null);
  assert.equal(getWorkspaceSection("/team/wiki"), null);
});
