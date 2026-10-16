import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

const EMPTY_VALUE = "__none__";

export type SettingOption = { value: string; label: string };

/** Compact caption for nested settings: title and a one-line hint. */
export function SettingLabel({
  htmlFor,
  title,
  description,
}: {
  htmlFor?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {title}
      </Label>
      {description ? (
        <span className="text-[11px] leading-tight text-muted-foreground">
          {description}
        </span>
      ) : null}
    </div>
  );
}

export function SettingSwitch({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <SettingLabel htmlFor={id} title={title} description={description} />
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export type SettingDecimals = 0 | 1 | 2;

const DECIMALS_OPTIONS: SettingOption[] = [
  { value: "0", label: "Без дробной части" },
  { value: "1", label: "1 знак" },
  { value: "2", label: "2 знака" },
];

/** Single choice with an optional «none» item; shows a hint when empty. */
export function SettingSelect({
  id,
  title,
  description,
  value,
  options,
  placeholder = "Выберите",
  emptyLabel,
  noOptionsLabel,
  onChange,
}: {
  id: string;
  title?: string;
  description?: string;
  value: string | null;
  options: SettingOption[];
  placeholder?: string;
  /** When set, the value can be cleared with this item. */
  emptyLabel?: string;
  /** Shown instead of the select when there is nothing to choose. */
  noOptionsLabel?: string;
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.value === value);
  const label =
    selected?.label ?? (value ? "Поле удалено" : (emptyLabel ?? placeholder));

  return (
    <div className="flex flex-col gap-1.5">
      {title ? (
        <SettingLabel htmlFor={id} title={title} description={description} />
      ) : null}
      {options.length === 0 && noOptionsLabel ? (
        <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
          {noOptionsLabel}
        </div>
      ) : (
        <Select
          value={value ?? EMPTY_VALUE}
          onValueChange={(next) => {
            if (next == null) return;
            const nextValue = String(next);
            onChange(nextValue === EMPTY_VALUE ? null : nextValue);
          }}
        >
          <SelectTrigger
            id={id}
            size="sm"
            className="w-full"
            aria-label={title}
          >
            <SelectValue>
              <span className={selected ? undefined : "text-muted-foreground"}>
                {label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {emptyLabel ? (
              <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** «Точность»: digits after the decimal comma. */
export function DecimalsSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: SettingDecimals;
  onChange: (value: SettingDecimals) => void;
}) {
  return (
    <SettingSelect
      id={id}
      title="Точность"
      description="Знаков после запятой"
      value={String(value)}
      options={DECIMALS_OPTIONS}
      onChange={(next) => {
        const decimals = Number(next);
        onChange(decimals === 0 || decimals === 1 ? decimals : 2);
      }}
    />
  );
}
