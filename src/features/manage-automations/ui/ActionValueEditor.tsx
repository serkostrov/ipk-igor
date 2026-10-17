import * as React from "react";
import {
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
};

type ValueMode =
  | "empty"
  | "today"
  | "tomorrow"
  | "now"
  | "custom"
  | "true"
  | "false"
  | "currentUser"
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
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  const current =
    options.find((item) => item.value === value)?.label ?? "Выберите";
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8 w-full min-w-0">
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent searchable={false} align="start" className="min-w-[12rem]">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
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
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  excludeFieldId?: string;
  placeholder?: string;
}) {
  const options = fields.filter(
    (field) =>
      field.id !== excludeFieldId &&
      !isEntityComputedFieldType(field.type) &&
      field.type !== "file",
  );
  const selected = options.find((field) => field.id === value);
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>
          {selected ? getEntityFieldDisplayName(selected) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options.map((field) => (
          <SelectItem
            key={field.id}
            value={field.id}
            label={getEntityFieldDisplayName(field)}
          >
            {getEntityFieldDisplayName(field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
}: {
  targetField: EntityField;
  sourceFields: EntityField[];
  entities: Entity[];
  value: string;
  onChange: (next: string) => void;
}) {
  const path = parseAutomationEntityPathRef(value);
  const relationFields = sourceFields.filter(
    (field) =>
      field.id !== targetField.id &&
      field.type === "relation" &&
      Boolean(getEntityRelationTargetId(field)),
  );
  const relationFieldId = path?.relationFieldId ?? "";
  const nestedFieldId = path?.fieldId ?? "";
  const relationField =
    relationFields.find((field) => field.id === relationFieldId) ?? null;
  const targetEntityId = relationField
    ? getEntityRelationTargetId(relationField)
    : null;
  const targetEntity = targetEntityId
    ? (entities.find((entity) => entity.id === targetEntityId) ?? null)
    : null;
  const nestedFields = targetEntity
    ? compatibleNestedFields(targetField, targetEntity.fields)
    : [];

  return (
    <div className="flex flex-col gap-1.5">
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
            placeholder="Поле связанной записи"
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
}: {
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
  sourceFields: EntityField[];
  entities: Entity[];
  className?: string;
}) {
  const { mode, selectMode } = useEditorMode(value, field);

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
      />
    ) : null;

  if (field.type === "datetime") {
    const withTime = field.datetimeWithTime !== false;
    const { date, time } = splitDatetime(mode === "custom" ? value : "");
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={mode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "today", label: "Сегодня" },
            { value: "tomorrow", label: "Завтра" },
            ...(withTime ? [{ value: "now", label: "Сейчас" }] : []),
            { value: "custom", label: "Выбрать дату" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
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
            <div className="grid grid-cols-[1.25fr_1fr] gap-1.5">
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
              className="h-8"
              aria-label="Дата"
              onChange={onChange}
            />
          )
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields.filter(
              (item) => item.type === "datetime" || item.type === "text",
            )}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={mode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "now", label: "Сейчас" },
            { value: "custom", label: "Выбрать время" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
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
            className="h-8"
            aria-label="Время"
            onChange={onChange}
          />
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields.filter(
              (item) => item.type === "time" || item.type === "text",
            )}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
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
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={booleanMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
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
            fields={sourceFields.filter((item) => item.type === "boolean")}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
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
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={listMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "custom", label: "Выбрать вариант" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
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
            className="h-8 rounded-md border-input font-normal"
            onChange={onChange}
          />
        ) : null}
        {listMode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields.filter((item) => item.type === "list")}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
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
    const relationMode =
      mode === "currentUser" ||
      mode === "fromField" ||
      mode === "fromEntity" ||
      mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={relationMode}
          options={[
            { value: "empty", label: "Очистить" },
            ...(isUsers
              ? [{ value: "currentUser", label: "Текущий пользователь" }]
              : []),
            { value: "custom", label: "Выбрать запись" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "currentUser") {
              applyMode("currentUser", AUTOMATION_VALUE_CURRENT_USER);
            } else if (next === "custom") {
              applyMode(
                "custom",
                mode === "custom" &&
                  !isAutomationFieldRef(value) &&
                  !isAutomationEntityPathRef(value)
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
              value === AUTOMATION_VALUE_CURRENT_USER
                ? ""
                : value
            }
            multiple={field.relationMultiple}
            placeholder="Не выбран"
            aria-label="Запись"
            className="h-8"
            onChange={onChange}
          />
        ) : null}
        {relationMode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields.filter(
              (item) =>
                item.type === "relation" ||
                item.type === "dependencies" ||
                item.type === "text",
            )}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
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
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={textMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "custom", label: "Текст" },
            { value: "fromField", label: "Из другого поля" },
            { value: "fromEntity", label: "Из другой сущности" },
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
          <Textarea
            className="min-h-16 resize-none text-sm"
            placeholder="Значение"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}
        {textMode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <ModeSelect
        value={textMode}
        options={[
          { value: "empty", label: "Очистить" },
          { value: "custom", label: "Значение" },
          { value: "fromField", label: "Из другого поля" },
          { value: "fromEntity", label: "Из другой сущности" },
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
          className="h-8"
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
          fields={sourceFields}
          value={fieldRefId(value)}
          excludeFieldId={field.id}
          onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
        />
      ) : null}
      {fromEntityPicker}
    </div>
  );
}
