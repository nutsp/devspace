import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../../packages/i18n/package.json", import.meta.url));
const { createInstance } = require("i18next");
const ICU = require("i18next-icu").default;
const english = JSON.parse(
  readFileSync(new URL("../../../packages/i18n/src/locales/en/wiki.json", import.meta.url), "utf8")
);
const files = [
  "../core/components/common/workspace-select.tsx",
  "../core/components/wiki/wiki-graph-canvas.tsx",
  "../core/components/wiki/wiki-graph.tsx",
  "../core/components/wiki/wiki-page-links.tsx",
  "../core/components/wiki/wiki-page-dnd.tsx",
  "../core/components/timesheet/weekly-timesheet.tsx",
  "../core/components/wiki/workspace-wiki.tsx",
  "../app/(all)/[workspaceSlug]/wiki/editor.tsx",
  "../core/components/navigation/app-rail-hoc.tsx",
  "../core/components/navigation/app-rail-root.tsx",
];
test("workspace tools resolve English labels, ICU values and fallback through Plane i18next conventions", async () => {
  const i18n = createInstance();
  i18n.use(ICU);
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { wiki: english } },
    ns: ["wiki"],
    defaultNS: "wiki",
    nsSeparator: false,
  });
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /[\u0E00-\u0E7F]/, file);
    for (const [, key] of source.matchAll(/\bt\("(workspace_tools\.[^"]+)"/g))
      assert.ok(i18n.exists(key), `${file}: ${key}`);
  }
  for (const status of ["draft", "submitted", "returned", "approved"])
    assert.ok(i18n.exists(`workspace_tools.${status}`));
  for (const action of ["add-entry", "update-entry", "delete-entry", "submit", "approve", "return"])
    assert.ok(i18n.exists(`workspace_tools.event_${action}`));
  assert.equal(i18n.t("workspace_tools.total_duration", { duration: "6:30" }), "Total 6:30 hours");
  assert.equal(
    i18n.t("workspace_tools.pending_description", { count: 2 }),
    "2 pending · Only time for projects you lead is shown"
  );
  for (const status of ["unassigned", "unscheduled", "overdue", "changed", "due_soon", "reviewed", "scheduled"])
    assert.ok(i18n.exists(`workspace_tools.wiki_review_${status}`));
  assert.equal(i18n.t("workspace_tools.mark_reviewed"), "Mark reviewed");
  assert.equal(i18n.t("workspace_tools.graph_open_page", { name: "Guide" }), "Open page: Guide");
  assert.equal(i18n.t("workspace_tools.graph_count", { count: 2 }), "2 pages");
  await i18n.changeLanguage("fr");
  assert.equal(i18n.t("workspace_tools.add_entry"), "Add time entry");
  assert.doesNotMatch(new Date("2026-10-26T12:00:00Z").toLocaleDateString("en"), /2569/);
});
