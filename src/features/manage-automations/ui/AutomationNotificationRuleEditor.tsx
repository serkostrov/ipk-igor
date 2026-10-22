import { useMemo, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AUTOMATION_NOTIFICATION_EVENT_OPTIONS,
  AssigneeEditor,
  type AutomationNotificationEvent,
  type AutomationNotificationRule,
} from "@/entities/automation";
import type { Entity } from "@/entities/entity";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { renderTemplateText } from "../lib/template-text";
import { TemplateFieldInput } from "./TemplateFieldInput";

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}

export function AutomationNotificationRuleEditor({
  rule,
  entity,
  onSave,
  onDelete,
}: {
  rule: AutomationNotificationRule;
  entity: Entity;
  onSave: (rule: AutomationNotificationRule) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(rule);
  const [saving, setSaving] = useState(false);

  const eventOption =
    AUTOMATION_NOTIFICATION_EVENT_OPTIONS.find(
      (item) => item.value === draft.event,
    ) ?? AUTOMATION_NOTIFICATION_EVENT_OPTIONS[0]!;

  const dirty =
    draft.event !== rule.event ||
    draft.messageTemplate !== rule.messageTemplate ||
    JSON.stringify(draft.recipients) !== JSON.stringify(rule.recipients) ||
    JSON.stringify(draft.conditions) !== JSON.stringify(rule.conditions);

  const previewValues = entity.records[0]?.values;
  const previewMessage = useMemo(
    () =>
      renderTemplateText(
        draft.messageTemplate,
        previewValues ?? {},
        "Текст уведомления",
      ),
    [draft.messageTemplate, previewValues],
  );

  async function handleSave() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      await onSave(draft);
      toast.success("Правило уведомления сохранено");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось сохранить уведомление";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field title="Когда">
            <Select
              value={draft.event}
              onValueChange={(next) => {
                if (
                  next === "assigned" ||
                  next === "completed" ||
                  next === "overdue"
                ) {
                  setDraft((prev) => ({
                    ...prev,
                    event: next as AutomationNotificationEvent,
                  }));
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{eventOption.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_NOTIFICATION_EVENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-5 shrink-0 text-destructive"
          aria-label="Удалить правило"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Field title="Кому">
        <AssigneeEditor
          mode="recipient"
          value={draft.recipients}
          fields={entity.fields}
          onChange={(recipients) =>
            setDraft((prev) => ({ ...prev, recipients }))
          }
          renderConditions={({ value, onChange }) => (
            <ConditionGroupBuilder
              entity={entity}
              value={value}
              onChange={onChange}
            />
          )}
        />
      </Field>

      <TemplateFieldInput
        id={`notify-message-${draft.id}`}
        title="Текст"
        value={draft.messageTemplate}
        placeholder="Текст уведомления"
        fields={entity.fields}
        multiline
        onChange={(messageTemplate) =>
          setDraft((prev) => ({ ...prev, messageTemplate }))
        }
      />

      {draft.messageTemplate.trim() ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Превью
          </p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
            {previewMessage || "—"}
          </p>
        </div>
      ) : null}

      <Field title="Условия">
        <ConditionGroupBuilder
          entity={entity}
          value={draft.conditions}
          onChange={(conditions) =>
            setDraft((prev) => ({ ...prev, conditions }))
          }
        />
      </Field>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-[11px] text-muted-foreground">
          {dirty ? "Есть несохранённые изменения" : "Сохранено"}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
