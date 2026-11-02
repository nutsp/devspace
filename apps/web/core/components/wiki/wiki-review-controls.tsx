import { useEffect, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/ui";
import { CalendarDays } from "lucide-react";
import { renderFormattedPayloadDate } from "@plane/utils";
import { WorkspaceToolDialog } from "@/components/common/workspace-tool-dialog";
import { MemberDropdownBase } from "@/components/dropdowns/member/base";
import { DateDropdown } from "@/components/dropdowns/date";
import { WikiService } from "@/services/wiki.service";
import type { WikiReviewDetail } from "@/services/wiki.service";
import { offsetDate } from "@/helpers/timesheet";
import { useWiki } from "./workspace-wiki";

const service = new WikiService();
export function WikiReviewControls({
  slug,
  collectionId,
  pageId,
  saved,
}: {
  slug: string;
  collectionId: string;
  pageId: string;
  saved: boolean;
}) {
  const { t, currentLocale } = useTranslation();
  const { refresh } = useWiki();
  const metadata = useSWR(
    `wiki-review-${slug}-${collectionId}-${pageId}`,
    () => service.review(slug, collectionId, pageId),
    { refreshInterval: 15000 }
  );
  const { mutate: refreshMetadata } = metadata;
  useEffect(() => {
    if (saved) {
      void refreshMetadata();
      void refresh();
    }
  }, [saved, refreshMetadata, refresh]);
  const [dialog, setDialog] = useState<"settings" | "complete" | null>(null);
  const [snapshot, setSnapshot] = useState<WikiReviewDetail | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [interval, setInterval] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open(kind: "settings" | "complete") {
    setError("");
    setBusy(true);
    try {
      const data = await metadata.mutate();
      if (!data) return;
      setSnapshot(data);
      setOwner(data.owner_id);
      setInterval(String(data.interval_days));
      setDue(kind === "complete" ? offsetDate(data.today, data.interval_days) : data.due_date);
      setDialog(kind);
    } catch {
      setError(t("workspace_tools.review_load_error"));
    } finally {
      setBusy(false);
    }
  }
  const data = metadata.data;
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2 text-12 text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {t("workspace_tools.document_owner")}: {data?.owner_name || t("workspace_tools.not_assigned")}
          </span>
          {data?.due_date && (
            <span>
              · {t("workspace_tools.review_due")}: {data.due_date}
            </span>
          )}
          {data && (
            <Badge
              variant={
                data.status === "overdue"
                  ? "danger"
                  : ["changed", "due_soon"].includes(data.status)
                    ? "warning"
                    : data.status === "reviewed"
                      ? "success"
                      : "neutral"
              }
            >
              {t(`workspace_tools.wiki_review_${data.status}`)}
            </Badge>
          )}
          {data?.reviewed_at && (
            <span>
              · {t("workspace_tools.last_reviewed")}: {new Date(data.reviewed_at).toLocaleDateString(currentLocale)} ·{" "}
              {data.reviewed_by_name}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {data?.can_manage && (
            <Button variant="ghost" size="base" disabled={busy} onClick={() => void open("settings")}>
              {t("workspace_tools.review_settings")}
            </Button>
          )}
          {data?.can_complete && (
            <Button variant="secondary" size="base" disabled={busy || !saved} onClick={() => void open("complete")}>
              {t("workspace_tools.mark_reviewed")}
            </Button>
          )}
        </div>
        {(metadata.error || (!dialog && error)) && (
          <p role="alert" className="w-full text-danger-primary">
            {error || t("workspace_tools.review_load_error")}
          </p>
        )}
      </div>
      {dialog && snapshot && (
        <WorkspaceToolDialog
          title={t(dialog === "settings" ? "workspace_tools.review_settings" : "workspace_tools.mark_reviewed")}
          submitLabel={t(dialog === "settings" ? "workspace_tools.save_changes" : "workspace_tools.mark_reviewed")}
          busy={busy}
          error={error}
          disabled={
            dialog === "settings"
              ? (!!due && !owner) ||
                !Number.isInteger(Number(interval)) ||
                Number(interval) < 1 ||
                Number(interval) > 3650
              : !due || due <= snapshot.today || !saved
          }
          onClose={() => {
            setDialog(null);
            setError("");
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const result =
                dialog === "settings"
                  ? await service.updateReview(slug, collectionId, pageId, {
                      revision: snapshot.revision,
                      owner_id: owner,
                      due_date: due,
                      interval_days: Number(interval),
                    })
                  : await service.completeReview(slug, collectionId, pageId, {
                      revision: snapshot.revision,
                      content_hash: snapshot.content_hash,
                      next_due_date: due,
                    });
              await metadata.mutate(result, { revalidate: false });
              await refresh();
              setDialog(null);
            } catch (failure) {
              const payload = (failure as { response?: { data?: unknown } })?.response?.data;
              setError(
                payload && typeof payload === "object"
                  ? Object.values(payload).flat().map(String).join(" · ")
                  : t("workspace_tools.action_error")
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {dialog === "settings" ? (
            <>
              <p className="text-13 text-secondary">{t("workspace_tools.review_settings_help")}</p>
              <label className="block text-13 text-secondary">{t("workspace_tools.document_owner")}</label>
              <MemberDropdownBase
                multiple={false}
                value={owner}
                onChange={(id) => {
                  setOwner(id);
                  if (!id) setDue(null);
                }}
                memberIds={snapshot.members.map((m) => m.id)}
                getUserDetails={(id) => {
                  const member = snapshot.members.find((m) => m.id === id);
                  return member
                    ? {
                        id: member.id,
                        display_name: member.name,
                        first_name: member.name,
                        last_name: "",
                        avatar_url: "",
                        is_bot: false,
                      }
                    : undefined;
                }}
                buttonVariant="border-with-text"
                showUserDetails
                dropdownArrow
                placeholder={t("workspace_tools.select_document_owner")}
                disabled={busy}
                className="w-full"
                buttonContainerClassName="w-full"
                buttonClassName="w-full rounded-md bg-layer-2 px-3 py-2 text-13"
                optionsClassName="z-[100]"
              />
            </>
          ) : (
            <p className="text-13 text-secondary">{t("workspace_tools.mark_reviewed_help")}</p>
          )}
          <label className="block space-y-2 text-13 text-secondary">
            {t(dialog === "settings" ? "workspace_tools.review_due" : "workspace_tools.next_review_date")}
            <DateDropdown
              value={due}
              onChange={(date) => setDue(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
              buttonVariant="border-with-text"
              disabled={busy}
              placeholder={t("workspace_tools.review_due")}
              icon={
                <>
                  <CalendarDays className="size-3.5" />
                  <span className="sr-only">{t("workspace_tools.review_due")}: </span>
                </>
              }
              className="h-auto w-full"
              buttonContainerClassName="w-full"
              buttonClassName="w-full rounded-md border-subtle-1 bg-layer-2 px-3 py-2 text-13 text-primary"
              labelClassName="text-13"
              optionsClassName="z-[100] max-w-[calc(100vw-2rem)]"
            />
          </label>
          {dialog === "settings" && (
            <label className="block space-y-2 text-13 text-secondary">
              {t("workspace_tools.review_interval")}
              <Input
                type="number"
                min={1}
                max={3650}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="w-full text-primary"
                required
              />
            </label>
          )}
        </WorkspaceToolDialog>
      )}
    </>
  );
}
