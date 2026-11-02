export type WikiGraphNode = { id: string; name: string; collection_id: string; collection_name: string };
export type WikiGraphEdge = { source: string; target: string; type: "link" | "parent" };
export type WikiGraphData = {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  incoming: WikiGraphNode[];
  outgoing: WikiGraphNode[];
  focus_id: string | null;
  total_nodes: number;
  truncated: boolean;
};
export type GraphPoint = WikiGraphNode & { x: number; y: number; vx: number; vy: number; degree: number };
export type GraphForces = { repel: number; distance: number };
export const WIKI_GRAPH_REFRESH_MS = 3000;

/** Retain existing positions when saved links change, so polling never resets the camera or the graph. */
export function createWikiGraphSimulation(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  width: number,
  height: number,
  previous: GraphPoint[] = []
) {
  const old = new Map(previous.map((p) => [p.id, p]));
  const degrees = new Map<string, number>();
  const links = edges.filter((e) => e.type === "link");
  for (const edge of links) for (const id of [edge.source, edge.target]) degrees.set(id, (degrees.get(id) || 0) + 1);
  const points: GraphPoint[] = nodes.map((node, i) => {
    const saved = old.get(node.id),
      angle = i * 2.39996;
    const radius = Math.min(width, height) * 0.34 * Math.sqrt((i + 1) / Math.max(1, nodes.length));
    return {
      ...node,
      x: saved?.x ?? width / 2 + Math.cos(angle) * radius,
      y: saved?.y ?? height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      degree: degrees.get(node.id) || 0,
    };
  });
  const byId = new Map(points.map((p) => [p.id, p]));
  const springs = edges.flatMap((e) => {
    const a = byId.get(e.source),
      b = byId.get(e.target);
    return a && b && a !== b ? [{ a, b }] : [];
  });
  return {
    points,
    step(forces: GraphForces, pinned?: { id: string; x: number; y: number }) {
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i],
            b = points[j];
          const dx = a.x - b.x || 0.01,
            dy = a.y - b.y || 0.01;
          const strength = (450 * forces.repel) / Math.max(100, dx * dx + dy * dy);
          a.vx += dx * strength;
          a.vy += dy * strength;
          b.vx -= dx * strength;
          b.vy -= dy * strength;
        }
      for (const { a, b } of springs) {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          distance = Math.max(1, Math.hypot(dx, dy));
        const strength = ((distance - forces.distance) / distance) * 0.045;
        a.vx += dx * strength;
        a.vy += dy * strength;
        b.vx -= dx * strength;
        b.vy -= dy * strength;
      }
      for (const p of points) {
        if (p.id === pinned?.id) {
          p.x = pinned.x;
          p.y = pinned.y;
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx = (p.vx + (width / 2 - p.x) * 0.007) * 0.72;
        p.vy = (p.vy + (height / 2 - p.y) * 0.007) * 0.72;
        p.x += Math.max(-8, Math.min(8, p.vx));
        p.y += Math.max(-8, Math.min(8, p.vy));
      }
      return points;
    },
  };
}
