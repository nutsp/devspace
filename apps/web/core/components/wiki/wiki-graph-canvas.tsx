import { sortBy } from "lodash-es";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { cn } from "@plane/utils";
import { createWikiGraphSimulation } from "@/helpers/wiki-graph";
import type { GraphPoint, GraphForces, WikiGraphData } from "@/helpers/wiki-graph";

const colors = [
  "text-accent-primary",
  "text-success-primary",
  "text-warning-primary",
  "text-danger-primary",
  "text-secondary",
];
type Gesture = { id?: string; startX: number; startY: number; x: number; y: number; moved: boolean };

export function WikiGraphCanvas({
  data,
  slug,
  compact,
  forces,
  groups,
}: {
  data: WikiGraphData;
  slug: string;
  compact: boolean;
  forces: GraphForces;
  groups: boolean;
}) {
  const { t } = useTranslation();
  const instructionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: compact ? 280 : 900, height: compact ? 250 : 560 });
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const simulation = useRef<ReturnType<typeof createWikiGraphSimulation> | null>(null);
  const frames = useRef(0);
  const [generation, setGeneration] = useState(0);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const forcesRef = useRef(forces);
  forcesRef.current = forces;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    simulation.current = createWikiGraphSimulation(
      data.nodes,
      data.edges,
      size.width,
      size.height,
      simulation.current?.points
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) for (let i = 0; i < 180; i++) simulation.current.step(forcesRef.current);
    frames.current = reduceMotion ? 0 : 180;
    setPoints(simulation.current.points.map((p) => ({ ...p })));
    setGeneration((v) => v + 1);
  }, [data.nodes, data.edges, size]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && simulation.current) {
      for (let i = 0; i < 180; i++) simulation.current.step(forces);
      setPoints(simulation.current.points.map((p) => ({ ...p })));
    } else frames.current = 180;
    setGeneration((v) => v + 1);
  }, [forces]);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const animate = (time: number) => {
      if (time - last > 30 && frames.current > 0 && simulation.current) {
        const active = gesture.current;
        simulation.current.step(
          forcesRef.current,
          active?.id ? { id: active.id, x: active.x, y: active.y } : undefined
        );
        setPoints(simulation.current.points.map((p) => ({ ...p })));
        frames.current--;
        last = time;
      }
      if (frames.current > 0) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [generation]);
  // Prevent the page from scrolling while a wheel gesture zooms the graph.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect(),
        old = cameraRef.current;
      const zoom = Math.max(0.25, Math.min(4, old.zoom * Math.exp(-event.deltaY * 0.0015)));
      const x = event.clientX - rect.left - size.width / 2,
        y = event.clientY - rect.top - size.height / 2;
      setCamera({ zoom, x: x - ((x - old.x) * zoom) / old.zoom, y: y - ((y - old.y) * zoom) / old.zoom });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [size]);
  const byId = new Map(points.map((p) => [p.id, p]));
  const collections = sortBy([...new Set(points.map((p) => p.collection_id))]);
  const related = new Set([
    hovered,
    ...data.edges.filter((e) => e.source === hovered || e.target === hovered).flatMap((e) => [e.source, e.target]),
  ]);
  const zoomBy = (factor: number) => setCamera((c) => ({ ...c, zoom: Math.max(0.25, Math.min(4, c.zoom * factor)) }));
  return (
    <div
      ref={container}
      className={cn("relative min-h-0 overflow-hidden bg-surface-1", compact ? "h-64 shrink-0 rounded-md" : "flex-1")}
    >
      <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-md border border-subtle bg-layer-2 p-1">
        <IconButton
          icon={Plus}
          variant="ghost"
          size="base"
          aria-label={t("workspace_tools.graph_zoom_in")}
          onClick={() => zoomBy(1.25)}
        />
        <IconButton
          icon={Minus}
          variant="ghost"
          size="base"
          aria-label={t("workspace_tools.graph_zoom_out")}
          onClick={() => zoomBy(0.8)}
        />
        <IconButton
          icon={RotateCcw}
          variant="ghost"
          size="base"
          aria-label={t("workspace_tools.graph_reset")}
          onClick={() => {
            setCamera({ x: 0, y: 0, zoom: 1 });
            simulation.current = createWikiGraphSimulation(data.nodes, data.edges, size.width, size.height);
            frames.current = 180;
            setGeneration((v) => v + 1);
          }}
        />
      </div>
      <p id={instructionId} className="sr-only">
        {t("workspace_tools.graph_gestures")}
      </p>
      <svg
        ref={svg}
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="group"
        tabIndex={0}
        aria-label={t(compact ? "workspace_tools.local_graph" : "workspace_tools.graph_view")}
        aria-describedby={instructionId}
        className="focus-visible:ring-accent-primary touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const delta = event.shiftKey ? 80 : 30;
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-", "0"].includes(event.key))
            event.preventDefault();
          if (event.key === "+" || event.key === "=") zoomBy(1.25);
          if (event.key === "-") zoomBy(0.8);
          if (event.key === "0") setCamera({ x: 0, y: 0, zoom: 1 });
          if (event.key.startsWith("Arrow"))
            setCamera((c) => ({
              ...c,
              x: c.x + (event.key === "ArrowLeft" ? delta : event.key === "ArrowRight" ? -delta : 0),
              y: c.y + (event.key === "ArrowUp" ? delta : event.key === "ArrowDown" ? -delta : 0),
            }));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const node = (event.target as Element).closest("[data-graph-node]");
          const point = node ? byId.get(node.getAttribute("data-graph-node") || "") : undefined;
          gesture.current = {
            id: point?.id,
            startX: event.clientX,
            startY: event.clientY,
            x: point?.x ?? camera.x,
            y: point?.y ?? camera.y,
            moved: false,
          };
          suppressClick.current = false;
          // Capture on the hit target so a click still reaches its native link.
          (event.target as Element).setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = gesture.current;
          if (!active) return;
          const dx = event.clientX - active.startX,
            dy = event.clientY - active.startY;
          if (Math.hypot(dx, dy) > 4) active.moved = true;
          if (!active.moved) return;
          if (active.id) {
            const p = byId.get(active.id);
            if (!p) return;
            const rect = event.currentTarget.getBoundingClientRect();
            active.x = (event.clientX - rect.left - size.width / 2 - camera.x) / camera.zoom + size.width / 2;
            active.y = (event.clientY - rect.top - size.height / 2 - camera.y) / camera.zoom + size.height / 2;
            frames.current = 90;
            setGeneration((v) => v + 1);
          } else setCamera((c) => ({ ...c, x: active.x + dx, y: active.y + dy }));
        }}
        onPointerUp={() => {
          suppressClick.current = gesture.current?.moved || false;
          gesture.current = null;
        }}
        onPointerCancel={() => {
          suppressClick.current = true;
          gesture.current = null;
        }}
      >
        <g
          transform={`translate(${size.width / 2 + camera.x},${size.height / 2 + camera.y}) scale(${camera.zoom}) translate(${-size.width / 2},${-size.height / 2})`}
        >
          {data.edges.map((edge) => {
            const a = byId.get(edge.source),
              b = byId.get(edge.target);
            if (!a || !b) return null;
            const active = edge.source === hovered || edge.target === hovered;
            return (
              <line
                key={`${edge.type}-${edge.source}-${edge.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                strokeWidth={active ? 1.8 : 0.8}
                vectorEffect="non-scaling-stroke"
                className={active ? "text-accent-primary" : "text-tertiary"}
                opacity={hovered ? (active ? 1 : 0.12) : 0.45}
                strokeDasharray={edge.type === "parent" ? "3 5" : undefined}
              />
            );
          })}
          {points.map((node) => {
            const active = hovered === node.id,
              connected = related.has(node.id),
              focus = data.focus_id === node.id;
            const radius = 3.5 + Math.min(5, Math.sqrt(node.degree) * 1.8) + (focus ? 1.5 : 0);
            const labelVisible = active || focus || (!hovered && camera.zoom > 0.7 && (compact || points.length < 50));
            return (
              <Link
                key={node.id}
                data-graph-node={node.id}
                href={`/${slug}/wiki/${node.collection_id}/pages/${node.id}/`}
                aria-label={t("workspace_tools.graph_open_page", { name: node.name })}
                className={cn(
                  "cursor-grab outline-none active:cursor-grabbing",
                  groups
                    ? colors[collections.indexOf(node.collection_id) % colors.length]
                    : focus || active || connected
                      ? "text-accent-primary"
                      : "text-secondary"
                )}
                onClick={(event) => {
                  if (suppressClick.current) {
                    event.preventDefault();
                    suppressClick.current = false;
                  }
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(node.id)}
                onBlur={() => setHovered(null)}
              >
                <title>
                  {node.name} · {node.collection_name}
                </title>
                <circle cx={node.x} cy={node.y} r={18} fill="transparent" />
                {active && (
                  <circle cx={node.x} cy={node.y} r={radius + 5} stroke="currentColor" strokeWidth={1} fill="none" />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill="currentColor"
                  opacity={hovered && !connected ? 0.22 : 1}
                />
                <text
                  x={node.x}
                  y={node.y + radius + 15}
                  textAnchor="middle"
                  fontSize={compact ? 10 : 12}
                  fill="currentColor"
                  className={active ? "text-primary" : "text-secondary"}
                  opacity={labelVisible ? 1 : connected && hovered ? 0.8 : 0}
                  pointerEvents="none"
                >
                  {active
                    ? node.name
                    : node.name.length > 30
                      ? node.name.slice(0, 29) + "…"
                      : node.name || t("workspace_tools.untitled")}
                </text>
              </Link>
            );
          })}
        </g>
      </svg>
      {!data.nodes.length && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-13 text-secondary">
          {t("workspace_tools.graph_empty")}
        </p>
      )}
    </div>
  );
}
