import { Search, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DateRangeFilterControl,
  FilterValueLabel,
  filterControlClass,
} from "@/shared/ui/filter-controls";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import { STATUS_ORDER, STATUS_VIEW, UNALLOCATED_LABEL } from "../model/labels";
import type {
  PaymentCalendarFilters,
  PaymentCalendarSection,
  RecordRef,
} from "../model/types";

const ALL = "__all__";
const SECTION_ORDER: readonly PaymentCalendarSection[] = [
  ...STATUS_ORDER,
  "unallocated",
];

function RefFilter({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: readonly RecordRef[];
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? null : String(next))}
    >
      <SelectTrigger
        id={id}
        size="sm"
        className={filterControlClass}
        aria-label={`Фильтр: ${label}`}
      >
        <SelectValue>
          <FilterValueLabel label={label} value={selected?.name ?? "все"} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Filter bar in the style of the DDS entity table. */
export function PaymentFilterBar({
  filters,
  legalOptions,
  counterpartyOptions,
  sectionCounts,
  onChange,
  onReset,
}: {
  filters: PaymentCalendarFilters;
  legalOptions: readonly RecordRef[];
  counterpartyOptions: readonly RecordRef[];
  /** Количество платежей по статусам и нераспределённых операций. */
  sectionCounts: Record<PaymentCalendarSection, number>;
  onChange: (patch: Partial<PaymentCalendarFilters>) => void;
  onReset: () => void;
}) {
  const hasActive =
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.legalId != null ||
    filters.counterpartyId != null ||
    filters.section != null;
  const sectionLabel = (section: PaymentCalendarSection) =>
    section === "unallocated" ? UNALLOCATED_LABEL : STATUS_VIEW[section].label;
  const selectedSection = filters.section;

  return (
    <div className="grid shrink-0 grid-cols-2 items-center gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      <div className="relative col-span-2 h-8">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="payment-calendar-search"
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Поиск"
          aria-label="Поиск по календарю"
          className={cn(
            filterControlClass,
            "absolute inset-0 box-border py-0 pl-8 leading-none md:text-sm",
          )}
        />
      </div>
      <DateRangeFilterControl
        id="payment-calendar-period"
        label="Период"
        from={filters.dateFrom}
        to={filters.dateTo}
        onChange={(dateFrom, dateTo) => onChange({ dateFrom, dateTo })}
      />
      <RefFilter
        id="payment-calendar-legal"
        label="Юрлицо"
        value={filters.legalId}
        options={legalOptions}
        onChange={(legalId) => onChange({ legalId })}
      />
      <RefFilter
        id="payment-calendar-counterparty"
        label="Контрагент"
        value={filters.counterpartyId}
        options={counterpartyOptions}
        onChange={(counterpartyId) => onChange({ counterpartyId })}
      />
      <Select
        value={selectedSection ?? ALL}
        onValueChange={(next) =>
          onChange({
            section:
              next === ALL ? null : (String(next) as PaymentCalendarSection),
          })
        }
      >
        <SelectTrigger
          id="payment-calendar-status"
          size="sm"
          className={filterControlClass}
          aria-label="Фильтр: Статус"
        >
          <SelectValue>
            <FilterValueLabel
              label="Статус"
              value={selectedSection ? sectionLabel(selectedSection) : "все"}
            />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все</SelectItem>
          {SECTION_ORDER.map((section) => (
            <SelectItem key={section} value={section}>
              {sectionLabel(section)} ({sectionCounts[section]})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActive ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start text-muted-foreground"
          onClick={onReset}
        >
          <X className="size-3.5" aria-hidden />
          Сбросить
        </Button>
      ) : null}
    </div>
  );
}
