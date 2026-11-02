import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Activity, Settings2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { Checkbox, CustomSelect, Input } from "@plane/ui";
import { cn } from "@plane/utils";
import { WikiService } from "@/services/wiki.service";
import { WIKI_GRAPH_REFRESH_MS } from "@/helpers/wiki-graph";
import type { WikiGraphNode } from "@/helpers/wiki-graph";
import { WikiGraphCanvas } from "./wiki-graph-canvas";

const service = new WikiService();

export function WikiGraph({
  focusId,
  collectionId,
  compact = false,
}: {
  focusId?: string;
  collectionId?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";
  const [depth, setDepth] = useState(1),
    [hierarchy, setHierarchy] = useState(false);
  const [query, setQuery] = useState(""),
    [settings, setSettings] = useState(false);
  const [orphans, setOrphans] = useState(true),
    [groups, setGroups] = useState(false);
  const [repel, setRepel] = useState(1),
    [distance, setDistance] = useState(compact ? 70 : 110);
  const forces = useMemo(() => ({ repel, distance }), [repel, distance]);
  const graph = useSWR(
    ["wiki-graph", slug, focusId, collectionId, depth, hierarchy],
    () => service.graph(slug, { page_id: focusId, collection_id: collectionId, depth, include_hierarchy: hierarchy }),
    {
      refreshInterval: WIKI_GRAPH_REFRESH_MS,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      dedupingInterval: 1000,
      shouldRetryOnError: (error) => ![403, 404].includes(error?.status || error?.response?.status),
    }
  );
  const data = graph.data;
  const filtered = useMemo(() => {
    if (!data) return undefined;
    const linked = new Set(data.edges.flatMap((e) => [e.source, e.target]));
    const matches = new Set(
      data.nodes
        .filter(
          (n) =>
            (orphans || linked.has(n.id) || n.id === focusId) &&
            n.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        )
        .map((n) => n.id)
    );
    return {
      ...data,
      nodes: data.nodes.filter((n) => matches.has(n.id)),
      edges: data.edges.filter((e) => matches.has(e.source) && matches.has(e.target)),
    };
  }, [data, query, orphans, focusId]);
  const renderLinks = (nodes: WikiGraphNode[]) =>
    nodes.length ? (
      <ul className="space-y-1">
        {nodes.map((node) => (
          <li key={node.id}>
            <Link
              className="block rounded px-1 py-2 text-13 text-link-primary hover:bg-layer-transparent-hover hover:underline"
              href={`/${slug}/wiki/${node.collection_id}/pages/${node.id}/`}
            >
              {node.name || t("workspace_tools.untitled")}
              <span className="ml-2 text-11 text-tertiary">{node.collection_name}</span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-12 text-tertiary">{t("workspace_tools.no_linked_pages")}</p>
    );
  return (
    <section
      className={cn("relative min-w-0", compact ? "space-y-3" : "flex min-h-0 flex-1 flex-col")}
      aria-label={t(compact ? "workspace_tools.connections" : "workspace_tools.graph_view")}
    >
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-2",
          !compact && "border-b border-subtle px-4 py-3"
        )}
      >
        {compact ? (
          <h2 className="text-14 font-medium text-primary">{t("workspace_tools.local_graph")}</h2>
        ) : (
          <Input
            aria-label={t("workspace_tools.graph_search")}
            placeholder={t("workspace_tools.graph_search")}
            className="w-full max-w-xs text-primary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-11 text-secondary" title={t("workspace_tools.graph_auto_hint")}>
            <Activity className="size-3" />
            {t("workspace_tools.graph_auto")}
          </span>
          <IconButton
            icon={settings ? X : Settings2}
            variant="ghost"
            size="base"
            aria-label={t("workspace_tools.graph_settings")}
            aria-expanded={settings}
            onClick={() => setSettings((v) => !v)}
          />
        </div>
      </div>
      {settings && (
        <div
          className={cn(
            "z-20 space-y-4 rounded-md border border-subtle bg-layer-2 p-4 text-12 text-secondary",
            !compact && "absolute top-16 right-4 max-h-[70%] w-64 overflow-y-auto"
          )}
        >
          <label className="flex items-center gap-2">
            <Checkbox checked={hierarchy} onChange={(e) => setHierarchy(e.target.checked)} />
            {t("workspace_tools.graph_hierarchy")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={orphans} onChange={(e) => setOrphans(e.target.checked)} />
            {t("workspace_tools.graph_orphans")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={groups} onChange={(e) => setGroups(e.target.checked)} />
            {t("workspace_tools.graph_groups")}
          </label>
          <label className="block space-y-2">
            <span>{t("workspace_tools.graph_repel")}</span>
            <input
              aria-label={t("workspace_tools.graph_repel")}
              type="range"
              min="0.3"
              max="2"
              step="0.1"
              value={repel}
              onChange={(e) => setRepel(Number(e.target.value))}
              className="accent-accent-primary block w-full"
            />
          </label>
          <label className="block space-y-2">
            <span>{t("workspace_tools.graph_distance")}</span>
            <input
              aria-label={t("workspace_tools.graph_distance")}
              type="range"
              min="40"
              max="180"
              step="5"
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              className="accent-accent-primary block w-full"
            />
          </label>
          <p className="text-11 leading-relaxed">{t("workspace_tools.graph_gestures")}</p>
        </div>
      )}
      {focusId && (
        <label className="flex items-center gap-2 text-12 text-secondary">
          {t("workspace_tools.graph_depth")}
          <CustomSelect
            value={depth}
            onChange={(value: number) => setDepth(value)}
            label={
              <>
                <span className="sr-only">{t("workspace_tools.graph_depth")}: </span>
                {depth}
              </>
            }
            buttonClassName="text-primary"
          >
            <CustomSelect.Option value={1}>1</CustomSelect.Option>
            <CustomSelect.Option value={2}>2</CustomSelect.Option>
          </CustomSelect>
        </label>
      )}
      {graph.error ? (
        <div role="alert" className="p-4 text-13 text-danger-primary">
          {t("workspace_tools.graph_error")}{" "}
          <Button variant="secondary" size="lg" onClick={() => void graph.mutate()}>
            {t("workspace_tools.retry")}
          </Button>
        </div>
      ) : !filtered ? (
        <p role="status" className="p-6 text-13 text-secondary">
          {t("workspace_tools.loading")}
        </p>
      ) : (
        <>
          <WikiGraphCanvas data={filtered} slug={slug} compact={compact} forces={forces} groups={groups} />
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center gap-3 text-11 text-secondary",
              !compact && "border-t border-subtle px-4 py-2"
            )}
          >
            <span>{t("workspace_tools.graph_count", { count: filtered.nodes.length })}</span>
            <span>
              {t("workspace_tools.graph_link_count", { count: filtered.edges.filter((e) => e.type === "link").length })}
            </span>
            {hierarchy && <span>{t("workspace_tools.graph_parent_edges")}</span>}
          </div>
          {data?.truncated && (
            <p className="px-4 text-12 text-warning-primary">
              {t("workspace_tools.graph_limited", { count: data.nodes.length, total: data.total_nodes })}
            </p>
          )}
          {compact && data && (
            <>
              <h3 className="pt-3 text-13 font-medium text-primary">
                {t("workspace_tools.backlinks")} ({data.incoming.length})
              </h3>
              {renderLinks(data.incoming)}
              <h3 className="pt-3 text-13 font-medium text-primary">
                {t("workspace_tools.outgoing_links")} ({data.outgoing.length})
              </h3>
              {renderLinks(data.outgoing)}
            </>
          )}
        </>
      )}
    </section>
  );
}
