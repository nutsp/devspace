import { CustomSearchSelect } from "@plane/ui";
import { useTranslation } from "@plane/i18n";

/** Uses Plane's existing searchable Combobox, portal, option styling and checkmark. */
export function WorkspaceSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  onSearch,
  variant = "input",
}: {
  variant?: "input" | "filter";
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onSearch?: (query: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <CustomSearchSelect
      input={variant === "input"}
      matchButtonWidth={variant === "input"}
      className={variant === "input" ? "w-full" : "min-w-0"}
      buttonClassName={
        variant === "input"
          ? "rounded-md border-subtle-1 bg-layer-2 text-primary disabled:cursor-not-allowed"
          : "max-w-full text-primary"
      }
      optionsClassName="z-[100] max-w-[calc(100vw-2rem)] min-w-0 text-13 [&_input]:text-13"
      value={value}
      disabled={disabled}
      onChange={(next: string) => onChange(next ?? "")}
      onQueryChange={onSearch}
      noResultsMessage={t("no_matching_results")}
      label={
        <span className="min-w-0 truncate">
          <span className="sr-only">{label}: </span>
          {options.find((o) => o.value === value)?.label || label}
        </span>
      }
      options={options.map((o) => ({
        value: o.value,
        query: o.label,
        content: <span className="truncate">{o.label}</span>,
      }))}
    />
  );
}
