import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AssigneeEditor,
  type AutomationAssigneeResolver,
} from "@/entities/automation";
import { ConditionGroupBuilder } from "@/features/manage-automations/ui/ConditionGroupBuilder";
import {
  NOTIFICATION_TRIGGER_KIND_LABELS,
  describeNotificationTrigger,
  renderNotificationTemplate,
  type NotificationRule,
  type NotificationTriggerKind,
} from "@/entities/notification";
import { getEntityFieldDisplayName, type Entity } from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const TRIGGER_KINDS = Object.keys(
  NOTIFICATION_TRIGGER_KIND_LABELS,
) as NotificationTriggerKind[];

function needsField(kind: NotificationTriggerKind) {
  return (
    kind === "fieldEnter" || kind === "fieldLeave" || kind === "fieldTransition"
  );
}

export function NotificationRuleEditor({
  rule,
  entities,
  onSave,
  onDelete,
  onTest,
}: {
  rule: NotificationRule;
  entities: Entity[];
  onSave: (rule: NotificationRule) => void;
  onDelete: () => void;
  onTest?: (rule: NotificationRule) => void;
}) {
  const [draft, setDraft] = useState(rule);
  const entity = entities.find((item) => item.id === draft.entityId) ?? null;
  const listFields = useMemo(
    () => (entity?.fields ?? []).filter((field) => field.type === "list"),
    [entity],
  );
  const triggerField = listFields.find((field) => field.id === draft.fieldId);
  const previewValues = entity?.records[0]?.values ?? {};
  const previewTitle = renderNotificationTemplate(
    draft.titleTemplate,
    previewValues,
    draft.name,
  );
  const previewMessage = renderNotificationTemplate(
    draft.messageTemplate,
    previewValues,
    previewTitle,
  );

  function patch(partial: Partial<NotificationRule>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-xs">Название</Label>
          <Input
            className="mt-1"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
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

      <SettingSwitch
        id={`nr-enabled-${draft.id}`}
        checked={draft.enabled}
        onCheckedChange={(enabled) => patch({ enabled })}
        title="Включено"
        description="Выключенные правила не срабатывают"
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Сущность</Label>
        <Select
          value={draft.entityId}
          onValueChange={(next) => {
            if (next == null) return;
            patch({
              entityId: String(next),
              fieldId: "",
              optionId: "",
              fromOptionId: "",
              toOptionId: "",
            });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {entity?.namePlural ?? entity?.name ?? "Выберите сущность"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {entities.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.namePlural || item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Событие</Label>
        <Select
          value={draft.triggerKind}
          onValueChange={(next) => {
            if (next == null) return;
            const triggerKind = String(next) as NotificationTriggerKind;
            if (!(TRIGGER_KINDS as string[]).includes(triggerKind)) return;
            patch({ triggerKind });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {NOTIFICATION_TRIGGER_KIND_LABELS[draft.triggerKind]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {NOTIFICATION_TRIGGER_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Сработает при: {describeNotificationTrigger(draft)}
        </p>
      </div>

      {needsField(draft.triggerKind) ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Поле списка</Label>
          <Select
            value={draft.fieldId || undefined}
            onValueChange={(next) => {
              if (next != null) patch({ fieldId: String(next) });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {triggerField
                  ? getEntityFieldDisplayName(triggerField)
                  : "Выберите поле"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {listFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {draft.triggerKind === "fieldEnter" ||
      draft.triggerKind === "fieldLeave" ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Значение (опционально)</Label>
          <Select
            value={draft.optionId || "__any__"}
            onValueChange={(next) => {
              if (next == null) return;
              patch({
                optionId: String(next) === "__any__" ? "" : String(next),
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {draft.optionId
                  ? (triggerField?.listOptions.find(
                      (option) => option.id === draft.optionId,
                    )?.name ?? draft.optionId)
                  : "Любое значение"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Любое значение</SelectItem>
              {(triggerField?.listOptions ?? []).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {draft.triggerKind === "fieldTransition" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Из значения</Label>
            <Select
              value={draft.fromOptionId || "__any__"}
              onValueChange={(next) => {
                if (next == null) return;
                patch({
                  fromOptionId: String(next) === "__any__" ? "" : String(next),
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {draft.fromOptionId
                    ? (triggerField?.listOptions.find(
                        (option) => option.id === draft.fromOptionId,
                      )?.name ?? draft.fromOptionId)
                    : "Любое"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Любое</SelectItem>
                {(triggerField?.listOptions ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">В значение</Label>
            <Select
              value={draft.toOptionId || "__any__"}
              onValueChange={(next) => {
                if (next == null) return;
                patch({
                  toOptionId: String(next) === "__any__" ? "" : String(next),
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {draft.toOptionId
                    ? (triggerField?.listOptions.find(
                        (option) => option.id === draft.toOptionId,
                      )?.name ?? draft.toOptionId)
                    : "Любое"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Любое</SelectItem>
                {(triggerField?.listOptions ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Получатели</Label>
        {entity ? (
          <AssigneeEditor
            value={draft.recipients}
            fields={entity.fields}
            onChange={(recipients: AutomationAssigneeResolver) =>
              patch({ recipients })
            }
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Сначала выберите сущность
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Заголовок</Label>
        <Input
          placeholder="Можно использовать {{fieldId}}"
          value={draft.titleTemplate}
          onChange={(event) => patch({ titleTemplate: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Текст</Label>
        <Textarea
          placeholder="Текст уведомления, плейсхолдеры {{fieldId}}"
          value={draft.messageTemplate}
          onChange={(event) => patch({ messageTemplate: event.target.value })}
          rows={3}
        />
      </div>

      <SettingSwitch
        id={`nr-toast-${draft.id}`}
        checked={draft.showToast}
        onCheckedChange={(showToast) => patch({ showToast })}
        title="Показывать тост"
        description="Всплывающее уведомление у получателя"
      />

      {entity ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Условия (опционально)</Label>
          <ConditionGroupBuilder
            entity={entity}
            value={draft.conditions}
            onChange={(conditions) => patch({ conditions })}
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-border px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">Превью</p>
        <p className="mt-1 text-sm font-medium">{previewTitle || "—"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {previewMessage || "—"}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" onClick={() => onSave(draft)}>
          Сохранить
        </Button>
        {onTest ? (
          <Button type="button" variant="outline" onClick={() => onTest(draft)}>
            Тест себе
          </Button>
        ) : null}
      </div>
    </div>
  );
}
