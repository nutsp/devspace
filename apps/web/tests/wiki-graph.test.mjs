import { test } from "node:test";
import assert from "node:assert/strict";
import { createWikiGraphSimulation } from "../helpers/wiki-graph.ts";
const nodes = Array.from({ length: 30 }, (_, i) => ({
  id: String(i),
  name: "Page " + i,
  collection_id: "c",
  collection_name: "Collection",
}));
const edges = [
  { source: "0", target: "1", type: "link" },
  { source: "missing", target: "2", type: "parent" },
];
const settle = (simulation, forces = { repel: 1, distance: 110 }) => {
  for (let i = 0; i < 180; i++) simulation.step(forces);
  return simulation.points;
};
test("force graph settles deterministically with finite positions without mutating its data", () => {
  const before = structuredClone(nodes);
  const a = settle(createWikiGraphSimulation(nodes, edges, 900, 560));
  assert.deepEqual(a, settle(createWikiGraphSimulation(nodes, edges, 900, 560)));
  assert.deepEqual(nodes, before);
  assert.ok(a.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(a[0].degree, 1);
  assert.equal(a[2].degree, 0);
  assert.deepEqual(settle(createWikiGraphSimulation([], [], 900, 560)), []);
});
test("dragging pins the node while linked nodes react; saved updates retain positions", () => {
  const simulation = createWikiGraphSimulation(nodes, edges, 900, 560);
  const original = { ...simulation.points[1] };
  for (let i = 0; i < 20; i++) simulation.step({ repel: 1, distance: 110 }, { id: "0", x: 100, y: 80 });
  assert.equal(simulation.points[0].x, 100);
  assert.equal(simulation.points[0].y, 80);
  assert.notEqual(simulation.points[1].x, original.x);
  const updated = createWikiGraphSimulation(
    nodes,
    [{ source: "0", target: "2", type: "link" }],
    900,
    560,
    simulation.points
  );
  assert.equal(updated.points[0].x, 100);
  assert.equal(updated.points[0].y, 80);
  assert.equal(updated.points[1].degree, 0);
  assert.equal(updated.points[2].degree, 1);
});
test("link distance control changes the distance between related documents", () => {
  const a = settle(createWikiGraphSimulation(nodes.slice(0, 2), edges, 900, 560), { repel: 1, distance: 60 });
  const b = settle(createWikiGraphSimulation(nodes.slice(0, 2), edges, 900, 560), { repel: 1, distance: 180 });
  assert.ok(Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) < Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y));
});
