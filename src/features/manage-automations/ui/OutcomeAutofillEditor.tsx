import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  createAutomationActionId,
  normalizeAutomationOutcomeFieldAccess,
  type AutomationAction,
  type AutomationOutcomeFieldAccess,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  isEntityComputedFieldType,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { ActionValueEditor } from "./ActionValueEditor";

type OutcomeAutofillEditorProps = {
  actions: AutomationAction[];
  onChange: (actions: AutomationAction[]) => void;
  fieldAccess: AutomationOutcomeFieldAccess;
  onFieldAccessChange: (next: AutomationOutcomeFieldAccess) => void;
  sourceEntity: Entity;
  entities: Entity[];
  hasRecordsTab: boolean;
  className?: string;
  /** Soft hint under the title. */
  hint?: string;
  /** Fields managed elsewhere (e.g. process stage via «Перейти на стадию»). */
  excludeFieldIds?: readonly string[];
};

function isSetField(
  action: AutomationAction,
): action is Extract<AutomationAction, { kind: "setField" }> {
  return action.kind === "setField";
}

function toggleIdList(ids: string[], fieldId: string, enabled: boolean) {
  if (enabled) {
    return ids.includes(fieldId) ? ids : [...ids, fieldId];
  }
  return ids.filter((id) => id !== fieldId);
}

function FieldFlagCheckbox({
  checked,
  disabled,
  label,
  title,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      title={title}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground",
        checked && !disabled && "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="size-3 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * Field writes for an outcome: set value + same flags as «Поля формы»
 * (e.g. duplicate into «Записи» via комм.).
 */
export function OutcomeAutofillEditor({
  actions,
  onChange,
  fieldAccess,
  onFieldAccessChange,
  sourceEntity,
  entities,
  hasRecordsTab,
  className,
  hint = "Значение запишется в поле; «комм.» — ещё и во вкладку «Записи»",
  excludeFieldIds = [],
}: OutcomeAutofillEditorProps) {
  const access = normalizeAutomationOutcomeFieldAccess(fieldAccess);
  const excluded = new Set(excludeFieldIds.filter(Boolean));
  const writable = sourceEntity.fields.filter(
    (field) =>
      !isEntityComputedFieldType(field.type) &&
      field.type !== "file" &&
      !excluded.has(field.id),
  );
  const setFields = actions.filter(isSetField);
  const otherActions = actions.filter((action) => !isSetField(action));

  function updateSetFields(
    nextSetFields: Extract<AutomationAction, { kind: "setField" }>[],
    commentFieldIds?: string[],
  ) {
    onChange([...nextSetFields, ...otherActions]);
    if (commentFieldIds) {
      onFieldAccessChange({ ...access, commentFieldIds });
    }
  }

  function setComment(fieldId: string, enabled: boolean) {
    onFieldAccessChange({
      ...access,
      commentFieldIds: toggleIdList(access.commentFieldIds, fieldId, enabled),
    });
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background p-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs font-medium">Управление полями</p>
        {hint ? (
          <p className="text-[10px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>

      {setFields.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {setFields.map((action, index) => {
            const selected =
              writable.find((field) => field.id === action.fieldId) ?? null;
            const toComments = access.commentFieldIds.includes(action.fieldId);
            return (
              <div
                key={action.id}
                className="flex flex-col gap-1.5 rounded-md border border-border/50 p-2"
              >
                <div className="flex items-center gap-1.5">
                  <FieldSelect
                    fields={writable}
                    value={action.fieldId}
                    placeholder="Поле"
                    onChange={(fieldId) => {
                      const prevId = action.fieldId;
                      const next = [...setFields];
                      next[index] = { ...action, fieldId, value: "" };
                      let commentFieldIds = access.commentFieldIds.filter(
                        (id) => id !== prevId,
                      );
                      if (toComments && fieldId) {
                        commentFieldIds = toggleIdList(
                          commentFieldIds,
                          fieldId,
                          true,
                        );
                      }
                      updateSetFields(next, commentFieldIds);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Удалить поле"
                    onClick={() => {
                      const next = setFields.filter((_, i) => i !== index);
                      updateSetFields(
                        next,
                        access.commentFieldIds.filter(
                          (id) => id !== action.fieldId,
                        ),
                      );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <ActionValueEditor
                  field={selected}
                  value={action.value}
                  sourceFields={sourceEntity.fields}
                  entities={entities}
                  onChange={(value) => {
                    const next = [...setFields];
                    next[index] = { ...action, value };
                    onChange([...next, ...otherActions]);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <FieldFlagCheckbox
                    checked
                    disabled
                    label="запись"
                    title="Значение всегда записывается в поле сущности"
                    onCheckedChange={() => undefined}
                  />
                  <FieldFlagCheckbox
                    checked={toComments}
                    disabled={!hasRecordsTab || !action.fieldId}
                    label="комм."
                    title={
                      hasRecordsTab
                        ? "Дублировать значение во вкладку «Записи»"
                        : "Нет вкладки «Записи» у этой сущности"
                    }
                    onCheckedChange={(checked) => {
                      if (!action.fieldId) return;
                      setComment(action.fieldId, checked);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 gap-1 self-start px-2 text-xs"
        disabled={writable.length === 0}
        onClick={() =>
          updateSetFields([
            ...setFields,
            {
              id: createAutomationActionId(),
              kind: "setField",
              fieldId: writable[0]?.id ?? "",
              value: "",
            },
          ])
        }
      >
        <Plus className="size-3.5" />
        Поле
      </Button>
    </div>
  );
}

function FieldSelect({
  fields,
  value,
  onChange,
  placeholder = "Поле",
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  placeholder?: string;
}) {
  const selected = fields.find((field) => field.id === value);
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8 min-w-0 flex-1">
        <SelectValue>
          {selected ? getEntityFieldDisplayName(selected) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {fields.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            {getEntityFieldDisplayName(field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
