import * as React from "react";
import {
  AUTOMATION_VALUE_CURRENT_RECORD,
  AUTOMATION_VALUE_CURRENT_USER,
  AUTOMATION_VALUE_NOW,
  AUTOMATION_VALUE_TIME_NOW,
  AUTOMATION_VALUE_TODAY,
  AUTOMATION_VALUE_TOMORROW,
  isAutomationEntityPathRef,
  isAutomationFieldRef,
  parseAutomationEntityPathRef,
  toAutomationEntityPathRef,
  toAutomationFieldRef,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationRecordOptions,
  isEntityComputedFieldType,
  ListSelect,
  normalizeEntityDecimalInput,
  RelationSelect,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  SYSTEM_USERS_ENTITY_ID,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { TimePicker } from "@/shared/ui/time-picker";
import { joinDatetime, splitDatetime } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

type ActionValueEditorProps = {
  field: EntityField | null;
  value: string;
  onChange: (value: string) => void;
  sourceFields: EntityField[];
  entities: Entity[];
  className?: string;
  /** Value is written to another entity (createRecord mappings). */
  mapToOtherEntity?: boolean;
  /** Source/trigger entity — enables «Текущая запись» for reverse relations. */
  sourceEntityId?: string;
  /** Mode + value on one row for dense mapping tables. */
  compact?: boolean;
};

function valueSourceLabels(
  mapToOtherEntity: boolean | undefined,
  compact?: boolean,
) {
  // When mapping onto another entity, entity names live in the parent header —
  // keep mode labels short to avoid «Лиды» three times in one row.
  const fromFieldLabel = mapToOtherEntity
    ? compact
      ? "Поле"
      : "Из поля"
    : "Из другого поля";
  const fromEntityLabel = mapToOtherEntity
    ? compact
      ? "Связь"
      : "Через связь"
    : "Из другой сущности";
  return { fromFieldLabel, fromEntityLabel };
}

type ValueMode =
  | "empty"
  | "today"
  | "tomorrow"
  | "now"
  | "custom"
  | "true"
  | "false"
  | "currentUser"
  | "currentRecord"
  | "fromField"
  | "fromEntity";

function fieldRefId(value: string) {
  const match = value.trim().match(/^\{\{([^.}]+)\}\}$/);
  return match?.[1]?.trim() ?? "";
}

function detectMode(value: string, field: EntityField | null): ValueMode {
  const raw = value.trim();
  if (!raw) return "empty";
  if (raw === AUTOMATION_VALUE_TODAY) return "today";
  if (raw === AUTOMATION_VALUE_TOMORROW) return "tomorrow";
  if (raw === AUTOMATION_VALUE_NOW || raw === AUTOMATION_VALUE_TIME_NOW) {
    return "now";
  }
  if (raw === AUTOMATION_VALUE_CURRENT_USER) return "currentUser";
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) return "currentRecord";
  if (isAutomationEntityPathRef(raw)) return "fromEntity";
  if (isAutomationFieldRef(raw)) return "fromField";
  if (field?.type === "boolean") {
    if (raw === "true") return "true";
    if (raw === "false") return "false";
  }
  return "custom";
}

function ModeSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-8 w-full min-w-0 overflow-hidden", className)}
      >
        <SelectValue className="min-w-0">
          {(selected) => {
            const label =
              options.find((item) => item.value === selected)?.label ??
              "Выберите";
            return <span className="block truncate">{label}</span>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent searchable={false} align="start" className="min-w-[12rem]">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SourceFieldSelect({
  fields,
  value,
  onChange,
  excludeFieldId,
  placeholder = "Выберите поле",
  entitySuffix,
  className,
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  excludeFieldId?: string;
  placeholder?: string;
  /** Shown in the closed trigger as «Поле · Сущность». */
  entitySuffix?: string;
  className?: string;
}) {
  const options = fields.filter(
    (field) =>
      field.id !== excludeFieldId &&
      !isEntityComputedFieldType(field.type) &&
      field.type !== "file",
  );
  const optionLabel = (field: EntityField) => {
    const name = getEntityFieldDisplayName(field);
    if (entitySuffix) return `${name} · ${entitySuffix}`;
    if (field.type === "relation") {
      const targetId = getEntityRelationTargetId(field);
      if (targetId === SYSTEM_USERS_ENTITY_ID) return `${name} · пользователь`;
    }
    return name;
  };
  return (
    <div className={cn("min-w-0", className)}>
      <Select
        value={value || undefined}
        onValueChange={(next) => {
          if (next != null) onChange(String(next));
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-full min-w-0 overflow-hidden">
          <SelectValue className="min-w-0">
            {(selected) => {
              const field = options.find((item) => item.id === selected);
              return (
                <span className="block truncate">
                  {field ? optionLabel(field) : placeholder}
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет совместимых полей на исходной записи
            </div>
          ) : (
            options.map((field) => {
              const label = optionLabel(field);
              return (
                <SelectItem key={field.id} value={field.id} label={label}>
                  {label}
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function compatibleNestedFields(
  target: EntityField,
  candidates: EntityField[],
): EntityField[] {
  return candidates.filter((item) => {
    if (isEntityComputedFieldType(item.type) || item.type === "file") {
      return false;
    }
    if (target.type === "boolean") return item.type === "boolean";
    if (target.type === "list") return item.type === "list";
    if (target.type === "datetime") {
      return item.type === "datetime" || item.type === "text";
    }
    if (target.type === "time") {
      return item.type === "time" || item.type === "text";
    }
    if (target.type === "relation") {
      if (item.type === "text" || item.type === "dependencies") return true;
      if (item.type !== "relation") return false;
      const targetId = getEntityRelationTargetId(target);
      const itemTarget = getEntityRelationTargetId(item);
      return !targetId || !itemTarget || targetId === itemTarget;
    }
    if (target.type === "number") {
      return item.type === "number" || item.type === "text";
    }
    return true;
  });
}

function FromEntitySelects({
  targetField,
  sourceFields,
  entities,
  value,
  onChange,
  mapToOtherEntity,
  className,
}: {
  targetField: EntityField;
  sourceFields: EntityField[];
  entities: Entity[];
  value: string;
  onChange: (next: string) => void;
  mapToOtherEntity?: boolean;
  className?: string;
}) {
  const path = parseAutomationEntityPathRef(value);
  const relationFields = sourceFields.filter(
    (field) =>
      (mapToOtherEntity || field.id !== targetField.id) &&
      field.type === "relation" &&
      Boolean(getEntityRelationTargetId(field)),
  );
  const relationFieldId = path?.relationFieldId ?? "";
  const nestedFieldId = path?.fieldId ?? "";
  const relationField =
    relationFields.find((field) => field.id === relationFieldId) ?? null;
  const relatedEntityId = relationField
    ? getEntityRelationTargetId(relationField)
    : null;
  const relatedEntity = relatedEntityId
    ? (entities.find((entity) => entity.id === relatedEntityId) ?? null)
    : null;
  const nestedFields = relatedEntity
    ? compatibleNestedFields(targetField, relatedEntity.fields)
    : [];
  const relatedName = relatedEntity
    ? getEntityDisplayName(relatedEntity)
    : "связанной записи";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {relationFields.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Нет полей связи, из которых можно взять значение.
        </p>
      ) : (
        <SourceFieldSelect
          fields={relationFields}
          value={relationFieldId}
          placeholder="Поле связи"
          onChange={(nextRelationId) => {
            const nextRelation = relationFields.find(
              (field) => field.id === nextRelationId,
            );
            const nextTargetId = nextRelation
              ? getEntityRelationTargetId(nextRelation)
              : null;
            const nextEntity = nextTargetId
              ? (entities.find((entity) => entity.id === nextTargetId) ?? null)
              : null;
            const nextNested = nextEntity
              ? compatibleNestedFields(targetField, nextEntity.fields)
              : [];
            const keepNested =
              nestedFieldId &&
              nextNested.some((field) => field.id === nestedFieldId)
                ? nestedFieldId
                : (nextNested[0]?.id ?? "");
            onChange(toAutomationEntityPathRef(nextRelationId, keepNested));
          }}
        />
      )}
      {relationFieldId ? (
        nestedFields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            У связанной сущности нет подходящих полей.
          </p>
        ) : (
          <SourceFieldSelect
            fields={nestedFields}
            value={nestedFieldId}
            placeholder={`Поле · ${relatedName}`}
            entitySuffix={relatedName}
            onChange={(nextFieldId) => {
              onChange(toAutomationEntityPathRef(relationFieldId, nextFieldId));
            }}
          />
        )
      ) : null}
    </div>
  );
}

/**
 * Mode can be `custom` / `fromField` / `fromEntity` while the stored value is
 * still empty (user just switched type and has not filled the picker yet).
 */
function useEditorMode(value: string, field: EntityField) {
  const detected = detectMode(value, field);
  const [pendingMode, setPendingMode] = React.useState<ValueMode | null>(null);

  const mode = detected !== "empty" ? detected : (pendingMode ?? "empty");

  const selectMode = React.useCallback(
    (next: ValueMode, nextValue: string) => {
      const nextDetected = detectMode(nextValue, field);
      if (nextDetected === next) {
        setPendingMode(null);
      } else if (
        next === "custom" ||
        next === "fromField" ||
        next === "fromEntity"
      ) {
        setPendingMode(next);
      } else {
        setPendingMode(null);
      }
      return nextValue;
    },
    [field],
  );

  return { mode, selectMode };
}

function applyFromEntityMode(
  value: string,
  applyMode: (next: ValueMode, nextValue: string) => void,
) {
  applyMode("fromEntity", isAutomationEntityPathRef(value) ? value : "");
}

function applyFromFieldMode(
  value: string,
  applyMode: (next: ValueMode, nextValue: string) => void,
) {
  applyMode("fromField", isAutomationFieldRef(value) ? value : "");
}

/** Type-aware value picker for automation `setField` / relation actions. */
export function ActionValueEditor({
  field,
  value,
  onChange,
  sourceFields,
  entities,
  className,
  mapToOtherEntity,
  sourceEntityId,
  compact = false,
}: ActionValueEditorProps) {
  if (!field) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        Сначала выберите поле
      </p>
    );
  }

  if (isEntityComputedFieldType(field.type) || field.type === "file") {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        Это поле нельзя задать действием
      </p>
    );
  }

  return (
    <ActionValueEditorBody
      key={field.id}
      field={field}
      value={value}
      onChange={onChange}
      sourceFields={sourceFields}
      entities={entities}
      className={className}
      mapToOtherEntity={mapToOtherEntity}
      sourceEntityId={sourceEntityId}
      compact={compact}
    />
  );
}

function ActionValueEditorBody({
  field,
  value,
  onChange,
  sourceFields,
  entities,
  className,
  mapToOtherEntity,
  sourceEntityId,
  compact,
}: {
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
  sourceFields: EntityField[];
  entities: Entity[];
  className?: string;
  mapToOtherEntity?: boolean;
  sourceEntityId?: string;
  compact: boolean;
}) {
  const { mode, selectMode } = useEditorMode(value, field);
  const { fromFieldLabel, fromEntityLabel } = valueSourceLabels(
    mapToOtherEntity,
    compact,
  );
  const excludeSourceFieldId = mapToOtherEntity ? undefined : field.id;
  const shellClass = compact
    ? cn(
        "flex min-w-0 items-center gap-1 overflow-hidden",
        mode === "fromEntity" ? "flex-wrap" : "flex-nowrap",
        className,
      )
    : cn("flex flex-col gap-1.5", className);
  const modeClass = compact ? "h-8 w-[6.5rem] shrink-0" : undefined;
  const valueGrowClass = compact ? "min-w-0 flex-1 overflow-hidden" : undefined;
  const customModeLabel = (full: string, short: string) =>
    compact ? short : full;

  const applyMode = (next: ValueMode, nextValue: string) => {
    onChange(selectMode(next, nextValue));
  };

  const fromEntityPicker =
    mode === "fromEntity" ? (
      <FromEntitySelects
        targetField={field}
        sourceFields={sourceFields}
        entities={entities}
        value={value}
        onChange={onChange}
        mapToOtherEntity={mapToOtherEntity}
        className={compact ? "w-full basis-full" : undefined}
      />
    ) : null;

  if (field.type === "datetime") {
    const withTime = field.datetimeWithTime !== false;
    const { date, time } = splitDatetime(mode === "custom" ? value : "");
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={mode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "today", label: "Сегодня" },
            { value: "tomorrow", label: "Завтра" },
            ...(withTime ? [{ value: "now", label: "Сейчас" }] : []),
            {
              value: "custom",
              label: customModeLabel("Выбрать дату", "Дата"),
            },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "today") {
              applyMode("today", AUTOMATION_VALUE_TODAY);
            } else if (next === "tomorrow") {
              applyMode("tomorrow", AUTOMATION_VALUE_TOMORROW);
            } else if (next === "now") {
              applyMode("now", AUTOMATION_VALUE_NOW);
            } else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else if (next === "fromField") {
              applyFromFieldMode(value, applyMode);
            } else if (next === "fromEntity") {
              applyFromEntityMode(value, applyMode);
            }
          }}
        />
        {mode === "custom" ? (
          withTime ? (
            <div
              className={cn(
                "grid grid-cols-[1.25fr_1fr] gap-1.5",
                valueGrowClass,
              )}
            >
              <DatePicker
                value={date}
                className="h-8"
                aria-label="Дата"
                onChange={(next) => onChange(joinDatetime(next, time))}
              />
              <TimePicker
                value={time}
                className="h-8"
                aria-label="Время"
                onChange={(next) => onChange(joinDatetime(date, next))}
              />
            </div>
          ) : (
            <DatePicker
              value={date || value}
              className={cn("h-8", valueGrowClass)}
              aria-label="Дата"
              onChange={onChange}
            />
          )
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={sourceFields.filter(
              (item) => item.type === "datetime" || item.type === "text",
            )}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={mode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "now", label: "Сейчас" },
            {
              value: "custom",
              label: customModeLabel("Выбрать время", "Время"),
            },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "now") {
              applyMode("now", AUTOMATION_VALUE_TIME_NOW);
            } else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else if (next === "fromField") {
              applyFromFieldMode(value, applyMode);
            } else if (next === "fromEntity") {
              applyFromEntityMode(value, applyMode);
            }
          }}
        />
        {mode === "custom" ? (
          <TimePicker
            value={value}
            className={cn("h-8", valueGrowClass)}
            aria-label="Время"
            onChange={onChange}
          />
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={sourceFields.filter(
              (item) => item.type === "time" || item.type === "text",
            )}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "boolean") {
    const booleanMode =
      mode === "true" ||
      mode === "false" ||
      mode === "fromField" ||
      mode === "fromEntity" ||
      mode === "empty"
        ? mode
        : "empty";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={booleanMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "true") applyMode("true", "true");
            else if (next === "false") applyMode("false", "false");
            else if (next === "fromField") applyFromFieldMode(value, applyMode);
            else applyFromEntityMode(value, applyMode);
          }}
        />
        {mode === "true" || mode === "false" ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">Значение</span>
            <Switch
              checked={value === "true"}
              onCheckedChange={(checked) =>
                onChange(checked ? "true" : "false")
              }
            />
          </div>
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={sourceFields.filter((item) => item.type === "boolean")}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "list") {
    const listOptions = resolveEntityListFieldOptions(field, entities);
    const presentation = resolveEntityListFieldPresentation(field, entities);
    const listMode =
      mode === "fromField" || mode === "fromEntity" || mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={listMode}
          options={[
            { value: "empty", label: "Очистить" },
            {
              value: "custom",
              label: customModeLabel("Выбрать вариант", "Вариант"),
            },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else if (next === "fromField") {
              applyFromFieldMode(value, applyMode);
            } else {
              applyFromEntityMode(value, applyMode);
            }
          }}
        />
        {listMode === "custom" ? (
          <ListSelect
            options={listOptions}
            value={value}
            multiple={presentation.listMultiple}
            allowOther={field.listAllowOther && !presentation.listMultiple}
            showColors={presentation.listUseColors}
            size="sm"
            emptyLabel="Не выбрано"
            aria-label="Значение списка"
            className={cn(
              "h-8 min-w-0 rounded-md border-input font-normal",
              valueGrowClass,
            )}
            onChange={onChange}
          />
        ) : null}
        {listMode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={sourceFields.filter((item) => item.type === "list")}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = entities.find((entity) => entity.id === targetId) ?? null;
    const isUsers = targetId === SYSTEM_USERS_ENTITY_ID;
    const canLinkCurrentRecord =
      Boolean(mapToOtherEntity) &&
      Boolean(sourceEntityId) &&
      targetId === sourceEntityId;
    const sourceEntity = canLinkCurrentRecord
      ? (entities.find((entity) => entity.id === sourceEntityId) ?? null)
      : null;
    const sourceEntityName = sourceEntity
      ? getEntityDisplayName(sourceEntity)
      : "запись";
    const relationMode =
      mode === "currentUser" ||
      mode === "currentRecord" ||
      mode === "fromField" ||
      mode === "fromEntity" ||
      mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={relationMode}
          options={[
            { value: "empty", label: "Очистить" },
            ...(isUsers
              ? [
                  {
                    value: "currentUser",
                    label: customModeLabel("Текущий пользователь", "Я"),
                  },
                ]
              : []),
            ...(canLinkCurrentRecord
              ? [
                  {
                    value: "currentRecord",
                    label: customModeLabel(
                      `Текущая «${sourceEntityName}»`,
                      "Текущая",
                    ),
                  },
                ]
              : []),
            {
              value: "custom",
              label: customModeLabel("Выбрать запись", "Запись"),
            },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "currentUser") {
              applyMode("currentUser", AUTOMATION_VALUE_CURRENT_USER);
            } else if (next === "currentRecord") {
              applyMode("currentRecord", AUTOMATION_VALUE_CURRENT_RECORD);
            } else if (next === "custom") {
              applyMode(
                "custom",
                mode === "custom" &&
                  !isAutomationFieldRef(value) &&
                  !isAutomationEntityPathRef(value) &&
                  value !== AUTOMATION_VALUE_CURRENT_USER &&
                  value !== AUTOMATION_VALUE_CURRENT_RECORD
                  ? value
                  : "",
              );
            } else if (next === "fromField") {
              applyFromFieldMode(value, applyMode);
            } else {
              applyFromEntityMode(value, applyMode);
            }
          }}
        />
        {relationMode === "custom" ? (
          <RelationSelect
            options={getRelationRecordOptions(target)}
            value={
              isAutomationFieldRef(value) ||
              isAutomationEntityPathRef(value) ||
              value === AUTOMATION_VALUE_CURRENT_USER ||
              value === AUTOMATION_VALUE_CURRENT_RECORD
                ? ""
                : value
            }
            multiple={field.relationMultiple}
            placeholder="Не выбран"
            aria-label="Запись"
            className={cn("h-8", valueGrowClass)}
            onChange={onChange}
          />
        ) : null}
        {relationMode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={compatibleNestedFields(field, sourceFields)}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            entitySuffix={
              isUsers
                ? "пользователь"
                : target
                  ? getEntityDisplayName(target)
                  : undefined
            }
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "textarea") {
    const textMode =
      mode === "fromField" || mode === "fromEntity" || mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          value={textMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "custom", label: "Текст" },
            { value: "fromField", label: fromFieldLabel },
            { value: "fromEntity", label: fromEntityLabel },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else if (next === "fromField") {
              applyFromFieldMode(value, applyMode);
            } else {
              applyFromEntityMode(value, applyMode);
            }
          }}
        />
        {textMode === "custom" ? (
          compact ? (
            <Input
              className={cn("h-8", valueGrowClass)}
              placeholder="Значение"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <Textarea
              className="min-h-16 resize-none text-sm"
              placeholder="Значение"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : null}
        {textMode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={sourceFields}
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  const inputMode =
    field.type === "number"
      ? "decimal"
      : field.type === "phone"
        ? "tel"
        : field.type === "email"
          ? "email"
          : undefined;

  const textMode =
    mode === "fromField" || mode === "fromEntity" || mode === "empty"
      ? mode
      : "custom";

  return (
    <div className={shellClass}>
      <ModeSelect
        className={modeClass}
        value={textMode}
        options={[
          { value: "empty", label: "Очистить" },
          { value: "custom", label: "Значение" },
          { value: "fromField", label: fromFieldLabel },
          { value: "fromEntity", label: fromEntityLabel },
        ]}
        onChange={(next) => {
          if (next === "empty") applyMode("empty", "");
          else if (next === "custom") {
            applyMode("custom", mode === "custom" ? value : "");
          } else if (next === "fromField") {
            applyFromFieldMode(value, applyMode);
          } else {
            applyFromEntityMode(value, applyMode);
          }
        }}
      />
      {textMode === "custom" ? (
        <Input
          className={cn("h-8", valueGrowClass)}
          type={field.type === "url" ? "url" : "text"}
          inputMode={inputMode}
          placeholder="Значение"
          value={value}
          onChange={(event) =>
            onChange(
              field.type === "number"
                ? normalizeEntityDecimalInput(event.target.value)
                : event.target.value,
            )
          }
        />
      ) : null}
      {textMode === "fromField" ? (
        <SourceFieldSelect
          className={valueGrowClass}
          fields={sourceFields}
          value={fieldRefId(value)}
          excludeFieldId={excludeSourceFieldId}
          onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
        />
      ) : null}
      {fromEntityPicker}
    </div>
  );
}
