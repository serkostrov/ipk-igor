import { Children, useMemo, useState, type ReactNode } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  Check,
  ChevronDown,
  ChevronDownIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
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
import { TreeBranchGuides } from "@/shared/ui/tree-branch-guides";
import {
  ConditionBuilder,
  DEFAULT_ENTITY_FIELD_GROUP,
  ENTITY_FIELD_TYPE_GROUPS,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityListSourceCandidates,
  canEntityFieldToggleShowOnCreate,
  isEntityComputedFieldType,
  isEntityNameField,
  isEntityNumericFieldType,
  isEntityUnitFieldType,
  isSystemEntityField,
  normalizeEntitySumFieldIds,
  getRelationRecordOptions,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  SYSTEM_ENTITY_KEY_USERS,
  type Entity,
  type EntityCondition,
  type EntityField,
  type EntityFieldType,
  ENTITY_NUMBER_DECIMALS_MAX,
  normalizeEntityNumberDecimals,
  type EntityNumberDecimals,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import {
  canHaveDefaultValue,
  canShowFieldAsProgress,
  createFieldTypeSettingsDraft,
  getFieldTypeSettingsError,
  resolveFieldTypeSettings,
  type EntityFieldTypeSettings,
  type FieldTypeSettingsDraft,
} from "../model/field-type-settings";
import {
  DecimalsSelect,
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";
import { TemplateFieldInput } from "@/features/manage-automations/ui/TemplateFieldInput";
import { DeadlineSettings } from "./DeadlineSettings";
import { DefaultValueSettings } from "./DefaultValueSettings";
import { FormulaSettings } from "./FormulaSettings";
import { LookupSettings } from "./LookupSettings";
import { RelationFilterSettings } from "./RelationFilterSettings";
import { RelationGroupsSettings } from "./RelationGroupsSettings";
import {
  RollupCalculationSettings,
  RollupConditionsSettings,
  RollupSourceSettings,
} from "./RollupSettings";

export type EntityFieldFormData = {
  name: string;
  type: EntityFieldType;
  hint: string;
  group: string;
  required: boolean;
  showInTable: boolean;
  showInFilters: boolean;
  /** When false, hidden in the new-record form (required/title always shown). */
  showOnCreate: boolean;
  /** Show field only when the record matches these conditions. */
  visibilityConditions: EntityCondition[];
  includeInTotal: boolean;
  /** 1-based column index when `showInTable` is true. */
  tablePosition: number;
  relationEntityId: string | null;
  relationMultiple: boolean;
  /** Linked list field id when type is list; null = own «Новый» list. */
  listSourceFieldId: string | null;
  /** List: allow several option ids (implies fixed catalog). */
  listMultiple: boolean;
  /** Optional unit suffix for number, formula and rollup (e.g. «м/с»). */
  unitSuffix: string | null;
  /** Fraction digits for number / numberSum. */
  decimals: EntityNumberDecimals;
  sumFieldIds: string[];
  /** When `type === "datetime"` — store and show time. */
  datetimeWithTime: boolean;
  /** When `type === "boolean"` — interactive switch in the table. */
  booleanInline: boolean;
  /**
   * Name field only: entity-wide title template (`{{fieldId}}` tokens).
   * Empty — titles are entered per record.
   */
  nameTemplate: string;
  /** Formula, rollup, lookup, default value, relation filter, deadline… */
  settings: EntityFieldTypeSettings;
};

export type EntityOption = {
  id: string;
  name: string;
  /** Parent entity label when this option is a nested (tab) entity. */
  parentName?: string | null;
};

const LIST_SOURCE_NEW = "__list-source-new__";

const SIGN_COLOR_OPTIONS = [
  { value: "positiveRed", label: "Больше нуля — красным" },
  { value: "positiveGreen", label: "Больше нуля — зелёным" },
];

export type SumFieldOption = {
  id: string;
  name: string;
  typeLabel: string;
};

type EntityFieldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: EntityField | null;
  /** Prefill group when creating a field. */
  initialGroup?: string;
  groupOptions?: string[];
  entityOptions?: EntityOption[];
  /** All entities: list sources, relation targets, rollups, lookups. */
  entities?: Entity[];
  /** Current entity id — excluded from list source candidates. */
  entityId?: string;
  /** Number/price fields available as sum sources. */
  sumFieldOptions?: SumFieldOption[];
  /** Current 1-based table column (including title). */
  tablePosition?: number;
  /** Total table columns when this field is visible. */
  tableColumnCount?: number;
  /** Minimum movable column (2 when title column exists). */
  tablePositionMin?: number;
  /** When false, list type is hidden (unless editing an existing list field). */
  allowListType?: boolean;
  /**
   * Auto tab-link relation: target entity stays fixed; type may become
   * «значение из связи» (bridge is preserved for the tab).
   */
  lockRelationBinding?: boolean;
  /** System entity field: type stays fixed, display settings remain editable. */
  lockSystemBinding?: boolean;
  /**
   * Saves the field (create/update) and opens list options editor.
   * Called with current form data so create/type-change work before save.
   */
  onConfigureList?: (data: EntityFieldFormData) => void;
  /** Current number of list variants on the field (0 when not saved yet). */
  listOptionCount?: number;
  onSubmit: (data: EntityFieldFormData) => void;
};

function GroupCombobox({
  id,
  value,
  options,
  onValueChange,
}: {
  id: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Autocomplete.Root
      items={options}
      value={value}
      onValueChange={onValueChange}
      openOnInputClick
      mode="none"
    >
      <div className="relative">
        <Autocomplete.Input
          id={id}
          placeholder={DEFAULT_ENTITY_FIELD_GROUP}
          className={cn(
            "h-9 w-full min-w-0 rounded-md border border-input bg-transparent py-1 pr-8 pl-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
          )}
        />
        <Autocomplete.Trigger
          type="button"
          className="absolute top-0 right-0 flex h-9 w-8 items-center justify-center text-muted-foreground outline-none"
          aria-label="Показать группы"
        >
          <ChevronDownIcon className="size-4" />
        </Autocomplete.Trigger>
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="isolate z-50 outline-none"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup
            className={cn(
              "h-auto max-h-60 w-max min-w-[max(var(--anchor-width),12rem)] max-w-[min(32rem,var(--available-width,calc(100vw-2rem)))] origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <Autocomplete.Empty className="text-sm text-muted-foreground empty:hidden">
              <div className="px-2.5 py-2">Новая группа</div>
            </Autocomplete.Empty>
            <Autocomplete.List className="max-h-60 overflow-y-auto p-1 outline-none data-empty:hidden">
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className={cn(
                    "flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  )}
                >
                  {item}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

function TablePositionControl({
  position,
  total,
  min,
  onChange,
}: {
  position: number;
  total: number;
  min: number;
  onChange: (position: number) => void;
}) {
  const canDecrease = position > min;
  const canIncrease = position < total;

  return (
    <TypeNestedGroup>
      <div className="flex items-center justify-between gap-2 py-0.5 pr-0.5">
        <Label
          htmlFor="entity-field-table-position"
          className="text-xs font-medium text-muted-foreground"
        >
          Позиция
        </Label>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground"
            disabled={!canDecrease}
            aria-label="Сдвинуть влево"
            onClick={() => onChange(position - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <div
            id="entity-field-table-position"
            className="flex h-6 min-w-11 items-center justify-center rounded-md bg-background px-1.5 text-xs font-semibold tabular-nums shadow-xs ring-1 ring-border/60"
            aria-live="polite"
          >
            {position}
            <span className="mx-0.5 font-normal text-muted-foreground">/</span>
            {total}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground"
            disabled={!canIncrease}
            aria-label="Сдвинуть вправо"
            onClick={() => onChange(position + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </TypeNestedGroup>
  );
}

/** Tree branch for nested type/table settings: one stem, elbows to each child. */
function TypeNestedGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="relative mr-2 mb-1.5 ml-3">
      <div className="flex flex-col gap-1.5">
        {items.map((child, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <div key={index} className="relative">
              <TreeBranchGuides
                isFirst={isFirst}
                isLast={isLast}
                className="left-0"
                armClassName="w-2"
              />
              <div className="ml-3.5 flex flex-col gap-1.5 rounded-md bg-muted/35 py-2 pr-2 pl-3">
                {child}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function relationEntityLabel(option: EntityOption) {
  if (option.parentName) return `${option.parentName} → ${option.name}`;
  return option.name;
}

function RelationEntityControl({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: EntityOption[];
  onChange: (entityId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value) ?? null;

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack =
        `${option.parentName ?? ""} ${option.name}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);

  const roots = useMemo(
    () => filteredOptions.filter((option) => !option.parentName),
    [filteredOptions],
  );
  const nestedByParent = useMemo(() => {
    const map = new Map<string, EntityOption[]>();
    for (const option of filteredOptions) {
      if (!option.parentName) continue;
      const list = map.get(option.parentName) ?? [];
      list.push(option);
      map.set(option.parentName, list);
    }
    return map;
  }, [filteredOptions]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor="entity-field-relation-target"
          className="text-xs font-medium text-muted-foreground"
        >
          Сущность
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          К какой сущности привязать записи
        </span>
      </div>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          id="entity-field-relation-target"
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-8 w-full items-center justify-between gap-2 overflow-hidden border-input bg-background px-2.5 py-0 text-sm font-normal shadow-xs hover:bg-background",
                !selected && "text-muted-foreground",
              )}
            />
          }
        >
          <span className="min-w-0 truncate">
            {selected
              ? relationEntityLabel(selected)
              : options.length === 0
                ? "Нет сущностей"
                : "Выберите сущность"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        >
          <div className="border-b border-border/70 p-2">
            <Input
              value={query}
              placeholder="Поиск сущности…"
              className="h-8"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                Ничего не найдено
              </p>
            ) : (
              <>
                {roots.map((option) => {
                  const checked = option.id === value;
                  const children = nestedByParent.get(option.name) ?? [];
                  return (
                    <div key={option.id} className="flex flex-col">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          checked
                            ? "bg-primary/8 text-foreground"
                            : "text-foreground hover:bg-muted/60",
                        )}
                        onClick={() => {
                          onChange(option.id);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {checked ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {option.name}
                        </span>
                      </button>
                      {children.map((child) => {
                        const childChecked = child.id === value;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md py-1.5 pr-2.5 pl-7 text-left text-sm transition-colors",
                              childChecked
                                ? "bg-primary/8 text-foreground"
                                : "text-foreground hover:bg-muted/60",
                            )}
                            onClick={() => {
                              onChange(child.id);
                              setOpen(false);
                              setQuery("");
                            }}
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                                childChecked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background",
                              )}
                              aria-hidden
                            >
                              {childChecked ? (
                                <Check className="size-3" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {child.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              внутри
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {[...nestedByParent.entries()]
                  .filter(
                    ([parentName]) =>
                      !roots.some((root) => root.name === parentName),
                  )
                  .flatMap(([, children]) => children)
                  .map((child) => {
                    const childChecked = child.id === value;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          childChecked
                            ? "bg-primary/8 text-foreground"
                            : "text-foreground hover:bg-muted/60",
                        )}
                        onClick={() => {
                          onChange(child.id);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            childChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {childChecked ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {relationEntityLabel(child)}
                        </span>
                      </button>
                    );
                  })}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RelationMultipleControl({
  multiple,
  onMultipleChange,
  disabled = false,
}: {
  multiple: boolean;
  onMultipleChange: (multiple: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor="entity-field-relation-multiple"
          className="text-xs font-medium text-muted-foreground"
        >
          Множественный выбор
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          Можно выбрать несколько записей
        </span>
      </div>
      <Switch
        id="entity-field-relation-multiple"
        checked={multiple}
        disabled={disabled}
        onCheckedChange={onMultipleChange}
      />
    </div>
  );
}

function ListMultipleControl({
  multiple,
  onMultipleChange,
}: {
  multiple: boolean;
  onMultipleChange: (multiple: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor="entity-field-list-multiple"
          className="text-xs font-medium text-muted-foreground"
        >
          Множественный выбор
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          Можно выбрать несколько вариантов
        </span>
      </div>
      <Switch
        id="entity-field-list-multiple"
        checked={multiple}
        onCheckedChange={onMultipleChange}
      />
    </div>
  );
}

function NumberTotalControl({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor="entity-field-include-in-total"
          className="text-xs font-medium text-muted-foreground"
        >
          Включить в итог
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          Сумма колонки внизу таблицы
        </span>
      </div>
      <Switch
        id="entity-field-include-in-total"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function DatetimeTimeControl({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor="entity-field-datetime-with-time"
          className="text-xs font-medium text-muted-foreground"
        >
          Включить время
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          Дата и время в одном поле
        </span>
      </div>
      <Switch
        id="entity-field-datetime-with-time"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function NumberUnitControl({
  enabled,
  onEnabledChange,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label
            htmlFor="entity-field-use-unit"
            className="text-xs font-medium text-muted-foreground"
          >
            Единица измерения
          </Label>
          <span className="text-[11px] leading-tight text-muted-foreground">
            Показывать суффикс рядом с числом
          </span>
        </div>
        <Switch
          id="entity-field-use-unit"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled ? (
        <div className="relative ml-0.5">
          <div
            className="pointer-events-none absolute -top-1 left-0 h-[calc(50%+4px)] w-2.5 rounded-bl-[4px] border-b border-l border-border"
            aria-hidden
          />
          <div className="ml-2.5 flex flex-col gap-1">
            <Label
              htmlFor="entity-field-unit-suffix"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Единица
            </Label>
            <Input
              id="entity-field-unit-suffix"
              value={value}
              placeholder="м/с"
              className="h-8"
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SUM_FIELDS_VISIBLE_CHIPS = 2;

function NumberSumFieldsDropdown({
  options,
  selectedIds,
  onChange,
}: {
  options: SumFieldOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selectedIds);

  const selectedOptions = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((option) => option.id === id))
        .filter((option): option is SumFieldOption => option != null),
    [options, selectedIds],
  );

  const visibleOptions = selectedOptions.slice(0, SUM_FIELDS_VISIBLE_CHIPS);
  const hiddenOptions = selectedOptions.slice(SUM_FIELDS_VISIBLE_CHIPS);
  const hiddenCount = hiddenOptions.length;
  const hiddenLabel = hiddenOptions.map((option) => option.name).join(", ");

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        option.typeLabel.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2.5 text-center text-[11px] leading-snug text-muted-foreground">
        Сначала добавьте поля типа «Число»
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        id="entity-field-sum-fields"
        aria-label="Поля для суммы"
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-8 w-full items-center justify-between gap-2 overflow-hidden border-input bg-background px-2.5 py-0 font-normal shadow-xs hover:bg-background aria-expanded:bg-background",
              selectedOptions.length === 0 && "text-muted-foreground",
            )}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {selectedOptions.length === 0 ? (
            <span className="truncate text-sm">Выберите поля</span>
          ) : (
            <>
              {visibleOptions.map((option) => (
                <span
                  key={option.id}
                  className="inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-xs font-medium leading-none text-primary"
                >
                  <span className="truncate">{option.name}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
                    aria-label={`Убрать «${option.name}»`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      remove(option.id);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </span>
              ))}
              {hiddenCount > 0 ? (
                <span
                  className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums leading-none text-muted-foreground"
                  title={hiddenLabel}
                >
                  +{hiddenCount}
                </span>
              ) : null}
            </>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-max min-w-[max(var(--anchor-width),16rem)] max-w-[min(32rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="border-b border-border/70 p-2">
          <Input
            value={query}
            placeholder="Поиск…"
            className="h-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filteredOptions.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          ) : (
            filteredOptions.map((option) => {
              const checked = selectedSet.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    checked
                      ? "bg-primary/8 text-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => toggle(option.id)}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                    aria-hidden
                  >
                    {checked ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    {option.typeLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {selectedIds.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2">
            <span className="text-xs text-muted-foreground">
              Выбрано: {selectedIds.length}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
              onClick={() => onChange([])}
            >
              Очистить
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function listOptionCountLabel(count: number) {
  if (count <= 0) return "Пока нет вариантов";
  return `${count} ${pluralRu(count, "вариант", "варианта", "вариантов")}`;
}

type ListSourceCandidate = {
  fieldId: string;
  label: string;
  optionCount: number;
};

/** Nested type branch: pick own list or link to an existing one. */
function ListSourceControl({
  sourceFieldId,
  sourceCandidates,
  onSourceChange,
}: {
  sourceFieldId: string;
  sourceCandidates: ListSourceCandidate[];
  onSourceChange: (fieldId: string) => void;
}) {
  const isNew = sourceFieldId.trim().length === 0;

  return (
    <SettingSelect
      id="entity-field-list-source"
      title="Список"
      description="Новый или из другой сущности"
      value={isNew ? LIST_SOURCE_NEW : sourceFieldId}
      options={[
        { value: LIST_SOURCE_NEW, label: "Новый" },
        ...sourceCandidates.map((item) => ({
          value: item.fieldId,
          label: item.label,
        })),
      ]}
      onChange={(next) => {
        onSourceChange(!next || next === LIST_SOURCE_NEW ? "" : next);
      }}
    />
  );
}

/** Nested type branch: options for a new list, or summary when linked. */
function ListVariantsControl({
  sourceFieldId,
  sourceCandidates,
  optionCount,
  onConfigure,
}: {
  sourceFieldId: string;
  sourceCandidates: ListSourceCandidate[];
  optionCount: number;
  onConfigure?: () => void;
}) {
  const isNew = sourceFieldId.trim().length === 0;
  const selected = sourceCandidates.find(
    (item) => item.fieldId === sourceFieldId,
  );
  const linkedCount = selected?.optionCount ?? 0;

  if (!isNew) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Варианты
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          {listOptionCountLabel(linkedCount)}
          {selected ? " · из другой сущности" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Варианты
        </Label>
        <span className="text-[11px] leading-tight text-muted-foreground">
          {listOptionCountLabel(optionCount)}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2.5 text-xs"
        disabled={!onConfigure}
        onClick={onConfigure}
      >
        Настроить
      </Button>
    </div>
  );
}

function buildEntityFieldFormData({
  field,
  name,
  hint,
  type,
  group,
  required,
  showInTable,
  showInFilters,
  showOnCreate,
  visibilityConditions,
  includeInTotal,
  tablePosition,
  tableColumnCount,
  tablePositionMin,
  relationEntityId,
  relationMultiple,
  listSourceFieldId,
  listMultiple,
  unitSuffix,
  useUnit,
  decimals,
  sumFieldIds,
  useAsSum,
  datetimeWithTime,
  booleanInline,
  nameTemplate,
  typeSettings,
  entity,
  relationBindingLocked,
  systemBindingLocked,
  isNameField,
}: {
  field?: EntityField | null;
  name: string;
  hint: string;
  type: EntityFieldType;
  group: string;
  required: boolean;
  showInTable: boolean;
  showInFilters: boolean;
  showOnCreate: boolean;
  visibilityConditions: EntityCondition[];
  includeInTotal: boolean;
  tablePosition: number;
  tableColumnCount: number;
  tablePositionMin: number;
  relationEntityId: string;
  relationMultiple: boolean;
  listSourceFieldId: string;
  listMultiple: boolean;
  unitSuffix: string;
  useUnit: boolean;
  decimals: EntityNumberDecimals;
  sumFieldIds: string[];
  useAsSum: boolean;
  datetimeWithTime: boolean;
  booleanInline: boolean;
  nameTemplate: string;
  typeSettings: FieldTypeSettingsDraft;
  entity: Entity | null;
  relationBindingLocked: boolean;
  systemBindingLocked: boolean;
  isNameField: boolean;
}): EntityFieldFormData {
  if (isNameField) {
    const columnTotal = Math.max(1, tableColumnCount);
    const minPosition = Math.min(tablePositionMin, columnTotal);
    return {
      name: name.trim(),
      type: "text",
      hint: hint.trim(),
      group: "",
      required: true,
      showInTable: true,
      showInFilters,
      showOnCreate: true,
      visibilityConditions: [],
      includeInTotal: false,
      tablePosition: Math.min(
        columnTotal,
        Math.max(minPosition, tablePosition),
      ),
      relationEntityId: null,
      relationMultiple: false,
      listSourceFieldId: null,
      listMultiple: false,
      unitSuffix: null,
      decimals: 2,
      sumFieldIds: [],
      datetimeWithTime: false,
      booleanInline: false,
      nameTemplate: nameTemplate.trim(),
      settings: {},
    };
  }

  const nextGroup = group.trim();
  const isNumberType = type === "number";
  const resolvedType: EntityFieldType =
    relationBindingLocked && type === "lookup"
      ? "lookup"
      : relationBindingLocked
        ? "relation"
        : systemBindingLocked && field
          ? field.type
          : isNumberType && useAsSum
            ? "numberSum"
            : type;
  const columnTotal = Math.max(1, tableColumnCount);
  const minPosition = Math.min(tablePositionMin, columnTotal);
  const resolvedRelationEntityId =
    resolvedType === "belonging"
      ? (entity?.id ?? (relationEntityId.trim() || null))
      : resolvedType === "relation"
        ? relationBindingLocked
          ? (field?.relationEntityId ?? (relationEntityId.trim() || null))
          : relationEntityId.trim() || null
        : null;

  return {
    name: name.trim(),
    type: resolvedType,
    hint: hint.trim(),
    group: nextGroup === DEFAULT_ENTITY_FIELD_GROUP ? "" : nextGroup,
    required: isEntityComputedFieldType(resolvedType) ? false : required,
    showInTable,
    showInFilters,
    showOnCreate: required ? true : Boolean(showOnCreate),
    visibilityConditions,
    includeInTotal: isEntityNumericFieldType(resolvedType) && includeInTotal,
    tablePosition: Math.min(columnTotal, Math.max(minPosition, tablePosition)),
    relationEntityId: resolvedRelationEntityId,
    relationMultiple:
      resolvedType === "relation"
        ? relationBindingLocked
          ? Boolean(field?.relationMultiple)
          : relationMultiple
        : false,
    listSourceFieldId:
      resolvedType === "list" ? listSourceFieldId.trim() || null : null,
    listMultiple: resolvedType === "list" ? Boolean(listMultiple) : false,
    unitSuffix:
      isEntityUnitFieldType(resolvedType) && useUnit
        ? unitSuffix.trim() || null
        : null,
    decimals:
      resolvedType === "number" || resolvedType === "numberSum" ? decimals : 2,
    sumFieldIds: resolvedType === "numberSum" ? sumFieldIds : [],
    datetimeWithTime:
      resolvedType === "datetime" ? Boolean(datetimeWithTime) : false,
    booleanInline: resolvedType === "boolean" ? Boolean(booleanInline) : false,
    nameTemplate: "",
    settings: resolveFieldTypeSettings(
      resolvedType,
      typeSettings,
      entity,
      field?.id ?? null,
    ),
  };
}

function NumberSumModeControl({
  enabled,
  onEnabledChange,
  options,
  selectedIds,
  onSelectedIdsChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  options: SumFieldOption[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label
            htmlFor="entity-field-use-as-sum"
            className="text-xs font-medium text-muted-foreground"
          >
            Сумма чисел
          </Label>
          <span className="text-[11px] leading-tight text-muted-foreground">
            Считать значение из других полей
          </span>
        </div>
        <Switch
          id="entity-field-use-as-sum"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled ? (
        <div className="relative ml-0.5">
          <div
            className="pointer-events-none absolute -top-1 left-0 h-[calc(50%+4px)] w-2.5 rounded-bl-[4px] border-b border-l border-border"
            aria-hidden
          />
          <div className="ml-2.5 flex flex-col gap-1">
            <Label
              htmlFor="entity-field-sum-fields"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Поля
            </Label>
            <NumberSumFieldsDropdown
              options={options}
              selectedIds={selectedIds}
              onChange={onSelectedIdsChange}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EntityFieldForm({
  field,
  initialGroup = "",
  groupOptions = [],
  entityOptions = [],
  entities = [],
  entityId,
  sumFieldOptions = [],
  tablePosition: initialTablePosition = 1,
  tableColumnCount = 1,
  tablePositionMin = 1,
  allowListType = true,
  lockRelationBinding = false,
  lockSystemBinding = false,
  onConfigureList,
  listOptionCount = 0,
  onCancel,
  onSubmit,
}: {
  field?: EntityField | null;
  initialGroup?: string;
  groupOptions?: string[];
  entityOptions?: EntityOption[];
  entities?: Entity[];
  entityId?: string;
  sumFieldOptions?: SumFieldOption[];
  tablePosition?: number;
  tableColumnCount?: number;
  tablePositionMin?: number;
  allowListType?: boolean;
  lockRelationBinding?: boolean;
  lockSystemBinding?: boolean;
  onConfigureList?: (data: EntityFieldFormData) => void;
  listOptionCount?: number;
  onCancel: () => void;
  onSubmit: (data: EntityFieldFormData) => void;
}) {
  const isEdit = Boolean(field);
  const isNameField = field != null && isEntityNameField(field);
  const systemBindingLocked =
    lockSystemBinding && field != null && isSystemEntityField(field);
  const isTabLinkRelation = lockRelationBinding && field?.type === "relation";
  /** Tab-link may switch only between relation and lookup. */
  const relationBindingLocked = isTabLinkRelation;
  const typeLocked = systemBindingLocked;
  const [name, setName] = useState(field?.name ?? "");
  const [hint, setHint] = useState(field?.hint ?? "");
  const [type, setType] = useState<EntityFieldType>(() =>
    field?.type === "numberSum" ? "number" : (field?.type ?? "text"),
  );
  const [group, setGroup] = useState(
    field?.group?.trim() || initialGroup.trim() || "",
  );
  const [useAsSum, setUseAsSum] = useState(field?.type === "numberSum");
  const [required, setRequired] = useState(
    field?.type === "numberSum" ? false : (field?.required ?? false),
  );
  const [showInTable, setShowInTable] = useState(field?.showInTable ?? false);
  const [showInFilters, setShowInFilters] = useState(
    field?.showInFilters ?? false,
  );
  const [showOnCreate, setShowOnCreate] = useState(
    field?.showOnCreate !== false,
  );
  const [visibilityConditions, setVisibilityConditions] = useState<
    EntityCondition[]
  >(() => field?.visibilityConditions ?? []);
  const [includeInTotal, setIncludeInTotal] = useState(
    field != null &&
      isEntityNumericFieldType(field.type) &&
      Boolean(field.includeInTotal),
  );
  const [tablePosition, setTablePosition] = useState(initialTablePosition);
  const [relationEntityId, setRelationEntityId] = useState(
    field?.relationEntityId ?? "",
  );
  const [relationMultiple, setRelationMultiple] = useState(
    Boolean(field?.relationMultiple),
  );
  const [listSourceFieldId, setListSourceFieldId] = useState(
    field?.listSourceFieldId ?? "",
  );
  const [listMultiple, setListMultiple] = useState(
    Boolean(field?.listFixed && field?.listMultiple),
  );
  const [unitSuffix, setUnitSuffix] = useState(field?.unitSuffix ?? "");
  const [useUnit, setUseUnit] = useState(
    Boolean(field?.unitSuffix?.trim()) && field?.type !== "numberSum",
  );
  const [decimals, setDecimals] = useState<EntityNumberDecimals>(() =>
    normalizeEntityNumberDecimals(field?.decimals),
  );
  const [sumFieldIds, setSumFieldIds] = useState(() => {
    const allowed = new Set(sumFieldOptions.map((option) => option.id));
    return normalizeEntitySumFieldIds(field?.sumFieldIds).filter((id) =>
      allowed.has(id),
    );
  });
  const [datetimeWithTime, setDatetimeWithTime] = useState(() =>
    field?.type === "datetime" ? field.datetimeWithTime !== false : false,
  );
  const [booleanInline, setBooleanInline] = useState(() =>
    field?.type === "boolean" ? Boolean(field.booleanInline) : false,
  );
  const currentEntity = useMemo(
    () => entities.find((item) => item.id === entityId) ?? null,
    [entities, entityId],
  );
  const [nameTemplate, setNameTemplate] = useState(
    () => entities.find((item) => item.id === entityId)?.nameTemplate ?? "",
  );
  const [typeSettings, setTypeSettings] = useState(() =>
    createFieldTypeSettingsDraft(field, currentEntity),
  );
  const isNumberType = type === "number";
  const isDatetimeType = type === "datetime";
  /** Type to be saved: «Число» with «Сумма чисел» is stored as `numberSum`. */
  const effectiveType: EntityFieldType =
    isNumberType && useAsSum ? "numberSum" : type;
  const relationTarget =
    type === "relation" || type === "belonging"
      ? (entities.find(
          (item) =>
            item.id ===
            (type === "belonging" ? (entityId ?? "") : relationEntityId),
        ) ?? null)
      : null;
  const listDefaultOptions =
    field?.type === "list" &&
    listSourceFieldId === (field.listSourceFieldId ?? "")
      ? resolveEntityListFieldOptions(field, entities)
      : [];
  const listPresentation =
    field?.type === "list"
      ? resolveEntityListFieldPresentation(field, entities)
      : null;
  const relationToUsers = relationTarget?.systemKey === SYSTEM_ENTITY_KEY_USERS;
  const relationDefaultOptions = useMemo(
    () => (relationTarget ? getRelationRecordOptions(relationTarget) : []),
    [relationTarget],
  );
  const showDefaultValue =
    !systemBindingLocked &&
    !relationBindingLocked &&
    canHaveDefaultValue(effectiveType, {
      relationToUsers,
      hasListOptions: listDefaultOptions.length > 0,
      hasRelationTarget: Boolean(relationTarget),
    });
  const dependencyScopeOptions = (currentEntity?.fields ?? [])
    .filter(
      (item) =>
        item.id !== field?.id &&
        (item.type === "relation" || item.type === "list"),
    )
    .map((item) => ({
      value: item.id,
      label: getEntityFieldDisplayName(item),
    }));
  const canSubmit =
    (type !== "relation" || relationEntityId.trim().length > 0) &&
    !(isNumberType && useAsSum && sumFieldIds.length === 0) &&
    !(
      isEntityUnitFieldType(effectiveType) &&
      useUnit &&
      unitSuffix.trim().length === 0
    ) &&
    getFieldTypeSettingsError(
      effectiveType,
      typeSettings,
      currentEntity,
      field?.id ?? null,
    ) == null;

  function patchTypeSettings(patch: Partial<FieldTypeSettingsDraft>) {
    setTypeSettings((current) => ({ ...current, ...patch }));
  }

  const options = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const option of groupOptions) {
      const trimmed = option.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      names.push(trimmed);
    }
    return names;
  }, [groupOptions]);

  const typeGroups = useMemo(
    () =>
      ENTITY_FIELD_TYPE_GROUPS.map((group) => ({
        ...group,
        types: group.types.filter((item) => {
          if (isTabLinkRelation) {
            return item === "relation" || item === "lookup";
          }
          return item !== "list" || field?.type === "list" || allowListType;
        }),
      })).filter((group) => group.types.length > 0),
    [allowListType, field?.type, isTabLinkRelation],
  );

  const tabLinkTargetEntityId = isTabLinkRelation
    ? field?.relationEntityId?.trim() || relationEntityId.trim() || null
    : null;

  const listSourceCandidates = useMemo(
    () =>
      getEntityListSourceCandidates(entities, {
        excludeEntityId: entityId ?? null,
        excludeFieldId: field?.id ?? null,
      }),
    [entities, entityId, field?.id],
  );

  const columnTotal = Math.max(1, tableColumnCount);
  const minPosition = Math.min(tablePositionMin, columnTotal);

  function getFormData(): EntityFieldFormData {
    return buildEntityFieldFormData({
      field,
      name,
      hint,
      type,
      group,
      required,
      showInTable,
      showInFilters,
      showOnCreate,
      visibilityConditions:
        isNameField || systemBindingLocked ? [] : visibilityConditions,
      includeInTotal,
      tablePosition,
      tableColumnCount,
      tablePositionMin,
      relationEntityId,
      relationMultiple,
      listSourceFieldId,
      listMultiple,
      unitSuffix,
      useUnit,
      decimals,
      sumFieldIds,
      useAsSum,
      datetimeWithTime,
      booleanInline,
      nameTemplate,
      typeSettings,
      entity: currentEntity,
      relationBindingLocked,
      systemBindingLocked,
      isNameField,
    });
  }

  function handleRequiredChange(checked: boolean) {
    setRequired(checked);
    if (checked) setShowOnCreate(true);
  }

  function handleShowInTableChange(checked: boolean) {
    setShowInTable(checked);
    if (checked) {
      setTablePosition(Math.max(minPosition, initialTablePosition));
    }
  }

  function handleTablePositionChange(next: number) {
    setTablePosition(Math.min(columnTotal, Math.max(minPosition, next)));
  }

  function handleTypeChange(next: EntityFieldType) {
    const resolved = next === "numberSum" ? "number" : next;
    if (isTabLinkRelation && resolved !== "relation" && resolved !== "lookup") {
      return;
    }
    setType(resolved);
    if (resolved !== "number") {
      setUseAsSum(false);
      setSumFieldIds([]);
    }
    if (!isEntityNumericFieldType(resolved)) setIncludeInTotal(false);
    if (!isEntityUnitFieldType(resolved)) {
      setUseUnit(false);
      setUnitSuffix("");
    }
    if (resolved !== "relation" && resolved !== "belonging") {
      if (!isTabLinkRelation) {
        setRelationEntityId("");
        setRelationMultiple(false);
      }
    }
    if (resolved !== "list") {
      setListSourceFieldId("");
      setListMultiple(false);
    }
    if (resolved !== "datetime") {
      setDatetimeWithTime(false);
    }
    if (resolved !== "boolean") {
      setBooleanInline(false);
    }
    if (resolved === "belonging") {
      setRelationEntityId(entityId ?? "");
      setRelationMultiple(false);
    } else if (resolved === "relation") {
      if (isTabLinkRelation && field?.relationEntityId) {
        setRelationEntityId(field.relationEntityId);
        setRelationMultiple(Boolean(field.relationMultiple));
      } else if (!relationEntityId && entityOptions.length === 1) {
        setRelationEntityId(entityOptions[0]!.id);
      }
    }

    if (resolved === "lookup" && isTabLinkRelation && field) {
      // Placeholder bridge id = current field; store remaps on save.
      patchTypeSettings({
        defaultValue: null,
        lookup: {
          relationFieldId: field.id,
          targetFieldId:
            resolved === type ? (typeSettings.lookup?.targetFieldId ?? "") : "",
        },
      });
    } else if (resolved !== type) {
      patchTypeSettings({ defaultValue: null });
    }
  }

  function handleUseAsSumChange(enabled: boolean) {
    setUseAsSum(enabled);
    if (enabled) {
      setRequired(false);
      setUseUnit(false);
      setUnitSuffix("");
      return;
    }
    setSumFieldIds([]);
  }

  function handleUseUnitChange(enabled: boolean) {
    setUseUnit(enabled);
    if (!enabled) setUnitSuffix("");
  }

  function handleRelationEntityChange(nextEntityId: string) {
    if (nextEntityId === relationEntityId) return;
    setRelationEntityId(nextEntityId);
    patchTypeSettings({
      defaultValue: null,
      relationFilter: null,
    });
  }

  function handleDatetimeWithTimeChange(checked: boolean) {
    setDatetimeWithTime(checked);
    if (!checked && typeSettings.defaultValue?.kind === "now") {
      patchTypeSettings({ defaultValue: { kind: "today" } });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать поле" : "Новое поле"}
        </DialogTitle>
        <DialogDescription>
          {isNameField
            ? "Системное поле заголовка — название, шаблон и позиция колонки в таблице."
            : systemBindingLocked
              ? "Системное поле — тип зафиксирован, можно изменить название и отображение."
              : relationBindingLocked
                ? "Связь вкладки: можно сменить тип на «значение из связи» — фильтр вкладки сохранится."
                : "Название, подсказка, тип, группа и настройки отображения."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-field-name">Название</Label>
          <Input
            id="entity-field-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Контакты"
            autoFocus={!isNameField}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-field-hint">Подсказка</Label>
          <Input
            id="entity-field-hint"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Подсказка для заполнения"
          />
        </div>

        {isNameField && currentEntity ? (
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
            <TemplateFieldInput
              id="entity-field-name-template"
              title="Шаблон названия"
              value={nameTemplate}
              placeholder="Текст и поля — для всех записей"
              fields={currentEntity.fields.filter(
                (item) => !isEntityNameField(item),
              )}
              onChange={setNameTemplate}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Если задан — подставляется в поле «Название» (можно изменить или
              дописать). Пусто — название вводится вручную.
            </p>
          </div>
        ) : null}

        {isNameField ? (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="entity-field-show-in-table-name">
                  В таблице
                </Label>
                <span className="text-xs text-muted-foreground">
                  Показывать как колонку
                </span>
              </div>
              <Switch id="entity-field-show-in-table-name" checked disabled />
            </div>
            <TablePositionControl
              position={Math.min(
                columnTotal,
                Math.max(minPosition, tablePosition),
              )}
              total={columnTotal}
              min={minPosition}
              onChange={handleTablePositionChange}
            />
          </div>
        ) : null}

        {isNameField ? null : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity-field-group">Группа</Label>
              <GroupCombobox
                id="entity-field-group"
                value={group}
                options={options}
                onValueChange={setGroup}
              />
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="flex flex-col gap-2 px-3 py-2.5">
                <Label>Тип</Label>
                <Select
                  value={type}
                  disabled={typeLocked}
                  onValueChange={(value) => {
                    if (value == null) return;
                    handleTypeChange(String(value) as EntityFieldType);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {getEntityFieldTypeLabel(
                        type === "numberSum" ? "number" : type,
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {typeGroups.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.types.map((item) => (
                          <SelectItem key={item} value={item}>
                            {getEntityFieldTypeLabel(item)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TypeNestedGroup>
                {type === "belonging" ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Родительская запись этой же сущности — к какой записи
                    принадлежит новая.
                  </p>
                ) : null}
                {type === "relation" ? (
                  <RelationEntityControl
                    value={relationEntityId}
                    options={entityOptions}
                    disabled={relationBindingLocked}
                    onChange={handleRelationEntityChange}
                  />
                ) : null}
                {type === "relation" ? (
                  <RelationMultipleControl
                    multiple={relationMultiple}
                    disabled={relationBindingLocked}
                    onMultipleChange={setRelationMultiple}
                  />
                ) : null}
                {type === "relation" &&
                relationTarget &&
                !relationBindingLocked ? (
                  <RelationFilterSettings
                    entity={currentEntity}
                    fieldId={field?.id ?? null}
                    target={relationTarget}
                    entities={entities}
                    value={typeSettings.relationFilter}
                    onChange={(relationFilter) =>
                      patchTypeSettings({ relationFilter })
                    }
                  />
                ) : null}
                {type === "formula" ? (
                  <FormulaSettings
                    entity={currentEntity}
                    fieldId={field?.id ?? null}
                    text={typeSettings.formulaText}
                    decimals={typeSettings.formulaDecimals}
                    unitSuffix={useUnit ? unitSuffix : null}
                    onTextChange={(formulaText) =>
                      patchTypeSettings({ formulaText })
                    }
                  />
                ) : null}
                {type === "formula" ? (
                  <DecimalsSelect
                    id="entity-field-formula-decimals"
                    value={typeSettings.formulaDecimals}
                    max={ENTITY_NUMBER_DECIMALS_MAX}
                    onChange={(formulaDecimals) =>
                      patchTypeSettings({ formulaDecimals })
                    }
                  />
                ) : null}
                {type === "rollup" ? (
                  <RollupSourceSettings
                    entityId={entityId ?? null}
                    entities={entities}
                    value={typeSettings.rollup}
                    onChange={(rollup) => patchTypeSettings({ rollup })}
                  />
                ) : null}
                {type === "rollup" && typeSettings.rollup ? (
                  <RollupCalculationSettings
                    entities={entities}
                    value={typeSettings.rollup}
                    onChange={(rollup) => patchTypeSettings({ rollup })}
                  />
                ) : null}
                {type === "rollup" && typeSettings.rollup ? (
                  <RollupConditionsSettings
                    entities={entities}
                    value={typeSettings.rollup}
                    onChange={(rollup) => patchTypeSettings({ rollup })}
                  />
                ) : null}
                {type === "rollup" && typeSettings.rollup ? (
                  <DecimalsSelect
                    id="entity-field-rollup-decimals"
                    value={typeSettings.rollup.decimals}
                    max={ENTITY_NUMBER_DECIMALS_MAX}
                    onChange={(nextDecimals) =>
                      patchTypeSettings({
                        rollup: typeSettings.rollup
                          ? {
                              ...typeSettings.rollup,
                              decimals: nextDecimals,
                            }
                          : null,
                      })
                    }
                  />
                ) : null}
                {type === "lookup" ? (
                  <LookupSettings
                    entity={currentEntity}
                    entities={entities}
                    value={typeSettings.lookup}
                    onChange={(lookup) => patchTypeSettings({ lookup })}
                    tabLinkBridge={
                      isTabLinkRelation && field && tabLinkTargetEntityId
                        ? {
                            fieldId: field.id,
                            label:
                              field.name.trim() ||
                              entityOptions.find(
                                (item) => item.id === tabLinkTargetEntityId,
                              )?.name ||
                              "Связь вкладки",
                            targetEntityId: tabLinkTargetEntityId,
                          }
                        : null
                    }
                  />
                ) : null}
                {type === "dependencies" ? (
                  <SettingSelect
                    id="entity-field-dependencies-scope"
                    title="Только записи с тем же"
                    description="Например, в рамках одного проекта"
                    value={typeSettings.dependencies.sameFieldId}
                    options={dependencyScopeOptions}
                    emptyLabel="Любые записи"
                    onChange={(sameFieldId) =>
                      patchTypeSettings({ dependencies: { sameFieldId } })
                    }
                  />
                ) : null}
                {type === "relationGroups" ? (
                  <RelationGroupsSettings
                    entities={entities}
                    entityOptions={entityOptions}
                    hostEntity={currentEntity}
                    value={typeSettings.relationGroups}
                    onChange={(relationGroups) =>
                      patchTypeSettings({ relationGroups })
                    }
                    defaultValue={typeSettings.defaultValue}
                    onDefaultValueChange={(defaultValue) =>
                      patchTypeSettings({ defaultValue })
                    }
                  />
                ) : null}
                {type === "list" ? (
                  <ListSourceControl
                    sourceFieldId={listSourceFieldId}
                    sourceCandidates={listSourceCandidates}
                    onSourceChange={setListSourceFieldId}
                  />
                ) : null}
                {type === "list" ? (
                  <ListVariantsControl
                    sourceFieldId={listSourceFieldId}
                    sourceCandidates={listSourceCandidates}
                    optionCount={listOptionCount}
                    onConfigure={
                      listSourceFieldId.trim().length === 0 && onConfigureList
                        ? () => {
                            onConfigureList(getFormData());
                            onCancel();
                          }
                        : undefined
                    }
                  />
                ) : null}
                {type === "list" ? (
                  <ListMultipleControl
                    multiple={listMultiple}
                    onMultipleChange={setListMultiple}
                  />
                ) : null}
                {isEntityUnitFieldType(effectiveType) ? (
                  <NumberUnitControl
                    enabled={useUnit}
                    onEnabledChange={handleUseUnitChange}
                    value={unitSuffix}
                    onChange={setUnitSuffix}
                  />
                ) : null}
                {isNumberType ? (
                  <DecimalsSelect
                    id="entity-field-number-decimals"
                    value={decimals}
                    max={ENTITY_NUMBER_DECIMALS_MAX}
                    onChange={setDecimals}
                  />
                ) : null}
                {isNumberType ? (
                  <NumberSumModeControl
                    enabled={useAsSum}
                    onEnabledChange={handleUseAsSumChange}
                    options={sumFieldOptions}
                    selectedIds={sumFieldIds}
                    onSelectedIdsChange={setSumFieldIds}
                  />
                ) : null}
                {canShowFieldAsProgress(effectiveType) ? (
                  <SettingSwitch
                    id="entity-field-progress"
                    title="Прогресс"
                    description="Полоса для значений от 0 до 100 %"
                    checked={typeSettings.progress}
                    onCheckedChange={(progress) =>
                      patchTypeSettings({ progress })
                    }
                  />
                ) : null}
                {isEntityNumericFieldType(effectiveType) ? (
                  <SettingSelect
                    id="entity-field-sign-color"
                    title="Цвет по знаку"
                    description="Например, для отклонения от плана"
                    value={typeSettings.signColor}
                    options={SIGN_COLOR_OPTIONS}
                    emptyLabel="Без цвета"
                    onChange={(next) =>
                      patchTypeSettings({
                        signColor:
                          next === "positiveRed" || next === "positiveGreen"
                            ? next
                            : null,
                      })
                    }
                  />
                ) : null}
                {isEntityNumericFieldType(effectiveType) ? (
                  <NumberTotalControl
                    checked={includeInTotal}
                    onCheckedChange={setIncludeInTotal}
                  />
                ) : null}
                {isDatetimeType ? (
                  <DatetimeTimeControl
                    checked={datetimeWithTime}
                    onCheckedChange={handleDatetimeWithTimeChange}
                  />
                ) : null}
                {isDatetimeType ? (
                  <DeadlineSettings
                    entity={currentEntity}
                    value={typeSettings.deadline}
                    onChange={(deadline) => patchTypeSettings({ deadline })}
                  />
                ) : null}
                {effectiveType === "boolean" ? (
                  <SettingSwitch
                    id="entity-field-boolean-inline"
                    title="Интерактивный тумблер"
                    description="Переключать прямо в таблице"
                    checked={booleanInline}
                    onCheckedChange={setBooleanInline}
                  />
                ) : null}
                {showDefaultValue ? (
                  <DefaultValueSettings
                    type={effectiveType}
                    datetimeWithTime={datetimeWithTime}
                    listOptions={listDefaultOptions}
                    listMultiple={
                      effectiveType === "list" ? listMultiple : false
                    }
                    listAllowOther={field?.listAllowOther ?? false}
                    listUseColors={listPresentation?.listUseColors ?? false}
                    decimals={decimals}
                    relationOptions={relationDefaultOptions}
                    relationMultiple={
                      effectiveType === "belonging" ? false : relationMultiple
                    }
                    relationToUsers={
                      effectiveType === "belonging" ? false : relationToUsers
                    }
                    value={typeSettings.defaultValue}
                    onChange={(defaultValue) =>
                      patchTypeSettings({ defaultValue })
                    }
                  />
                ) : null}
              </TypeNestedGroup>
            </div>

            <div className="flex flex-col gap-2">
              {isEntityComputedFieldType(effectiveType) ? null : (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor="entity-field-required">Обязательное</Label>
                    <span className="text-xs text-muted-foreground">
                      Поле нужно заполнить при создании записи
                    </span>
                  </div>
                  <Switch
                    id="entity-field-required"
                    checked={required}
                    onCheckedChange={handleRequiredChange}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label htmlFor="entity-field-show-in-table">
                        В таблице
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Показывать как колонку
                      </span>
                    </div>
                    <Switch
                      id="entity-field-show-in-table"
                      checked={isNameField || showInTable}
                      disabled={isNameField}
                      onCheckedChange={handleShowInTableChange}
                    />
                  </div>
                  {isNameField || showInTable ? (
                    <TablePositionControl
                      position={Math.min(
                        columnTotal,
                        Math.max(minPosition, tablePosition),
                      )}
                      total={columnTotal}
                      min={minPosition}
                      onChange={handleTablePositionChange}
                    />
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor="entity-field-show-in-filters">
                      В фильтрах
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Показывать в строке фильтров
                    </span>
                  </div>
                  <Switch
                    id="entity-field-show-in-filters"
                    checked={showInFilters}
                    onCheckedChange={setShowInFilters}
                  />
                </div>

                {isNameField ||
                !canEntityFieldToggleShowOnCreate(effectiveType) ? null : (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label htmlFor="entity-field-show-on-create">
                        При создании
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {required
                          ? "Обязательные поля всегда в форме создания"
                          : "Показывать в форме новой записи"}
                      </span>
                    </div>
                    <Switch
                      id="entity-field-show-on-create"
                      checked={required || showOnCreate}
                      disabled={required}
                      onCheckedChange={setShowOnCreate}
                    />
                  </div>
                )}

                {!isNameField && !systemBindingLocked && currentEntity ? (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5">
                    <SettingLabel
                      title="Показывать если"
                      description="Пусто — поле всегда видно"
                    />
                    <ConditionBuilder
                      entity={currentEntity}
                      entities={entities}
                      conditions={visibilityConditions}
                      onChange={setVisibilityConditions}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(getFormData());
            onCancel();
          }}
        >
          {isEdit ? "Сохранить" : "Добавить"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityFieldDialog({
  open,
  onOpenChange,
  field,
  initialGroup = "",
  groupOptions,
  entityOptions,
  entities,
  entityId,
  sumFieldOptions,
  tablePosition,
  tableColumnCount,
  tablePositionMin,
  allowListType = true,
  lockRelationBinding = false,
  lockSystemBinding = false,
  onConfigureList,
  listOptionCount = 0,
  onSubmit,
}: EntityFieldDialogProps) {
  const formKey = field?.id ?? `new-field:${initialGroup}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {open ? (
          <EntityFieldForm
            key={formKey}
            field={field}
            initialGroup={initialGroup}
            groupOptions={groupOptions}
            entityOptions={entityOptions}
            entities={entities}
            entityId={entityId}
            sumFieldOptions={sumFieldOptions}
            tablePosition={tablePosition}
            tableColumnCount={tableColumnCount}
            tablePositionMin={tablePositionMin}
            allowListType={allowListType}
            lockRelationBinding={lockRelationBinding}
            lockSystemBinding={lockSystemBinding}
            onConfigureList={onConfigureList}
            listOptionCount={listOptionCount}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
