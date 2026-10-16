import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import {
  getSystemUsersEntity,
  isEntityComputedFieldType,
  ListSelect,
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityListValueIds,
  setEntityTimeTracking,
  useEntityConfig,
  type Entity,
  type EntityTimeTracking,
  getEntityFieldOptions,
} from "@/entities/entity";
import {
  getRelationFieldsTo,
  getTimeTrackingSettingsError,
  suggestEntityTimeTracking,
} from "../model/time-tracking-settings";
import {
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";

type EntityTimeTrackingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
};

function entityLabel(entity: Entity) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

function copyableFields(entity: Entity) {
  return entity.fields.filter(
    (field) => field.type !== "file" && !isEntityComputedFieldType(field.type),
  );
}

function TimeTrackingForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { entities } = useEntityConfig();
  const [enabled, setEnabled] = useState(entity.timeTracking != null);
  const [draft, setDraft] = useState<EntityTimeTracking | null>(
    entity.timeTracking,
  );
  const [limitText, setLimitText] = useState(
    String(entity.timeTracking?.dailyLimitHours ?? 8),
  );
  const users = getSystemUsersEntity(entities);
  const entryEntity = draft
    ? (entities.find((item) => item.id === draft.entryEntityId) ?? null)
    : null;
  const error = !enabled
    ? null
    : !draft || !entryEntity
      ? "Выберите сущность записей времени"
      : getTimeTrackingSettingsError(draft);

  const methodField =
    entryEntity?.fields.find((field) => field.id === draft?.methodFieldId) ??
    null;
  const methodOptions = methodField
    ? resolveEntityListFieldOptions(methodField, entities).map((option) => ({
        value: option.id,
        label: option.name,
      }))
    : [];
  const statusFields = entity.fields.filter(
    (field) =>
      field.type === "list" &&
      !resolveEntityListFieldPresentation(field, entities).listMultiple,
  );
  const statusField =
    statusFields.find((field) => field.id === draft?.statusFieldId) ?? null;

  function patch(next: Partial<EntityTimeTracking>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function save() {
    if (error) return;
    const limit = Number(limitText.replace(",", "."));
    setEntityTimeTracking(
      entity.id,
      enabled && draft
        ? {
            ...draft,
            dailyLimitHours: Number.isFinite(limit)
              ? Math.min(24, Math.max(0, limit))
              : 8,
          }
        : null,
    );
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Учёт времени</DialogTitle>
        <DialogDescription>
          Таймер и ручной ввод часов в записях «{entityLabel(entity)}».
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border px-3 py-2.5">
          <SettingSwitch
            id="time-tracking-enabled"
            title="Учитывать время"
            description="Кнопка таймера в карточке и на канбане"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled ? (
          <>
            <SettingSelect
              id="time-tracking-entity"
              title="Записи времени"
              description="Сущность, куда записываются часы"
              value={draft?.entryEntityId ?? null}
              options={entities
                .filter((item) => item.id !== entity.id && item !== users)
                .map((item) => ({ value: item.id, label: entityLabel(item) }))}
              onChange={(next) => {
                const target = entities.find((item) => item.id === next);
                if (!target) return;
                setDraft(suggestEntityTimeTracking(entity, target, entities));
              }}
            />

            {draft && entryEntity ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <SettingSelect
                    id="time-tracking-link"
                    title="Связь с записью"
                    value={draft.linkFieldId || null}
                    options={getEntityFieldOptions(
                      getRelationFieldsTo(entryEntity, entity.id),
                    )}
                    noOptionsLabel={`Нет связи с «${entityLabel(entity)}»`}
                    onChange={(next) => patch({ linkFieldId: next ?? "" })}
                  />
                  <SettingSelect
                    id="time-tracking-employee"
                    title="Сотрудник"
                    value={draft.employeeFieldId || null}
                    options={getEntityFieldOptions(
                      getRelationFieldsTo(entryEntity, users?.id ?? null),
                    )}
                    noOptionsLabel="Нет связи с «Пользователи»"
                    onChange={(next) => patch({ employeeFieldId: next ?? "" })}
                  />
                  <SettingSelect
                    id="time-tracking-start"
                    title="Начало"
                    value={draft.startFieldId || null}
                    options={getEntityFieldOptions(
                      entryEntity.fields.filter(
                        (field) => field.type === "datetime",
                      ),
                    )}
                    noOptionsLabel="Нет полей «Дата»"
                    onChange={(next) => patch({ startFieldId: next ?? "" })}
                  />
                  <SettingSelect
                    id="time-tracking-end"
                    title="Окончание"
                    value={draft.endFieldId || null}
                    options={getEntityFieldOptions(
                      entryEntity.fields.filter(
                        (field) => field.type === "datetime",
                      ),
                    )}
                    noOptionsLabel="Нет полей «Дата»"
                    onChange={(next) => patch({ endFieldId: next ?? "" })}
                  />
                  <SettingSelect
                    id="time-tracking-hours"
                    title="Часы"
                    value={draft.hoursFieldId || null}
                    options={getEntityFieldOptions(
                      entryEntity.fields.filter(
                        (field) => field.type === "number",
                      ),
                    )}
                    noOptionsLabel="Нет полей «Число»"
                    onChange={(next) => patch({ hoursFieldId: next ?? "" })}
                  />
                  <SettingSelect
                    id="time-tracking-comment"
                    title="Комментарий"
                    value={draft.commentFieldId}
                    options={getEntityFieldOptions(
                      entryEntity.fields.filter(
                        (field) =>
                          field.type === "text" || field.type === "textarea",
                      ),
                    )}
                    emptyLabel="Не записывать"
                    onChange={(next) => patch({ commentFieldId: next })}
                  />
                </div>

                <div className="flex flex-col gap-2 rounded-md bg-muted/35 p-2.5">
                  <SettingSelect
                    id="time-tracking-method"
                    title="Способ"
                    description="Отмечать, как добавлено время"
                    value={draft.methodFieldId}
                    options={getEntityFieldOptions(
                      entryEntity.fields.filter(
                        (field) => field.type === "list",
                      ),
                    )}
                    emptyLabel="Не отмечать"
                    onChange={(next) =>
                      patch({
                        methodFieldId: next,
                        timerOptionId: null,
                        manualOptionId: null,
                      })
                    }
                  />
                  {methodField ? (
                    <div className="grid grid-cols-2 gap-2">
                      <SettingSelect
                        id="time-tracking-method-timer"
                        title="Таймер"
                        value={draft.timerOptionId}
                        options={methodOptions}
                        emptyLabel="—"
                        onChange={(next) => patch({ timerOptionId: next })}
                      />
                      <SettingSelect
                        id="time-tracking-method-manual"
                        title="Вручную"
                        value={draft.manualOptionId}
                        options={methodOptions}
                        emptyLabel="—"
                        onChange={(next) => patch({ manualOptionId: next })}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 rounded-md bg-muted/35 p-2.5">
                  <SettingSelect
                    id="time-tracking-status"
                    title="Таймер доступен"
                    description="В каких статусах можно запустить таймер"
                    value={draft.statusFieldId}
                    options={getEntityFieldOptions(statusFields)}
                    emptyLabel="Всегда"
                    onChange={(next) =>
                      patch({ statusFieldId: next, statusOptionIds: [] })
                    }
                  />
                  {statusField ? (
                    <ListSelect
                      multiple
                      options={resolveEntityListFieldOptions(
                        statusField,
                        entities,
                      )}
                      value={serializeEntityListValueIds(draft.statusOptionIds)}
                      showColors={
                        resolveEntityListFieldPresentation(
                          statusField,
                          entities,
                        ).listUseColors
                      }
                      emptyLabel="В любом статусе"
                      aria-label="Статусы для таймера"
                      className="h-8 bg-background"
                      onChange={(next) =>
                        patch({
                          statusOptionIds: parseEntityListValueIds(next),
                        })
                      }
                    />
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <SettingLabel
                    htmlFor="time-tracking-limit"
                    title="Лимит в день, ч"
                    description="Для ручного ввода; 0 — без лимита"
                  />
                  <Input
                    id="time-tracking-limit"
                    inputMode="decimal"
                    value={limitText}
                    className="h-8 w-20 text-right tabular-nums"
                    onChange={(event) =>
                      setLimitText(event.target.value.replace(/[^\d.,]/g, ""))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <SettingLabel
                    title="Контекст"
                    description="Что скопировать из записи в запись времени"
                  />
                  {draft.context.map((pair, index) => (
                    <div
                      key={`${pair.sourceFieldId}:${pair.targetFieldId}:${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_0.875rem_minmax(0,1fr)_1.75rem] items-center gap-1.5"
                    >
                      <SettingSelect
                        id={`time-tracking-context-source-${index}`}
                        value={pair.sourceFieldId}
                        options={getEntityFieldOptions(copyableFields(entity))}
                        onChange={(next) =>
                          patch({
                            context: draft.context.map((item, itemIndex) =>
                              itemIndex === index && next
                                ? { ...item, sourceFieldId: next }
                                : item,
                            ),
                          })
                        }
                      />
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <SettingSelect
                        id={`time-tracking-context-target-${index}`}
                        value={pair.targetFieldId}
                        options={getEntityFieldOptions(
                          copyableFields(entryEntity),
                        )}
                        onChange={(next) =>
                          patch({
                            context: draft.context.map((item, itemIndex) =>
                              itemIndex === index && next
                                ? { ...item, targetFieldId: next }
                                : item,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Убрать поле контекста"
                        onClick={() =>
                          patch({
                            context: draft.context.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 self-start px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={
                      copyableFields(entity).length === 0 ||
                      copyableFields(entryEntity).length === 0
                    }
                    onClick={() =>
                      patch({
                        context: [
                          ...draft.context,
                          {
                            sourceFieldId: copyableFields(entity)[0]!.id,
                            targetFieldId: copyableFields(entryEntity)[0]!.id,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="size-3.5" />
                    Поле контекста
                  </Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={error != null} onClick={save}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityTimeTrackingDialog({
  open,
  onOpenChange,
  entity,
}: EntityTimeTrackingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open ? (
          <TimeTrackingForm
            key={entity.id}
            entity={entity}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
