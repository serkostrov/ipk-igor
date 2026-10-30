import { useState } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

const EMPTY_VALUE = "__none__";

export type SettingOption = { value: string; label: string };

export type SettingOptionGroup = {
  label: string;
  options: SettingOption[];
};

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
  const titleClassName = "text-xs font-medium text-muted-foreground";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className={titleClassName}>
          {title}
        </Label>
      ) : (
        <span className={titleClassName}>{title}</span>
      )}
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
  disabled,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <SettingLabel htmlFor={id} title={title} description={description} />
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** Single choice with an optional «none» item; shows a hint when empty. */
export function SettingSelect({
  id,
  title,
  description,
  value,
  options,
  optionGroups,
  placeholder = "Выберите",
  emptyLabel,
  noOptionsLabel,
  disabled,
  onChange,
}: {
  id: string;
  title?: string;
  description?: string;
  value: string | null;
  options: SettingOption[];
  /** When set, options are shown under labeled sections (must cover `options`). */
  optionGroups?: SettingOptionGroup[];
  placeholder?: string;
  /** When set, the value can be cleared with this item. */
  emptyLabel?: string;
  /** Shown instead of the select when there is nothing to choose. */
  noOptionsLabel?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.value === value);
  const label =
    selected?.label ?? (value ? "Поле удалено" : (emptyLabel ?? placeholder));
  const byValue = new Map(options.map((option) => [option.value, option]));
  const groups =
    optionGroups
      ?.map((group) => ({
        label: group.label,
        options: group.options
          .map((option) => byValue.get(option.value) ?? option)
          .filter((option) => byValue.has(option.value)),
      }))
      .filter((group) => group.options.length > 0) ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      {title ? <SettingLabel title={title} description={description} /> : null}
      {options.length === 0 && noOptionsLabel ? (
        <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
          {noOptionsLabel}
        </div>
      ) : (
        <Select
          value={value ?? EMPTY_VALUE}
          disabled={disabled}
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
            {groups
              ? groups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              : options.map((option) => (
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

/**
 * «Точность»: free integer digits after the decimal comma.
 * Compact row — label left, numeric input right (like SettingSwitch).
 */
export function DecimalsSelect({
  id,
  value,
  onChange,
  max = 10,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  /** Upper bound inclusive (default 10). */
  max?: number;
}) {
  const upper = Math.max(0, Math.floor(max));
  const safe = clampDecimals(value, upper);
  const [draft, setDraft] = useState(String(safe));
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : String(safe);

  function commit(raw: string) {
    const parsed = Number(raw.trim());
    const next = clampDecimals(Number.isFinite(parsed) ? parsed : safe, upper);
    setDraft(String(next));
    if (next !== safe) onChange(next);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <SettingLabel
        htmlFor={id}
        title="Точность"
        description={`Знаков после запятой · 0–${upper}`}
      />
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={upper}
        step={1}
        value={shown}
        aria-label="Знаков после запятой"
        className="h-8 w-[4.5rem] shrink-0 text-center tabular-nums"
        onFocus={() => {
          setFocused(true);
          setDraft(String(safe));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim() === "") return;
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) return;
          onChange(clampDecimals(parsed, upper));
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function clampDecimals(value: number, max: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.min(max, Math.max(0, Math.floor(value)));
}
