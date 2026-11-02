import { IconButton } from "@plane/propel/icon-button";
import type { FormEvent, ReactNode } from "react";
import { Dialog } from "@headlessui/react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
  error?: string;
  children: ReactNode;
};

/** Uses the same portal, backdrop, focus trap and top placement as the work item modal. */
export function WorkspaceToolDialog({ title, onClose, onSubmit, submitLabel, busy, disabled, error, children }: Props) {
  const { t } = useTranslation();
  return (
    <ModalCore
      isOpen
      handleClose={() => {
        if (!busy) onClose();
      }}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
    >
      <form onSubmit={onSubmit} className="flex max-h-[85dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-4">
          <Dialog.Title className="text-18 font-medium text-primary">{title}</Dialog.Title>
          <IconButton
            variant="ghost"
            size="base"
            icon={X}
            type="button"
            aria-label={t("workspace_tools.close_dialog")}
            disabled={busy}
            onClick={onClose}
          />
        </header>
        <fieldset disabled={busy} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {children}
          {error && (
            <p role="alert" className="text-13 text-danger-primary">
              {error}
            </p>
          )}
        </fieldset>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            {t("workspace_tools.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={disabled}>
            {busy ? t("workspace_tools.saving") : submitLabel}
          </Button>
        </footer>
      </form>
    </ModalCore>
  );
}
