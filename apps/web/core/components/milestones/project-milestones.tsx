import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { MilestoneListItem } from "./milestone-list-item";
import { useState } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Input, TextArea, Checkbox, Header, Breadcrumbs } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { Flag, Plus, Pencil, Trash2, Unlink, AlertTriangle } from "lucide-react";
import { WorkspaceToolDialog } from "@/components/common/workspace-tool-dialog";
import { WorkspaceSelect } from "@/components/common/workspace-select";
import { PageHead } from "@/components/core/page-title";
import { milestoneService as service, milestoneKey, milestoneError } from "@/services/milestone.service";
import type { Milestone, MilestoneForm } from "@/services/milestone.service";

const emptyForm: MilestoneForm = { name: "", description: "", target_date: null };
export function ProjectMilestones() {
  const { workspaceSlug = "", projectId = "" } = useParams();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("milestone") || "all";
  const [search, setSearch] = useState("");
  const [titleSearch, setTitleSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<"create" | "edit" | "delete" | "link" | null>(null);
  const [active, setActive] = useState<Milestone | null>(null);
  const [form, setForm] = useState<MilestoneForm>(emptyForm);
  const [selected, setSelected] = useState<string[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkPage, setLinkPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = useSWR(milestoneKey(workspaceSlug, projectId), () => service.list(workspaceSlug, projectId), {
    refreshInterval: 5000,
  });
  const items = useSWR(
    ["milestone-work-items", workspaceSlug, projectId, filter, search, page],
    () => service.issues(workspaceSlug, projectId, { milestone: filter, search, page }),
    { refreshInterval: 5000 }
  );
  const candidates = useSWR(
    dialog === "link" ? ["milestone-candidates", workspaceSlug, projectId, linkSearch, linkPage] : null,
    () => service.issues(workspaceSlug, projectId, { milestone: "none", search: linkSearch, page: linkPage })
  );
  const rows = data.data?.results ?? [];
  const visibleRows = rows.filter((m) => m.name.toLowerCase().includes(titleSearch.toLowerCase()) || filter === m.id);
  const current = rows.find((m) => m.id === filter);
  const canWrite = data.data?.can_write ?? false;
  const open = (kind: typeof dialog, row?: Milestone) => {
    setError("");
    setActive(row ?? null);
    setForm(row ? { name: row.name, description: row.description, target_date: row.target_date } : emptyForm);
    setSelected([]);
    setLinkSearch("");
    setLinkPage(1);
    setDialog(kind);
  };
  const refresh = async () => {
    await Promise.all([data.mutate(), items.mutate(), candidates.mutate()]);
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setDialog(null);
      await refresh();
    } catch (e) {
      setError(milestoneError(e, t("workspace_tools.milestone_error")));
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string) => {
    setSearchParams(id === "all" ? {} : { milestone: id });
    setPage(1);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHead title={t("workspace_tools.milestones")} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug} projectId={projectId} />
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_tools.milestones")}
                      icon={<Flag className="size-4 text-tertiary" />}
                    />
                  }
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              {canWrite && (
                <Button
                  variant="primary"
                  size="lg"
                  prependIcon={<Plus className="size-4" />}
                  onClick={() => open("create")}
                >
                  <span className="hidden sm:inline">{t("workspace_tools.milestone_add")}</span>
                  <span className="sm:hidden">{t("add")}</span>
                </Button>
              )}
            </Header.RightItem>
          </Header>
        }
      />
      <main aria-label={t("workspace_tools.milestones")} className="min-h-0 flex-1 overflow-y-auto">
        {data.error && (
          <p role="alert" className="px-page-x py-3 text-13 text-danger-primary">
            {t("workspace_tools.milestone_load_error")}
          </p>
        )}
        {!data.data && !data.error && (
          <p className="text-13 text-secondary">{t("workspace_tools.milestone_loading")}</p>
        )}
        {data.data?.visibility_limited && (
          <p className="px-page-x py-3 text-13 text-secondary">{t("workspace_tools.milestone_limited")}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-page-x py-2.5">
          <span className="text-13 text-secondary">
            {t("workspace_tools.milestone_result_count", { count: visibleRows.length })}
          </span>
          <Input
            className="h-7 w-full py-1 text-13 sm:ml-auto sm:w-52"
            aria-label={t("workspace_tools.milestone_search_titles")}
            placeholder={t("workspace_tools.milestone_search_titles")}
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
          />
        </div>
        <p className="px-page-x py-3 text-12 text-secondary">{t("workspace_tools.milestone_intro")}</p>
        <div>
          {visibleRows.map((m) => (
            <MilestoneListItem
              key={m.id}
              milestone={m}
              href={`/${workspaceSlug}/projects/${projectId}/milestones/?milestone=${m.id}`}
              selected={filter === m.id}
              onClick={(e) => {
                e.preventDefault();
                choose(m.id);
              }}
              actions={
                canWrite ? (
                  <div className="flex gap-1">
                    <IconButton
                      variant="ghost"
                      size="base"
                      icon={Plus}
                      aria-label={`${t("workspace_tools.milestone_link")} ${m.name}`}
                      onClick={() => open("link", m)}
                    />
                    <IconButton
                      variant="ghost"
                      size="base"
                      icon={Pencil}
                      aria-label={`${t("workspace_tools.milestone_edit")} ${m.name}`}
                      onClick={() => open("edit", m)}
                    />
                    <IconButton
                      variant="ghost"
                      size="base"
                      icon={Trash2}
                      aria-label={`${t("workspace_tools.milestone_delete")} ${m.name}`}
                      onClick={() => open("delete", m)}
                    />
                  </div>
                ) : undefined
              }
            />
          ))}
          {data.data && !visibleRows.length && (
            <p className="p-8 text-center text-13 text-secondary">{t("workspace_tools.milestone_no_risks")}</p>
          )}
        </div>
        <section className="mt-6 border-t border-subtle">
          <div className="flex flex-wrap items-center justify-between gap-3 px-page-x pt-4">
            <h2 className="text-14 font-medium text-primary">
              {current?.name || t("workspace_tools.milestone_work_items")}
            </h2>
            {current && canWrite && (
              <Button variant="secondary" size="lg" onClick={() => open("link", current)}>
                {t("workspace_tools.milestone_link")}
              </Button>
            )}
          </div>
          {current?.description && (
            <p className="mt-2 px-page-x text-13 whitespace-pre-wrap text-secondary">{current.description}</p>
          )}
          {current && (
            <p className="mt-2 px-page-x text-12 text-tertiary">
              {t("workspace_tools.milestone_target")}: {current.target_date || "—"} · {data.data?.timezone}
            </p>
          )}
          <div className="my-3 flex flex-wrap items-center gap-2 border-b border-subtle px-page-x pb-3">
            <WorkspaceSelect
              variant="filter"
              label={t("workspace_tools.milestone_filter")}
              value={filter}
              onChange={choose}
              options={[
                { value: "all", label: t("workspace_tools.milestone_all") },
                { value: "none", label: t("workspace_tools.milestone_none") },
                ...rows.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
            <Input
              aria-label={t("workspace_tools.milestone_search")}
              placeholder={t("workspace_tools.milestone_search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-7 w-full py-1 text-13 sm:ml-auto sm:w-52"
            />
          </div>
          {error && !dialog && (
            <p role="alert" className="mb-3 text-13 text-danger-primary">
              {error}
            </p>
          )}
          {items.error && (
            <p role="alert" className="text-13 text-danger-primary">
              {t("workspace_tools.milestone_load_error")}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-13">
              <thead className="border-b border-subtle text-secondary">
                <tr>
                  {[
                    t("workspace_tools.milestone_work_items"),
                    t("workspace_tools.milestone_state"),
                    t("workspace_tools.milestone_due"),
                    t("workspace_tools.milestone"),
                    t("workspace_tools.milestone_actions"),
                  ].map((h, index) => (
                    <th
                      key={h}
                      className={`px-page-x py-2.5 font-medium ${index === 0 ? "w-auto" : index === 4 ? "w-12" : "hidden w-36 xl:table-cell"}`}
                    >
                      <span className={index === 4 ? "sr-only" : undefined}>{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.data?.results.map((i) => (
                  <tr key={i.id} className="border-b border-subtle hover:bg-layer-1">
                    <td className="px-page-x py-3">
                      <Link
                        className="block truncate text-primary hover:text-accent-primary"
                        to={`/${workspaceSlug}/projects/${projectId}/issues/${i.id}/`}
                        title={`${i.code} · ${i.name}`}
                      >
                        {i.code} · {i.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-11 text-secondary xl:hidden">
                        <span>{i.state}</span>
                        <span>{i.target_date || "—"}</span>
                        <span>{i.milestone_name || t("workspace_tools.milestone_none")}</span>
                        {i.late && <span className="text-danger-primary">{t("workspace_tools.milestone_late")}</span>}
                      </div>
                    </td>
                    <td className="hidden px-page-x py-3 text-secondary xl:table-cell">{i.state}</td>
                    <td className="hidden px-page-x py-3 text-secondary xl:table-cell">
                      {i.target_date || "—"}
                      {i.late && (
                        <span className="ml-2 inline-flex items-center gap-1 text-danger-primary">
                          <AlertTriangle className="size-3" />
                          {t("workspace_tools.milestone_late")}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-page-x py-3 text-secondary xl:table-cell">
                      {i.milestone_name || t("workspace_tools.milestone_none")}
                    </td>
                    <td className="px-3 py-3">
                      {canWrite && i.milestone_id && (
                        <IconButton
                          variant="ghost"
                          size="base"
                          disabled={busy}
                          icon={Unlink}
                          aria-label={`${t("workspace_tools.milestone_unlink")} ${i.code}`}
                          onClick={() => run(() => service.assign(workspaceSlug, projectId, i.id, null))}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.data && !items.data.total && (
            <p className="py-8 text-center text-13 text-secondary">{t("workspace_tools.milestone_no_work_items")}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-subtle px-page-x py-3 text-12 text-secondary">
            <span>
              {items.data?.total ?? 0} {t("workspace_tools.milestone_work_items")} · {page}
            </span>
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t("workspace_tools.milestone_previous")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!items.data?.next_page}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("workspace_tools.milestone_next")}
            </Button>
          </div>
        </section>
      </main>
      {(dialog === "create" || dialog === "edit") && (
        <WorkspaceToolDialog
          title={dialog === "create" ? t("workspace_tools.milestone_add") : t("workspace_tools.milestone_edit")}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => service.save(workspaceSlug, projectId, form, active?.id));
          }}
          submitLabel={t("workspace_tools.milestone_save")}
          busy={busy}
          disabled={!form.name.trim()}
          error={error}
        >
          <label className="block space-y-2 text-12 text-secondary">
            {t("workspace_tools.milestone_title")}
            <Input
              required
              maxLength={255}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full"
            />
          </label>
          <label className="block space-y-2 text-12 text-secondary">
            {t("workspace_tools.milestone_description")}
            <TextArea
              value={form.description}
              maxLength={20000}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-24 w-full resize-none text-14"
            />
          </label>
          <label className="block space-y-2 text-12 text-secondary">
            {t("workspace_tools.milestone_target")}
            <Input
              type="date"
              value={form.target_date ?? ""}
              onChange={(e) => setForm({ ...form, target_date: e.target.value || null })}
              className="w-full"
            />
          </label>
        </WorkspaceToolDialog>
      )}
      {dialog === "delete" && active && (
        <WorkspaceToolDialog
          title={t("workspace_tools.milestone_delete")}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await service.remove(workspaceSlug, projectId, active.id);
              if (filter === active.id) choose("all");
            });
          }}
          submitLabel={t("workspace_tools.milestone_delete")}
          busy={busy}
          error={error}
        >
          <p className="text-13 text-primary">{active.name}</p>
          <p className="text-13 text-secondary">{t("workspace_tools.milestone_delete_help")}</p>
        </WorkspaceToolDialog>
      )}
      {dialog === "link" && active && (
        <WorkspaceToolDialog
          title={`${t("workspace_tools.milestone_link")} · ${active.name}`}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => service.link(workspaceSlug, projectId, active.id, selected));
          }}
          submitLabel={`${t("workspace_tools.milestone_link")} (${selected.length})`}
          busy={busy}
          disabled={!selected.length}
          error={error}
        >
          <Input
            aria-label={t("workspace_tools.milestone_search")}
            placeholder={t("workspace_tools.milestone_search")}
            value={linkSearch}
            onChange={(e) => {
              setLinkSearch(e.target.value);
              setLinkPage(1);
            }}
            className="w-full"
          />
          {candidates.error && (
            <p role="alert" className="text-13 text-danger-primary">
              {t("workspace_tools.milestone_load_error")}
            </p>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {candidates.data?.results.map((i) => (
              <label
                key={i.id}
                className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-13 text-primary hover:bg-layer-1"
              >
                <Checkbox
                  checked={selected.includes(i.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((id) => id !== i.id)))
                  }
                />
                <span>
                  {i.code} · {i.name}
                </span>
              </label>
            ))}
          </div>
          {candidates.data?.total === 0 && (
            <p className="text-13 text-secondary">{t("workspace_tools.milestone_no_candidates")}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={linkPage === 1} onClick={() => setLinkPage((p) => p - 1)}>
              {t("workspace_tools.milestone_previous")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!candidates.data?.next_page}
              onClick={() => setLinkPage((p) => p + 1)}
            >
              {t("workspace_tools.milestone_next")}
            </Button>
          </div>
        </WorkspaceToolDialog>
      )}
    </div>
  );
}
