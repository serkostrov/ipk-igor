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
  describeAutomationAction,
  type AutomationAction,
  type AutomationActionKind,
} from "@/entities/automation";
import { getEntityFieldDisplayName, type Entity } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

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
          className="rounded-md border border-border/70 bg-background p-2"
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
          <p className="mt-1 text-[11px] text-muted-foreground">
            {describeAutomationAction(action)}
          </p>
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
  const fields = sourceEntity?.fields ?? [];

  if (action.kind === "setField" || action.kind === "setFieldPrevious") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <FieldSelect
          fields={fields}
          value={action.fieldId}
          onChange={(fieldId) => onChange({ ...action, fieldId })}
        />
        {action.kind === "setField" ? (
          <Input
            className="h-8"
            placeholder="Значение или {{fieldId}}"
            value={action.value}
            onChange={(event) =>
              onChange({ ...action, value: event.target.value })
            }
          />
        ) : null}
      </div>
    );
  }

  if (
    action.kind === "createRecord" ||
    action.kind === "createRecordsFromMapping"
  ) {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <Select
          value={action.entityId}
          onValueChange={(next) => {
            if (next != null) onChange({ ...action, entityId: String(next) });
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue>
              {entities.find((item) => item.id === action.entityId)?.name ||
                "Сущность"}
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
        {action.kind === "createRecordsFromMapping" ? (
          <>
            <FieldSelect
              fields={fields}
              value={action.fanOutFieldId}
              label="Fan-out поле"
              onChange={(fanOutFieldId) =>
                onChange({ ...action, fanOutFieldId })
              }
            />
            <Input
              className="h-8"
              placeholder="Целевое поле fan-out id"
              value={action.fanOutTargetFieldId}
              onChange={(event) =>
                onChange({
                  ...action,
                  fanOutTargetFieldId: event.target.value,
                })
              }
            />
          </>
        ) : null}
        <Input
          className="h-8"
          placeholder="Маппинг: targetField={{sourceField}} (через ;)"
          value={action.mappings
            .map((item) => `${item.targetFieldId}=${item.source}`)
            .join("; ")}
          onChange={(event) => {
            const mappings = event.target.value
              .split(";")
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part) => {
                const [targetFieldId, ...rest] = part.split("=");
                return {
                  targetFieldId: (targetFieldId ?? "").trim(),
                  source: rest.join("=").trim(),
                };
              })
              .filter((item) => item.targetFieldId);
            onChange({ ...action, mappings });
          }}
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
        <Input
          className="h-8"
          placeholder="Поле стадии на цели (enterFieldId)"
          value={action.enterFieldId ?? ""}
          onChange={(event) =>
            onChange({ ...action, enterFieldId: event.target.value })
          }
        />
        <Input
          className="h-8"
          placeholder="Значение стадии (enterOptionId)"
          value={action.enterOptionId ?? ""}
          onChange={(event) =>
            onChange({ ...action, enterOptionId: event.target.value })
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
      <Input
        className="mt-2 h-8"
        placeholder="ID полей через запятую"
        value={action.fieldIds.join(", ")}
        onChange={(event) =>
          onChange({
            ...action,
            fieldIds: event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />
    );
  }

  return null;
}

function FieldSelect({
  fields,
  value,
  onChange,
  label,
}: {
  fields: Entity["fields"];
  value: string;
  onChange: (fieldId: string) => void;
  label?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm">
        <SelectValue>
          {label && !value
            ? label
            : fields.find((field) => field.id === value)
              ? getEntityFieldDisplayName(
                  fields.find((field) => field.id === value)!,
                )
              : label || "Поле"}
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
