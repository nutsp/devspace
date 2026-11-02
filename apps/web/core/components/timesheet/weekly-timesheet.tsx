import { WorkspaceSelect } from "@/components/common/workspace-select";
import { Checkbox, Input, TextArea } from "@plane/ui";
import { IconButton } from "@plane/propel/icon-button";
import { Button, getButtonStyling } from "@plane/propel/button";
import { Badge } from "@plane/propel/badge";
import { useTranslation } from "@plane/i18n";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Download,
  Plus,
  Send,
  Check,
  RotateCcw,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { TimesheetService } from "@/services/timesheet.service";
import type { TimeEntry } from "@/services/timesheet.service";
import { timesheetProjectLeads } from "@/helpers/timesheet-project-leads";
import { mondayOf, offsetDate, formatDuration } from "@/helpers/timesheet";
import { PageHead } from "@/components/core/page-title";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";

import { WorkspaceToolDialog } from "@/components/common/workspace-tool-dialog";

const service = new TimesheetService();
const inputStyle = "w-full text-primary disabled:cursor-not-allowed disabled:text-disabled";
function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") return Object.values(data).flat().map(String).join(" · ");
  return fallback;
}
type Form = {
  date: string;
  project: string;
  issue: string;
  activity: string;
  hours: string;
  minutes: string;
  note: string;
};
const initialForm = (date: string): Form => ({
  date,
  project: "",
  issue: "",
  activity: "Development",
  hours: "1",
  minutes: "0",
  note: "",
});

export function WeeklyTimesheetPage() {
  const { t, currentLocale } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const [week, setWeek] = useState(() =>
    mondayOf(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    )
  );
  const [view, setView] = useState<"mine" | "review">("mine");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<Form>(() => initialForm(week));
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTaskLabel, setSelectedTaskLabel] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const options = useSWR(`timesheet-options-${slug}`, () => service.options(slug));
  const tasks = useSWR(form.project ? `timesheet-tasks-${slug}-${form.project}-${taskSearch}` : null, () =>
    service.options(slug, form.project, taskSearch)
  );
  const mine = useSWR(view === "mine" ? `timesheet-my-${slug}-${week}` : null, () => service.my(slug, week));
  const inbox = useSWR(view === "review" && options.data?.is_reviewer ? `timesheet-inbox-${slug}` : null, () =>
    service.inbox(slug)
  );
  const detail = useSWR(view === "review" && selected ? `timesheet-detail-${slug}-${selected}` : null, () =>
    service.detail(slug, selected!)
  );
  const sheet = view === "mine" ? mine.data : detail.data;
  const editable =
    view === "mine" && options.data?.can_write && !!sheet && ["draft", "returned"].includes(sheet.status);
  useEffect(() => {
    setForm(initialForm(week));
    setEntryOpen(false);
    setReviewOpen(false);
    setEditing(null);
    setError("");
    setNotice("");
  }, [week]);
  async function refresh() {
    await Promise.all([mine.mutate(), inbox.mutate(), detail.mutate()]);
  }
  async function mutate(action: string, body: Record<string, unknown>, entryId?: string) {
    if (!sheet || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let current = sheet;
      if (!current.id) current = await service.create(slug, week);
      await service.action(slug, current.id!, action, { ...body, version: current.version }, entryId);
      await refresh();
      setNotice(
        action === "withdraw"
          ? t("workspace_tools.withdraw_success")
          : action === "submit"
            ? t("workspace_tools.submit_success")
            : action === "approve"
              ? t("workspace_tools.approve_success")
              : action === "return"
                ? t("workspace_tools.return_success")
                : t("workspace_tools.save_success")
      );
      if (["entries", "update-entry"].includes(action)) {
        setEntryOpen(false);
        setForm(initialForm(week));
        setEditing(null);
        setTaskSearch("");
      }
      if (action === "submit") setReviewOpen(false);
      setReason("");
    } catch (err) {
      setError(errorMessage(err, t("workspace_tools.action_error")));
      await Promise.all([refresh(), options.mutate()]);
    } finally {
      setBusy(false);
    }
  }
  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    await mutate(
      editing ? "update-entry" : "entries",
      {
        work_date: form.date,
        project_id: form.project,
        issue_id: form.issue || null,
        activity: form.activity,
        duration_minutes: Number(form.hours) * 60 + Number(form.minutes),
        note: form.note,
      },
      editing || undefined
    );
  }
  function editEntry(entry: TimeEntry) {
    setEntryOpen(true);
    setEditing(entry.id);
    setSelectedTaskLabel(entry.issue_name || "");
    setTaskSearch("");
    setError("");
    setForm({
      date: entry.work_date,
      project: entry.project_id || "",
      issue: entry.issue_id || "",
      activity: entry.activity,
      hours: String(Math.floor(entry.duration_minutes / 60)),
      minutes: String(entry.duration_minutes % 60),
      note: entry.note,
    });
  }
  function field(key: keyof Form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value, ...(key === "project" ? { issue: "" } : {}) }));
  }
  function switchView(next: "mine" | "review") {
    setEntryOpen(false);
    setReviewOpen(false);
    setView(next);
    setSelected(null);
    setError("");
    setNotice("");
    setEditing(null);
  }
  const pending = (inbox.data ?? []).filter((s) => s.review_status === "submitted").length;
  const assignments = timesheetProjectLeads(sheet?.entries ?? [], options.data?.projects ?? []);
  const reviewStatus = view === "review" ? sheet?.review_status : sheet?.status;
  return (
    <>
      <PageHead title={t("workspace_tools.weekly_timesheet")} />
      <ProjectsAppPowerKProvider />
      <main className="flex size-full min-w-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-subtle px-5 text-14 text-primary">
          <Clock3 className="size-4" />
          {t("workspace_tools.timesheet")}
        </header>
        <div
          className="flex shrink-0 gap-5 border-b border-subtle px-5"
          role="tablist"
          aria-label={t("workspace_tools.timesheet_views")}
        >
          <button
            role="tab"
            aria-selected={view === "mine"}
            className={cn(
              "border-b-2 py-3 text-13",
              view === "mine" ? "border-accent-strong text-primary" : "border-transparent text-tertiary"
            )}
            onClick={() => switchView("mine")}
          >
            {t("workspace_tools.my_timesheet")}
          </button>
          {options.data?.is_reviewer && (
            <button
              role="tab"
              aria-selected={view === "review"}
              className={cn(
                "border-b-2 py-3 text-13",
                view === "review" ? "border-accent-strong text-primary" : "border-transparent text-tertiary"
              )}
              onClick={() => switchView("review")}
            >
              {t("workspace_tools.review_timesheets")}
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-5 md:p-8">
          {error && !entryOpen && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-danger-strong bg-danger-subtle p-3 text-13 text-danger-primary"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-4 text-13 text-success-primary">
              {notice}
            </p>
          )}
          {options.error || mine.error || inbox.error || detail.error ? (
            <p role="alert" className="py-5 text-14 text-danger-primary">
              {t("workspace_tools.load_error")}{" "}
              <Button variant="secondary" size="lg" onClick={() => void refresh()}>
                {t("workspace_tools.retry")}
              </Button>
            </p>
          ) : null}
          {view === "mine" && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-24 font-semibold text-primary">{t("workspace_tools.weekly_timesheet")}</h1>
                <p className="mt-2 text-13 text-secondary">
                  {t("workspace_tools.week_description", { timezone: sheet?.timezone || "Asia/Bangkok" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <IconButton
                  variant="ghost"
                  size="lg"
                  icon={ArrowLeft}
                  aria-label={t("workspace_tools.previous_week")}
                  onClick={() => setWeek(offsetDate(week, -7))}
                />
                <div role="group" aria-label={t("workspace_tools.week_start")} className="min-w-40">
                  <DateDropdown
                    value={week}
                    onChange={(date) => {
                      const value = date ? renderFormattedPayloadDate(date) : undefined;
                      if (value) setWeek(mondayOf(value));
                    }}
                    buttonVariant="border-with-text"
                    isClearable={false}
                    disabled={busy}
                    placeholder={t("workspace_tools.week_start")}
                    icon={
                      <>
                        <CalendarDays className="size-3.5 shrink-0" />
                        <span className="sr-only">{t("workspace_tools.week_start")}: </span>
                      </>
                    }
                    className="h-auto w-full"
                    buttonContainerClassName="w-full"
                    buttonClassName="w-full rounded-md border-subtle-1 bg-layer-2 px-3 py-2 text-13 text-primary"
                    labelClassName="text-13"
                    optionsClassName="z-[100] max-w-[calc(100vw-2rem)]"
                  />
                </div>
                <IconButton
                  variant="ghost"
                  size="lg"
                  icon={ArrowRight}
                  aria-label={t("workspace_tools.next_week")}
                  onClick={() => setWeek(offsetDate(week, 7))}
                />
              </div>
            </div>
          )}
          {view === "review" && !selected ? (
            <>
              <h1 className="text-24 font-semibold text-primary">{t("workspace_tools.review_timesheets")}</h1>
              <p className="mt-2 text-14 text-secondary">
                {t("workspace_tools.pending_description", { count: pending })}
              </p>
              <label className="mt-5 flex items-center gap-2 text-13 text-secondary">
                <Checkbox checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                {t("workspace_tools.show_history")}
              </label>
              {inbox.isLoading ? (
                <p role="status" className="py-8 text-secondary">
                  {t("workspace_tools.loading")}
                </p>
              ) : (
                <div className="mt-4 divide-y divide-subtle border-y border-subtle">
                  {(inbox.data ?? [])
                    .filter((s) => showAll || s.review_status === "submitted")
                    .map((s) => (
                      <button
                        key={s.id}
                        className="flex w-full flex-wrap items-center justify-between gap-3 px-2 py-4 text-left text-14 hover:bg-layer-transparent-hover"
                        onClick={() => {
                          setSelected(s.id);
                          setError("");
                          setNotice("");
                        }}
                      >
                        <span className="font-medium text-primary">{s.user_name}</span>
                        <span className="text-secondary">
                          {s.week_start} – {offsetDate(s.week_start, 6)}
                        </span>
                        <span className="text-secondary">
                          {t("workspace_tools.duration", { duration: formatDuration(s.total_minutes) })}
                        </span>
                        <Badge
                          variant={
                            s.review_status === "approved"
                              ? "success"
                              : s.review_status === "submitted"
                                ? "brand"
                                : s.review_status === "returned"
                                  ? "warning"
                                  : "neutral"
                          }
                        >
                          {t(`workspace_tools.${s.review_status}`)}
                        </Badge>
                      </button>
                    ))}
                  {!(inbox.data ?? []).some((s) => showAll || s.review_status === "submitted") && (
                    <p className="py-10 text-14 text-secondary">{t("workspace_tools.no_pending")}</p>
                  )}
                </div>
              )}
            </>
          ) : !sheet ? (
            <p role="status" className="py-10 text-14 text-secondary">
              {t("workspace_tools.loading_timesheet")}
            </p>
          ) : (
            <>
              {view === "review" && (
                <div className="mb-6">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setSelected(null)}
                    prependIcon={<ArrowLeft className="size-4" />}
                  >
                    {t("workspace_tools.back_to_list")}
                  </Button>
                  <h1 className="mt-5 text-24 font-semibold text-primary">{sheet.user_name}</h1>
                  <p className="mt-2 text-13 text-secondary">
                    {sheet.week_start} – {offsetDate(sheet.week_start, 6)} · {sheet.timezone}
                  </p>
                </div>
              )}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      reviewStatus === "approved"
                        ? "success"
                        : reviewStatus === "submitted"
                          ? "brand"
                          : reviewStatus === "returned"
                            ? "warning"
                            : "neutral"
                    }
                    size="lg"
                  >
                    {t(`workspace_tools.${reviewStatus}`)}
                  </Badge>
                  <span className="text-13 text-secondary">
                    {t("workspace_tools.total_duration", { duration: formatDuration(sheet.total_minutes) })}
                  </span>
                  <span className="text-12 text-tertiary">v{sheet.version}</span>
                </div>
                {sheet.id && (
                  <a className={getButtonStyling("secondary", "lg")} href={service.exportUrl(slug, sheet.id)}>
                    <Download className="size-4" />
                    {t("workspace_tools.export_excel")}
                  </a>
                )}
              </div>
              <div className="mb-6 overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-center text-12">
                  <caption className="sr-only">{t("workspace_tools.daily_totals")}</caption>
                  <thead>
                    <tr>
                      {Array.from({ length: 7 }, (_, i) => (
                        <th className="border border-subtle p-2 font-medium text-secondary" key={i}>
                          {new Date(`${offsetDate(sheet.week_start, i)}T12:00:00Z`).toLocaleDateString(currentLocale, {
                            weekday: "short",
                            day: "numeric",
                          })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {Array.from({ length: 7 }, (_, i) => {
                        const minutes = sheet.entries
                          .filter((e) => e.work_date === offsetDate(sheet.week_start, i))
                          .reduce((sum, e) => sum + e.duration_minutes, 0);
                        return (
                          <td key={i} className="border border-subtle p-3 text-14 text-primary tabular-nums">
                            {formatDuration(minutes)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="mb-5 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => {
                      setForm(initialForm(week));
                      setEditing(null);
                      setSelectedTaskLabel("");
                      setTaskSearch("");
                      setError("");
                      setEntryOpen(true);
                    }}
                    prependIcon={<Plus className="size-4" />}
                  >
                    {t("workspace_tools.add_entry")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    prependIcon={<Send className="size-4" />}
                    disabled={busy || !sheet.entries.length}
                    onClick={() => {
                      setError("");
                      void options.mutate();
                      setReviewOpen(true);
                    }}
                  >
                    {t("workspace_tools.submit")}
                  </Button>
                </div>
              )}
              {editable && entryOpen && (
                <WorkspaceToolDialog
                  title={t(editing ? "workspace_tools.edit_entry" : "workspace_tools.add_entry")}
                  onClose={() => {
                    setEntryOpen(false);
                    setEditing(null);
                    setError("");
                    setForm(initialForm(week));
                  }}
                  onSubmit={saveEntry}
                  submitLabel={t(editing ? "workspace_tools.save_changes" : "workspace_tools.add_time")}
                  busy={busy}
                  disabled={!form.project || Number(form.hours) * 60 + Number(form.minutes) <= 0}
                  error={error}
                >
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-2 text-12 text-secondary">
                      {t("workspace_tools.date")}
                      <DateDropdown
                        value={form.date}
                        onChange={(date) => {
                          const value = date ? renderFormattedPayloadDate(date) : undefined;
                          if (value) field("date", value);
                        }}
                        minDate={getDate(sheet.week_start)}
                        maxDate={getDate(offsetDate(sheet.week_start, 6))}
                        buttonVariant="border-with-text"
                        isClearable={false}
                        disabled={busy}
                        placeholder={t("workspace_tools.work_date")}
                        icon={
                          <>
                            <CalendarDays className="size-3.5 shrink-0" />
                            <span className="sr-only">{t("workspace_tools.work_date")}: </span>
                          </>
                        }
                        className="h-auto w-full"
                        buttonContainerClassName="w-full"
                        buttonClassName="w-full rounded-md border-subtle-1 bg-layer-2 px-3 py-2 text-13 text-primary"
                        labelClassName="text-13"
                        optionsClassName="z-[100] max-w-[calc(100vw-2rem)]"
                      />
                    </label>
                    <label className="space-y-2 text-12 text-secondary">
                      {t("workspace_tools.project")}
                      <WorkspaceSelect
                        label={t("workspace_tools.project")}
                        value={form.project}
                        disabled={busy}
                        onChange={(value) => {
                          field("project", value);
                          setSelectedTaskLabel("");
                          setTaskSearch("");
                        }}
                        options={[
                          { value: "", label: t("workspace_tools.select_project") },
                          ...(options.data?.projects ?? []).map((p) => ({
                            value: p.id,
                            label: `${p.identifier} · ${p.name}`,
                          })),
                        ]}
                      />
                    </label>
                    <label className="space-y-2 text-12 text-secondary">
                      {t("workspace_tools.activity")}
                      <WorkspaceSelect
                        label={t("workspace_tools.activity")}
                        value={form.activity}
                        disabled={busy}
                        onChange={(value) => field("activity", value)}
                        options={(options.data?.activities || ["Development"]).map((a) => ({
                          value: a,
                          label: t(`workspace_tools.activity_${a}`),
                        }))}
                      />
                    </label>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-12 text-secondary">{t("workspace_tools.task_optional")}</label>
                      <WorkspaceSelect
                        label={t("workspace_tools.task")}
                        value={form.issue}
                        disabled={busy || !form.project}
                        onChange={(value) => {
                          const item = tasks.data?.issues.find((i) => i.id === value);
                          setSelectedTaskLabel(item ? `${item.code} · ${item.name}` : "");
                          field("issue", value);
                        }}
                        onSearch={setTaskSearch}
                        options={[
                          { value: "", label: t("workspace_tools.no_task") },
                          ...(form.issue && !tasks.data?.issues.some((i) => i.id === form.issue)
                            ? [
                                {
                                  value: form.issue,
                                  label:
                                    selectedTaskLabel ||
                                    sheet.entries.find((e) => e.id === editing)?.issue_name ||
                                    t("workspace_tools.task"),
                                },
                              ]
                            : []),
                          ...(tasks.data?.issues ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` })),
                        ]}
                      />
                      <p className="text-11 text-tertiary">{t("workspace_tools.task_limit")}</p>
                      {tasks.error && (
                        <p role="alert" className="text-12 text-danger-primary">
                          {t("workspace_tools.task_error")}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 text-12 text-secondary">
                        {t("workspace_tools.hours")}
                        <Input
                          aria-label={t("workspace_tools.hours")}
                          type="number"
                          min="0"
                          max="24"
                          step="1"
                          required
                          value={form.hours}
                          onChange={(e) => field("hours", e.target.value)}
                          className={inputStyle}
                        />
                      </label>
                      <label className="space-y-2 text-12 text-secondary">
                        {t("workspace_tools.minutes")}
                        <Input
                          aria-label={t("workspace_tools.minutes")}
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          required
                          value={form.minutes}
                          onChange={(e) => field("minutes", e.target.value)}
                          className={inputStyle}
                        />
                      </label>
                    </div>
                    <label className="space-y-2 text-12 text-secondary md:col-span-2 lg:col-span-3">
                      {t("workspace_tools.note")}
                      <Input
                        aria-label={t("workspace_tools.note")}
                        maxLength={2000}
                        value={form.note}
                        onChange={(e) => field("note", e.target.value)}
                        className={inputStyle}
                      />
                    </label>
                  </div>
                </WorkspaceToolDialog>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-13">
                  <thead className="border-b border-subtle text-12 text-tertiary">
                    <tr>
                      {[
                        t("workspace_tools.date"),
                        t("workspace_tools.project_task"),
                        t("workspace_tools.activity"),
                        t("workspace_tools.time"),
                        t("workspace_tools.note"),
                        "",
                      ].map((h) => (
                        <th key={h} className="px-3 py-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-subtle text-secondary">
                        <td className="px-3 py-4 whitespace-nowrap">{entry.work_date}</td>
                        <td className="px-3 py-4">
                          <div className="font-medium text-primary">{entry.project_name}</div>
                          <div className="mt-1 text-12">
                            {entry.issue_code} {entry.issue_name || t("workspace_tools.general_activity")}
                          </div>
                        </td>
                        <td className="px-3 py-4">{t(`workspace_tools.activity_${entry.activity}`)}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-primary tabular-nums">
                          {formatDuration(entry.duration_minutes)}
                        </td>
                        <td className="max-w-xs px-3 py-4 break-words whitespace-pre-wrap">{entry.note}</td>
                        <td className="px-3 py-4">
                          {editable && (
                            <div className="flex gap-1">
                              <IconButton
                                variant="ghost"
                                size="base"
                                icon={Pencil}
                                aria-label={t("workspace_tools.edit_entry_label", {
                                  project: entry.project_code,
                                  date: entry.work_date,
                                })}
                                disabled={busy}
                                onClick={() => editEntry(entry)}
                              />
                              <IconButton
                                variant="ghost"
                                size="base"
                                icon={Trash2}
                                className="hover:text-danger-primary"
                                aria-label={t("workspace_tools.delete_entry_label", {
                                  project: entry.project_code,
                                  date: entry.work_date,
                                })}
                                disabled={busy}
                                onClick={() => void mutate("delete-entry", {}, entry.id)}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sheet.entries.length && (
                  <p className="py-10 text-center text-14 text-secondary">{t("workspace_tools.no_entries")}</p>
                )}
              </div>
              {editable && reviewOpen && (
                <WorkspaceToolDialog
                  title={t("workspace_tools.submit")}
                  onClose={() => {
                    setReviewOpen(false);
                    setError("");
                  }}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (assignments.some((p) => !p.eligible)) return;
                    await mutate("submit", {});
                  }}
                  submitLabel={t("workspace_tools.submit")}
                  busy={busy}
                  disabled={!sheet.entries.length || assignments.some((p) => !p.eligible)}
                  error={error}
                >
                  <p className="text-13 text-secondary">
                    {t("workspace_tools.review_submit_description", { duration: formatDuration(sheet.total_minutes) })}
                  </p>
                  <p className="text-13 text-secondary">{t("workspace_tools.project_lead_routing")}</p>
                  <ul className="divide-y divide-subtle border-y border-subtle">
                    {assignments.map((project) => (
                      <li
                        key={project.id || project.name}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 text-13"
                      >
                        <span className="text-primary">{project.name}</span>
                        <div className="text-right">
                          {project.lead && <p className="text-secondary">{project.lead}</p>}
                          {!project.eligible && (
                            <p className="text-danger-primary">{t("workspace_tools.project_lead_required")}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </WorkspaceToolDialog>
              )}
              {view === "mine" && sheet.status === "submitted" && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-5"
                  disabled={busy}
                  onClick={() => void mutate("withdraw", {})}
                >
                  {t("workspace_tools.withdraw_submission")}
                </Button>
              )}
              {!!sheet.project_reviews?.length && (
                <section className="mt-6 space-y-3">
                  <h2 className="text-16 font-medium text-primary">{t("workspace_tools.project_approvals")}</h2>
                  <p className="text-13 text-secondary">{t("workspace_tools.project_approval_rule")}</p>
                  {sheet.project_reviews.some((r) => r.can_review) && (
                    <label className="block max-w-xl space-y-2 text-12 text-secondary">
                      {t("workspace_tools.review_note")}
                      <TextArea
                        aria-label={t("workspace_tools.review_reason")}
                        value={reason}
                        maxLength={2000}
                        onChange={(e) => setReason(e.target.value)}
                        className={cn(inputStyle, "min-h-24 resize-none text-13")}
                      />
                    </label>
                  )}
                  <div className="divide-y divide-subtle border-y border-subtle">
                    {sheet.project_reviews.map((review) => (
                      <div
                        key={review.project_id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-13"
                      >
                        <div>
                          <p className="font-medium text-primary">{review.project_name}</p>
                          <p className="text-secondary">
                            {review.reviewer_name || t("workspace_tools.project_lead_required")}
                          </p>
                          {review.reason && <p className="mt-1 whitespace-pre-wrap text-secondary">{review.reason}</p>}
                        </div>
                        <Badge
                          variant={
                            review.status === "approved"
                              ? "success"
                              : review.status === "returned"
                                ? "warning"
                                : "brand"
                          }
                        >
                          {t(`workspace_tools.${review.status}`)}
                        </Badge>
                        {review.can_review && (
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="lg"
                              disabled={busy}
                              prependIcon={<Check className="size-4" />}
                              onClick={() => void mutate("approve", { project_id: review.project_id, reason })}
                            >
                              {t("workspace_tools.approve")}
                            </Button>
                            <Button
                              variant="secondary"
                              size="lg"
                              disabled={busy || !reason.trim()}
                              prependIcon={<RotateCcw className="size-4" />}
                              onClick={() => void mutate("return", { project_id: review.project_id, reason })}
                            >
                              {t("workspace_tools.returned")}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {!!sheet.events.length && (
                <section className="mt-10">
                  <h2 className="mb-3 text-16 font-medium text-primary">{t("workspace_tools.history")}</h2>
                  <ol className="space-y-2 text-12 text-secondary">
                    {sheet.events.map((e) => (
                      <li key={e.id}>
                        <time>
                          {new Date(e.created_at).toLocaleString(currentLocale, { timeZone: sheet.timezone })}
                        </time>{" "}
                        · {e.actor} · {t(`workspace_tools.event_${e.action}`)} · v{e.version}
                        {e.reason && <span className="ml-2 whitespace-pre-wrap">— {e.reason}</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
