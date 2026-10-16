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
  type AutomationAction,
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
  sourceEntity: Entity;
  entities: Entity[];
  className?: string;
  /** Soft hint under the title (autofill step vs button outcome). */
  hint?: string;
};

function isSetField(
  action: AutomationAction,
): action is Extract<AutomationAction, { kind: "setField" }> {
  return action.kind === "setField";
}

/** First-class field autofill rows (backed by `setField` actions). */
export function OutcomeAutofillEditor({
  actions,
  onChange,
  sourceEntity,
  entities,
  className,
  hint = "Значения запишутся в поля записи при срабатывании результата",
}: OutcomeAutofillEditorProps) {
  const writable = sourceEntity.fields.filter(
    (field) => !isEntityComputedFieldType(field.type) && field.type !== "file",
  );
  const setFields = actions.filter(isSetField);
  const otherActions = actions.filter((action) => !isSetField(action));

  function updateSetFields(
    nextSetFields: Extract<AutomationAction, { kind: "setField" }>[],
  ) {
    onChange([...nextSetFields, ...otherActions]);
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background p-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs font-medium">Автозаполнение полей</p>
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
                      const next = [...setFields];
                      next[index] = { ...action, fieldId, value: "" };
                      updateSetFields(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Удалить автозаполнение"
                    onClick={() =>
                      updateSetFields(setFields.filter((_, i) => i !== index))
                    }
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
                    updateSetFields(next);
                  }}
                />
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
