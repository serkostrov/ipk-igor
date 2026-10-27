import { useMemo, useState } from "react";
import { Check, ChevronLeft, LayoutGrid, Settings, Table2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { SettingSelect } from "@/shared/ui/setting-controls";
import {
  ENTITY_RECORD_COLUMN_OPTIONS,
  getEntityTableNestedEntityOptions,
  getEntityTableParentFieldOptions,
  getEntityTableSubgroupFieldOptions,
  normalizeEntityRecordColumns,
  useEntityConfig,
  type Entity,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

const DISPLAY_OPTIONS: Array<{
  value: EntityRecordsDisplay;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    value: "cards",
    label: "Карточки",
    description: "Плитки записей",
    icon: LayoutGrid,
  },
  {
    value: "table",
    label: "Таблица",
    description: "Строки в таблице",
    icon: Table2,
  },
];

const HIERARCHY_FIELD_PREFIX = "field:";
const HIERARCHY_NESTED_PREFIX = "nested:";

function encodeHierarchyValue(
  tableParentFieldId: string | null,
  tableNestedEntityId: string | null,
): string | null {
  if (tableNestedEntityId?.trim()) {
    return `${HIERARCHY_NESTED_PREFIX}${tableNestedEntityId.trim()}`;
  }
  if (tableParentFieldId?.trim()) {
    return `${HIERARCHY_FIELD_PREFIX}${tableParentFieldId.trim()}`;
  }
  return null;
}

function decodeHierarchyValue(value: string | null): {
  tableParentFieldId: string | null;
  tableNestedEntityId: string | null;
} {
  if (!value) {
    return { tableParentFieldId: null, tableNestedEntityId: null };
  }
  if (value.startsWith(HIERARCHY_NESTED_PREFIX)) {
    return {
      tableParentFieldId: null,
      tableNestedEntityId: value.slice(HIERARCHY_NESTED_PREFIX.length) || null,
    };
  }
  if (value.startsWith(HIERARCHY_FIELD_PREFIX)) {
    return {
      tableParentFieldId: value.slice(HIERARCHY_FIELD_PREFIX.length) || null,
      tableNestedEntityId: null,
    };
  }
  // Legacy: raw field id from older settings.
  return { tableParentFieldId: value, tableNestedEntityId: null };
}

function columnLabel(value: EntityRecordColumns) {
  if (value === 1) return "1 колонка";
  if (value === 2) return "2 колонки";
  return "3 колонки";
}

type SettingsKind = "cards" | "table";

type EntityRecordsDisplayFieldsProps = {
  recordsDisplay: EntityRecordsDisplay;
  recordColumns: EntityRecordColumns;
  onRecordsDisplayChange: (value: EntityRecordsDisplay) => void;
  onRecordColumnsChange: (value: EntityRecordColumns) => void;
  /** Linked entity — needed for table hierarchy options. */
  entity?: Entity | null;
  tableParentFieldId?: string | null;
  tableSubgroupFieldId?: string | null;
  tableNestedEntityId?: string | null;
  onTableHierarchyChange?: (next: {
    tableParentFieldId: string | null;
    tableSubgroupFieldId: string | null;
    tableNestedEntityId: string | null;
  }) => void;
  /** @deprecated use onTableHierarchyChange */
  onTableParentFieldIdChange?: (value: string | null) => void;
  columnsSelectId?: string;
  hint?: string;
};

function CardsSettingsPanel({
  recordColumns,
  onRecordColumnsChange,
  columnsSelectId,
  onBack,
}: {
  recordColumns: EntityRecordColumns;
  onRecordColumnsChange: (value: EntityRecordColumns) => void;
  columnsSelectId: string;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 mt-0.5 shrink-0"
          aria-label="Назад к виду отображения"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-none">Настройки карточек</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Сколько колонок на странице родителя
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={columnsSelectId}>Колонки записей</Label>
        <Select
          value={String(recordColumns)}
          onValueChange={(value) => {
            if (value == null) return;
            onRecordColumnsChange(normalizeEntityRecordColumns(Number(value)));
          }}
        >
          <SelectTrigger id={columnsSelectId} className="w-full">
            <SelectValue>{columnLabel(recordColumns)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENTITY_RECORD_COLUMN_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {columnLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="button" className="w-full" onClick={onBack}>
        Готово
      </Button>
    </div>
  );
}

function TableSettingsPanel({
  entity,
  tableParentFieldId,
  tableSubgroupFieldId,
  tableNestedEntityId,
  onTableHierarchyChange,
  onBack,
}: {
  entity: Entity;
  tableParentFieldId: string | null;
  tableSubgroupFieldId: string | null;
  tableNestedEntityId: string | null;
  onTableHierarchyChange: (next: {
    tableParentFieldId: string | null;
    tableSubgroupFieldId: string | null;
    tableNestedEntityId: string | null;
  }) => void;
  onBack: () => void;
}) {
  const { entities } = useEntityConfig();
  const fieldOptions = useMemo(
    () =>
      getEntityTableParentFieldOptions(entity).map((option) => ({
        value: `${HIERARCHY_FIELD_PREFIX}${option.value}`,
        label: option.label,
      })),
    [entity],
  );
  const nestedOptions = useMemo(
    () =>
      getEntityTableNestedEntityOptions(entity, entities).map((option) => ({
        value: `${HIERARCHY_NESTED_PREFIX}${option.value}`,
        label: option.label,
      })),
    [entities, entity],
  );
  const options = [...fieldOptions, ...nestedOptions];
  const optionGroups = [
    { label: "По полю", options: fieldOptions },
    { label: "Вложенная сущность", options: nestedOptions },
  ].filter((group) => group.options.length > 0);

  const subgroupOptions = useMemo(
    () => getEntityTableSubgroupFieldOptions(entity, tableParentFieldId),
    [entity, tableParentFieldId],
  );

  const entityLabel =
    entity.namePlural.trim() || entity.name.trim() || "записи";
  const hierarchyValue = encodeHierarchyValue(
    tableParentFieldId,
    tableNestedEntityId,
  );
  const fieldGroupingActive = Boolean(tableParentFieldId?.trim());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 mt-0.5 shrink-0"
          aria-label="Назад к виду отображения"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-none">Настройки таблицы</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Как показывать «{entityLabel}» на странице родителя
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
        <SettingSelect
          id="entity-records-table-hierarchy"
          title="Сгруппировать по"
          description="Поле (список, связь, стадии/группы) — группы из значений. Вложенная сущность — записи вкладки внутри каждой строки."
          value={hierarchyValue}
          options={options}
          optionGroups={optionGroups.length > 0 ? optionGroups : undefined}
          emptyLabel="Плоский список"
          noOptionsLabel="Добавьте список, связь, группы связей или вкладку связанной сущности"
          onChange={(next) => {
            const decoded = decodeHierarchyValue(next);
            onTableHierarchyChange({
              ...decoded,
              tableSubgroupFieldId: decoded.tableParentFieldId
                ? tableSubgroupFieldId &&
                  tableSubgroupFieldId !== decoded.tableParentFieldId
                  ? tableSubgroupFieldId
                  : null
                : null,
            });
          }}
        />

        {fieldGroupingActive ? (
          <div className="border-t border-border/60 pt-3">
            <SettingSelect
              id="entity-records-table-subgroup"
              title="Затем по"
              description="Подгруппы внутри каждой группы — ещё одно поле списка, связи или стадий."
              value={tableSubgroupFieldId}
              options={subgroupOptions}
              emptyLabel="Без подгрупп"
              noOptionsLabel="Нужно ещё одно поле списка, связи или групп"
              onChange={(next) =>
                onTableHierarchyChange({
                  tableParentFieldId,
                  tableSubgroupFieldId: next,
                  tableNestedEntityId: null,
                })
              }
            />
          </div>
        ) : null}
      </div>

      <Button type="button" className="w-full" onClick={onBack}>
        Готово
      </Button>
    </div>
  );
}

export function EntityRecordsDisplayFields({
  recordsDisplay,
  recordColumns,
  onRecordsDisplayChange,
  onRecordColumnsChange,
  entity = null,
  tableParentFieldId = null,
  tableSubgroupFieldId = null,
  tableNestedEntityId = null,
  onTableHierarchyChange,
  onTableParentFieldIdChange,
  columnsSelectId = "entity-record-columns",
  hint,
}: EntityRecordsDisplayFieldsProps) {
  const [settingsKind, setSettingsKind] = useState<SettingsKind | null>(null);
  const handleHierarchyChange =
    onTableHierarchyChange ??
    (onTableParentFieldIdChange
      ? (next: {
          tableParentFieldId: string | null;
          tableSubgroupFieldId: string | null;
          tableNestedEntityId: string | null;
        }) => {
          onTableParentFieldIdChange(next.tableParentFieldId);
        }
      : undefined);
  const tableConfigurable =
    entity != null && typeof handleHierarchyChange === "function";

  if (settingsKind === "cards") {
    return (
      <CardsSettingsPanel
        recordColumns={recordColumns}
        onRecordColumnsChange={onRecordColumnsChange}
        columnsSelectId={columnsSelectId}
        onBack={() => setSettingsKind(null)}
      />
    );
  }

  if (settingsKind === "table" && entity && handleHierarchyChange) {
    return (
      <TableSettingsPanel
        entity={entity}
        tableParentFieldId={tableParentFieldId}
        tableSubgroupFieldId={tableSubgroupFieldId}
        tableNestedEntityId={tableNestedEntityId}
        onTableHierarchyChange={handleHierarchyChange}
        onBack={() => setSettingsKind(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label>Вид отображения</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {DISPLAY_OPTIONS.map((option, index) => {
          const Icon = option.icon;
          const selected = recordsDisplay === option.value;
          const configurable =
            option.value === "cards" ||
            (option.value === "table" && tableConfigurable);
          return (
            <div
              key={option.value}
              className={cn(
                "relative flex items-center gap-2.5 px-3 py-2.5 transition-colors",
                index > 0 && "border-t border-border",
                selected ? "bg-primary/5" : "bg-background hover:bg-muted/40",
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onRecordsDisplayChange(option.value)}
                className="absolute inset-0 z-0"
                aria-label={option.label}
              />

              <span
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md pointer-events-none",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>

              <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
                <div className="truncate text-sm font-medium leading-none">
                  {option.label}
                </div>
                <div className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
                  {option.description}
                </div>
              </div>

              <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                {configurable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label={`Настройки: ${option.label}`}
                    title="Настройки"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRecordsDisplayChange(option.value);
                      setSettingsKind(option.value);
                    }}
                  >
                    <Settings className="size-3.5" />
                  </Button>
                ) : null}

                <span
                  className={cn(
                    "ml-1 inline-grid size-3.5 shrink-0 place-items-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-2" strokeWidth={3} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
