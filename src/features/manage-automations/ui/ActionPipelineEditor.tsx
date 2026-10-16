import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AUTOMATION_ACTION_KIND_LABELS,
  AUTOMATION_ACTION_KINDS,
  defaultAutomationAction,
  type AutomationAction,
  type AutomationActionKind,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  isEntityComputedFieldType,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { ActionValueEditor } from "./ActionValueEditor";

type ActionPipelineEditorProps = {
  actions: AutomationAction[];
  onChange: (actions: AutomationAction[]) => void;
  entities: Entity[];
  sourceEntity: Entity | null;
  className?: string;
};

export function ActionPipelineEditor({
  actions,
  onChange,
  entities,
  sourceEntity,
  className,
}: ActionPipelineEditorProps) {
  function update(index: number, action: AutomationAction) {
    const next = [...actions];
    next[index] = action;
    onChange(next);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {actions.map((action, index) => (
        <div
          key={action.id}
          className="rounded-md border border-border/70 bg-background p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <Select
              value={action.kind}
              onValueChange={(next) => {
                if (
                  next != null &&
                  (AUTOMATION_ACTION_KINDS as readonly string[]).includes(
                    String(next),
                  )
                ) {
                  update(
                    index,
                    defaultAutomationAction(
                      String(next) as AutomationActionKind,
                    ),
                  );
                }
              }}
            >
              <SelectTrigger size="sm" className="min-w-0 flex-1">
                <SelectValue>
                  {AUTOMATION_ACTION_KIND_LABELS[action.kind]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_ACTION_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {AUTOMATION_ACTION_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить действие"
              onClick={() => onChange(actions.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <ActionFields
            action={action}
            entities={entities}
            sourceEntity={sourceEntity}
            onChange={(next) => update(index, next)}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs"
        onClick={() =>
          onChange([...actions, defaultAutomationAction("setField")])
        }
      >
        <Plus className="size-3.5" />
        Действие
      </Button>
    </div>
  );
}

function ActionFields({
  action,
  entities,
  sourceEntity,
  onChange,
}: {
  action: AutomationAction;
  entities: Entity[];
  sourceEntity: Entity | null;
  onChange: (action: AutomationAction) => void;
}) {
  const fields = (sourceEntity?.fields ?? []).filter(
    (field) => !isEntityComputedFieldType(field.type),
  );

  if (action.kind === "setField" || action.kind === "setFieldPrevious") {
    const selected =
      fields.find((field) => field.id === action.fieldId) ?? null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <FieldSelect
          fields={fields.filter(
            (field) =>
              action.kind === "setFieldPrevious" || field.type !== "file",
          )}
          value={action.fieldId}
          placeholder="Поле"
          onChange={(fieldId) => {
            if (action.kind === "setField") {
              onChange({ ...action, fieldId, value: "" });
            } else {
              onChange({ ...action, fieldId });
            }
          }}
        />
        {action.kind === "setField" ? (
          <ActionValueEditor
            field={selected}
            value={action.value}
            sourceFields={sourceEntity?.fields ?? []}
            entities={entities}
            onChange={(value) => onChange({ ...action, value })}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Вернёт значение поля до изменения
          </p>
        )}
      </div>
    );
  }

  if (
    action.kind === "createRecord" ||
    action.kind === "createRecordsFromMapping"
  ) {
    const target =
      entities.find((entity) => entity.id === action.entityId) ?? null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <EntitySelect
          entities={entities}
          value={action.entityId}
          onChange={(entityId) => onChange({ ...action, entityId })}
        />
        {action.kind === "createRecordsFromMapping" ? (
          <>
            <FieldSelect
              fields={fields.filter(
                (field) =>
                  field.type === "relation" || field.type === "dependencies",
              )}
              value={action.fanOutFieldId}
              placeholder="Поле со списком записей"
              onChange={(fanOutFieldId) =>
                onChange({ ...action, fanOutFieldId })
              }
            />
            <FieldSelect
              fields={target?.fields ?? []}
              value={action.fanOutTargetFieldId}
              placeholder="Поле связи в новой записи"
              onChange={(fanOutTargetFieldId) =>
                onChange({ ...action, fanOutTargetFieldId })
              }
            />
          </>
        ) : null}
        <MappingsEditor
          mappings={action.mappings}
          targetFields={target?.fields ?? []}
          sourceFields={sourceEntity?.fields ?? []}
          entities={entities}
          onChange={(mappings) => onChange({ ...action, mappings })}
        />
      </div>
    );
  }

  if (action.kind === "setRelation" || action.kind === "addRelation") {
    const selected =
      fields.find((field) => field.id === action.fieldId) ?? null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <FieldSelect
          fields={fields.filter(
            (field) =>
              field.type === "relation" || field.type === "dependencies",
          )}
          value={action.fieldId}
          placeholder="Поле связи"
          onChange={(fieldId) => onChange({ ...action, fieldId, value: "" })}
        />
        <ActionValueEditor
          field={selected}
          value={action.value}
          sourceFields={sourceEntity?.fields ?? []}
          entities={entities}
          onChange={(value) => onChange({ ...action, value })}
        />
      </div>
    );
  }

  if (action.kind === "startProcess") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <Input
          className="h-8"
          placeholder="ID процесса"
          value={action.processId}
          onChange={(event) =>
            onChange({ ...action, processId: event.target.value })
          }
        />
      </div>
    );
  }

  if (action.kind === "notify") {
    return (
      <Input
        className="mt-2 h-8"
        placeholder="Текст уведомления"
        value={action.message}
        onChange={(event) =>
          onChange({ ...action, message: event.target.value })
        }
      />
    );
  }

  if (action.kind === "requireFields") {
    return (
      <RequireFieldsEditor
        fields={fields}
        selectedIds={action.fieldIds}
        onChange={(fieldIds) => onChange({ ...action, fieldIds })}
      />
    );
  }

  if (action.kind === "attachToFolder") {
    return (
      <div className="mt-2">
        <FieldSelect
          fields={fields.filter((field) => field.type === "file")}
          value={action.fileFieldId}
          placeholder="Поле файла"
          onChange={(fileFieldId) => onChange({ ...action, fileFieldId })}
        />
      </div>
    );
  }

  return null;
}

function EntitySelect({
  entities,
  value,
  onChange,
}: {
  entities: Entity[];
  value: string;
  onChange: (entityId: string) => void;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>
          {entities.find((item) => item.id === value)?.name || "Сущность"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {entities.map((entity) => (
          <SelectItem key={entity.id} value={entity.id}>
            {entity.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <SelectTrigger size="sm" className="h-8">
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

function RequireFieldsEditor({
  fields,
  selectedIds,
  onChange,
}: {
  fields: EntityField[];
  selectedIds: string[];
  onChange: (fieldIds: string[]) => void;
}) {
  if (fields.length === 0) {
    return <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">Обязательные поля</p>
      <div className="flex flex-wrap gap-1">
        {fields.map((field) => {
          const active = selectedIds.includes(field.id);
          return (
            <button
              key={field.id}
              type="button"
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                onChange(
                  active
                    ? selectedIds.filter((id) => id !== field.id)
                    : [...selectedIds, field.id],
                );
              }}
            >
              {getEntityFieldDisplayName(field)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MappingsEditor({
  mappings,
  targetFields,
  sourceFields,
  entities,
  onChange,
}: {
  mappings: Array<{ targetFieldId: string; source: string }>;
  targetFields: EntityField[];
  sourceFields: EntityField[];
  entities: Entity[];
  onChange: (
    mappings: Array<{ targetFieldId: string; source: string }>,
  ) => void;
}) {
  const writable = targetFields.filter(
    (field) => !isEntityComputedFieldType(field.type) && field.type !== "file",
  );

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">Заполнить поля</p>
      {mappings.map((mapping, index) => {
        const target =
          writable.find((field) => field.id === mapping.targetFieldId) ?? null;
        return (
          <div
            key={`${mapping.targetFieldId}-${index}`}
            className="flex flex-col gap-1.5 rounded-md border border-border/50 p-2"
          >
            <div className="flex items-center gap-1.5">
              <FieldSelect
                fields={writable}
                value={mapping.targetFieldId}
                placeholder="Поле новой записи"
                onChange={(targetFieldId) => {
                  const next = [...mappings];
                  next[index] = { targetFieldId, source: "" };
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Удалить маппинг"
                onClick={() => onChange(mappings.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <ActionValueEditor
              field={target}
              value={mapping.source}
              sourceFields={sourceFields}
              entities={entities}
              onChange={(source) => {
                const next = [...mappings];
                next[index] = { ...mapping, source };
                onChange(next);
              }}
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs"
        disabled={writable.length === 0}
        onClick={() =>
          onChange([
            ...mappings,
            { targetFieldId: writable[0]?.id ?? "", source: "" },
          ])
        }
      >
        <Plus className="size-3.5" />
        Поле
      </Button>
    </div>
  );
}
