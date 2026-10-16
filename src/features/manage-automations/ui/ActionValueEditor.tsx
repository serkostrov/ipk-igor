import {
  AUTOMATION_VALUE_CURRENT_USER,
  AUTOMATION_VALUE_NOW,
  AUTOMATION_VALUE_TIME_NOW,
  AUTOMATION_VALUE_TODAY,
  AUTOMATION_VALUE_TOMORROW,
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
  | "fromField";

function isFieldRef(value: string) {
  return /^\{\{[^}]+\}\}$/.test(value.trim());
}

function fieldRefId(value: string) {
  const match = value.trim().match(/^\{\{([^}]+)\}\}$/);
  return match?.[1]?.trim() ?? "";
}

function toFieldRef(fieldId: string) {
  return fieldId ? `{{${fieldId}}}` : "";
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
  if (isFieldRef(raw)) return "fromField";
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
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent>
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
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  excludeFieldId?: string;
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
          {selected ? getEntityFieldDisplayName(selected) : "Выберите поле"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            {getEntityFieldDisplayName(field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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

  const mode = detectMode(value, field);

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
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "today") onChange(AUTOMATION_VALUE_TODAY);
            else if (next === "tomorrow") onChange(AUTOMATION_VALUE_TOMORROW);
            else if (next === "now") onChange(AUTOMATION_VALUE_NOW);
            else if (next === "custom") onChange(date || "");
            else if (next === "fromField") {
              onChange(toFieldRef(fieldRefId(value)));
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
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
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
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "now") onChange(AUTOMATION_VALUE_TIME_NOW);
            else if (next === "custom") {
              onChange(mode === "custom" ? value : "");
            } else if (next === "fromField") {
              onChange(toFieldRef(fieldRefId(value)));
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
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={
            mode === "true" ||
            mode === "false" ||
            mode === "fromField" ||
            mode === "empty"
              ? mode
              : "empty"
          }
          options={[
            { value: "empty", label: "Очистить" },
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
            { value: "fromField", label: "Из другого поля" },
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "true") onChange("true");
            else if (next === "false") onChange("false");
            else onChange(toFieldRef(fieldRefId(value)));
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
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "list") {
    const listOptions = resolveEntityListFieldOptions(field, entities);
    const presentation = resolveEntityListFieldPresentation(field, entities);
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={
            mode === "fromField"
              ? "fromField"
              : mode === "empty"
                ? "empty"
                : "custom"
          }
          options={[
            { value: "empty", label: "Очистить" },
            { value: "custom", label: "Выбрать вариант" },
            { value: "fromField", label: "Из другого поля" },
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "custom") {
              onChange(mode === "custom" ? value : "");
            } else onChange(toFieldRef(fieldRefId(value)));
          }}
        />
        {mode !== "fromField" && mode !== "empty" ? (
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
        {mode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields.filter((item) => item.type === "list")}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = entities.find((entity) => entity.id === targetId) ?? null;
    const isUsers = targetId === SYSTEM_USERS_ENTITY_ID;
    const relationMode =
      mode === "currentUser" || mode === "fromField" || mode === "empty"
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
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "currentUser") {
              onChange(AUTOMATION_VALUE_CURRENT_USER);
            } else if (next === "custom") {
              onChange(mode === "custom" && !isFieldRef(value) ? value : "");
            } else onChange(toFieldRef(fieldRefId(value)));
          }}
        />
        {relationMode === "custom" ? (
          <RelationSelect
            options={getRelationRecordOptions(target)}
            value={
              isFieldRef(value) || value === AUTOMATION_VALUE_CURRENT_USER
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
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <ModeSelect
          value={
            mode === "fromField"
              ? "fromField"
              : mode === "empty"
                ? "empty"
                : "custom"
          }
          options={[
            { value: "empty", label: "Очистить" },
            { value: "custom", label: "Текст" },
            { value: "fromField", label: "Из другого поля" },
          ]}
          onChange={(next) => {
            if (next === "empty") onChange("");
            else if (next === "custom") {
              onChange(mode === "custom" ? value : "");
            } else onChange(toFieldRef(fieldRefId(value)));
          }}
        />
        {mode !== "fromField" && mode !== "empty" ? (
          <Textarea
            className="min-h-16 resize-none text-sm"
            placeholder="Значение"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            fields={sourceFields}
            value={fieldRefId(value)}
            excludeFieldId={field.id}
            onChange={(fieldId) => onChange(toFieldRef(fieldId))}
          />
        ) : null}
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

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <ModeSelect
        value={
          mode === "fromField"
            ? "fromField"
            : mode === "empty"
              ? "empty"
              : "custom"
        }
        options={[
          { value: "empty", label: "Очистить" },
          { value: "custom", label: "Значение" },
          { value: "fromField", label: "Из другого поля" },
        ]}
        onChange={(next) => {
          if (next === "empty") onChange("");
          else if (next === "custom") {
            onChange(mode === "custom" ? value : "");
          } else onChange(toFieldRef(fieldRefId(value)));
        }}
      />
      {mode !== "fromField" && mode !== "empty" ? (
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
      {mode === "fromField" ? (
        <SourceFieldSelect
          fields={sourceFields}
          value={fieldRefId(value)}
          excludeFieldId={field.id}
          onChange={(fieldId) => onChange(toFieldRef(fieldId))}
        />
      ) : null}
    </div>
  );
}
