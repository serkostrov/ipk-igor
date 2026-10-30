import { useState } from "react";
import { ArrowRight, Check, ChevronsUpDown, Plus, X } from "lucide-react";
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
  createEntityTimeTrackingJournal,
  getSystemUsersEntity,
  isEntityComputedFieldType,
  ListSelect,
  listTimeJournalCandidates,
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityListValueIds,
  setEntityTimeTracking,
  suggestEntityTimeTracking,
  useEntityConfig,
  type Entity,
  type EntityTimeTracking,
  getEntityFieldOptions,
  getRelationFieldsTo,
  getTimeTrackingSettingsError,
} from "@/entities/entity";
import {
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";
import { cn } from "@/shared/lib/cn";

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

function draftFromEntity(entity: Entity): {
  enabled: boolean;
  draft: EntityTimeTracking | null;
  limitText: string;
} {
  return {
    enabled: entity.timeTracking != null,
    draft: entity.timeTracking,
    limitText: String(entity.timeTracking?.dailyLimitHours ?? 8),
  };
}

/** Shared form: dialog and entity «Учёт времени» tab. */
export function EntityTimeTrackingSettings({
  entity,
  readOnly = false,
  variant = "panel",
  onSaved,
}: {
  entity: Entity;
  readOnly?: boolean;
  /** `dialog` — compact for modal; `panel` — tab editor layout. */
  variant?: "dialog" | "panel";
  onSaved?: () => void;
}) {
  const { entities } = useEntityConfig();
  const initial = draftFromEntity(entity);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [draft, setDraft] = useState<EntityTimeTracking | null>(initial.draft);
  const [limitText, setLimitText] = useState(initial.limitText);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pickExisting, setPickExisting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const users = getSystemUsersEntity(entities);
  const entryEntity = draft
    ? (entities.find((item) => item.id === draft.entryEntityId) ?? null)
    : null;
  const candidates = listTimeJournalCandidates(entity, entities);
  const mappingError =
    enabled && draft && entryEntity
      ? getTimeTrackingSettingsError(draft)
      : null;
  const needsJournal = enabled && (!draft || !entryEntity);
  const error = !enabled ? null : needsJournal ? null : mappingError;

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

  function save(nextDraft: EntityTimeTracking | null = draft) {
    if (readOnly) return;
    if (enabled) {
      if (!nextDraft || getTimeTrackingSettingsError(nextDraft)) return;
      const limit = Number(limitText.replace(",", "."));
      setEntityTimeTracking(entity.id, {
        ...nextDraft,
        dailyLimitHours: Number.isFinite(limit)
          ? Math.min(24, Math.max(0, limit))
          : 8,
      });
    } else {
      setEntityTimeTracking(entity.id, null);
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
    onSaved?.();
  }

  function createJournal() {
    if (readOnly) return;
    const created = createEntityTimeTrackingJournal(entity.id);
    if (!created) return;
    setEnabled(true);
    setDraft(created);
    setPickExisting(false);
    setShowAdvanced(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
    onSaved?.();
  }

  function selectJournal(entryEntityId: string) {
    const target = entities.find((item) => item.id === entryEntityId);
    if (!target) return;
    const next = suggestEntityTimeTracking(entity, target, entities);
    setDraft(next);
    setEnabled(true);
    setPickExisting(false);
    if (!getTimeTrackingSettingsError(next)) {
      save(next);
    } else {
      setShowAdvanced(true);
    }
  }

  const journalReady = Boolean(
    enabled && draft && entryEntity && !mappingError,
  );

  const body = (
    <div className="flex flex-col gap-4">
      {variant === "panel" ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Учёт времени</p>
          <p className="text-sm text-muted-foreground">
            Таймер и ручной ввод часов в карточках «{entityLabel(entity)}».
            Каждая сессия сохраняется отдельной записью в журнале времени.
          </p>
        </div>
      ) : null}

      <div className="rounded-md border border-border px-3 py-2.5">
        <SettingSwitch
          id={`time-tracking-enabled-${entity.id}`}
          title="Учитывать время"
          description="Кнопка таймера в карточке и на канбане"
          checked={enabled}
          onCheckedChange={(next) => {
            setEnabled(next);
            if (!next) {
              setPickExisting(false);
              setShowAdvanced(false);
            }
          }}
          disabled={readOnly}
        />
      </div>

      {enabled && needsJournal ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Журнал времени
            </p>
            <p className="text-sm text-muted-foreground">
              Нужна отдельная сущность, куда пишутся сессии: сотрудник, начало,
              окончание и часы. Можно создать готовый журнал одним нажатием.
            </p>
          </div>

          {!readOnly ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button type="button" onClick={createJournal}>
                Создать журнал времени
              </Button>
              {candidates.length > 0 || pickExisting ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setPickExisting((v) => !v)}
                >
                  {pickExisting
                    ? "Скрыть выбор"
                    : "Выбрать существующую сущность"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setPickExisting(true)}
                >
                  Выбрать существующую сущность
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Журнал ещё не настроен.
            </p>
          )}

          {pickExisting && !readOnly ? (
            <SettingSelect
              id={`time-tracking-entity-pick-${entity.id}`}
              title="Сущность журнала"
              description={
                candidates.length > 0
                  ? "Подходящие сущности уже содержат нужные поля"
                  : "Выберите сущность — поля нужно будет сопоставить вручную"
              }
              value={null}
              options={(candidates.length > 0
                ? candidates
                : entities.filter(
                    (item) => item.id !== entity.id && item !== users,
                  )
              ).map((item) => ({
                value: item.id,
                label: entityLabel(item),
              }))}
              onChange={(next) => {
                if (next) selectJournal(next);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {enabled && draft && entryEntity ? (
        <>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {journalReady ? (
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                  ) : null}
                  <span className="truncate">{entityLabel(entryEntity)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {journalReady
                    ? "Журнал подключён — сессии будут сохраняться сюда"
                    : "Сопоставьте поля журнала ниже"}
                </p>
              </div>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDraft(null);
                    setPickExisting(true);
                    setShowAdvanced(false);
                  }}
                >
                  Сменить
                </Button>
              ) : null}
            </div>
          </div>

          {!journalReady || showAdvanced ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SettingSelect
                  id={`time-tracking-link-${entity.id}`}
                  title="Связь с записью"
                  value={draft.linkFieldId || null}
                  options={getEntityFieldOptions(
                    getRelationFieldsTo(entryEntity, entity.id),
                  )}
                  noOptionsLabel={`Нет связи с «${entityLabel(entity)}»`}
                  onChange={(next) => patch({ linkFieldId: next ?? "" })}
                  disabled={readOnly}
                />
                <SettingSelect
                  id={`time-tracking-employee-${entity.id}`}
                  title="Сотрудник"
                  value={draft.employeeFieldId || null}
                  options={getEntityFieldOptions(
                    getRelationFieldsTo(entryEntity, users?.id ?? null),
                  )}
                  noOptionsLabel="Нет связи с «Пользователи»"
                  onChange={(next) => patch({ employeeFieldId: next ?? "" })}
                  disabled={readOnly}
                />
                <SettingSelect
                  id={`time-tracking-start-${entity.id}`}
                  title="Начало"
                  value={draft.startFieldId || null}
                  options={getEntityFieldOptions(
                    entryEntity.fields.filter(
                      (field) => field.type === "datetime",
                    ),
                  )}
                  noOptionsLabel="Нет полей «Дата»"
                  onChange={(next) => patch({ startFieldId: next ?? "" })}
                  disabled={readOnly}
                />
                <SettingSelect
                  id={`time-tracking-end-${entity.id}`}
                  title="Окончание"
                  value={draft.endFieldId || null}
                  options={getEntityFieldOptions(
                    entryEntity.fields.filter(
                      (field) => field.type === "datetime",
                    ),
                  )}
                  noOptionsLabel="Нет полей «Дата»"
                  onChange={(next) => patch({ endFieldId: next ?? "" })}
                  disabled={readOnly}
                />
                <SettingSelect
                  id={`time-tracking-hours-${entity.id}`}
                  title="Часы"
                  value={draft.hoursFieldId || null}
                  options={getEntityFieldOptions(
                    entryEntity.fields.filter(
                      (field) => field.type === "number",
                    ),
                  )}
                  noOptionsLabel="Нет полей «Число»"
                  onChange={(next) => patch({ hoursFieldId: next ?? "" })}
                  disabled={readOnly}
                />
                <SettingSelect
                  id={`time-tracking-comment-${entity.id}`}
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
                  disabled={readOnly}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-md bg-muted/35 p-2.5">
                <SettingSelect
                  id={`time-tracking-method-${entity.id}`}
                  title="Способ"
                  description="Отмечать, как добавлено время"
                  value={draft.methodFieldId}
                  options={getEntityFieldOptions(
                    entryEntity.fields.filter((field) => field.type === "list"),
                  )}
                  emptyLabel="Не отмечать"
                  onChange={(next) =>
                    patch({
                      methodFieldId: next,
                      timerOptionId: null,
                      manualOptionId: null,
                    })
                  }
                  disabled={readOnly}
                />
                {methodField ? (
                  <div className="grid grid-cols-2 gap-2">
                    <SettingSelect
                      id={`time-tracking-method-timer-${entity.id}`}
                      title="Таймер"
                      value={draft.timerOptionId}
                      options={methodOptions}
                      emptyLabel="—"
                      onChange={(next) => patch({ timerOptionId: next })}
                      disabled={readOnly}
                    />
                    <SettingSelect
                      id={`time-tracking-method-manual-${entity.id}`}
                      title="Вручную"
                      value={draft.manualOptionId}
                      options={methodOptions}
                      emptyLabel="—"
                      onChange={(next) => patch({ manualOptionId: next })}
                      disabled={readOnly}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 rounded-md bg-muted/35 p-2.5">
                <SettingSelect
                  id={`time-tracking-status-${entity.id}`}
                  title="Таймер доступен"
                  description="В каких статусах можно запустить таймер"
                  value={draft.statusFieldId}
                  options={getEntityFieldOptions(statusFields)}
                  emptyLabel="Всегда"
                  onChange={(next) =>
                    patch({ statusFieldId: next, statusOptionIds: [] })
                  }
                  disabled={readOnly}
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
                      resolveEntityListFieldPresentation(statusField, entities)
                        .listUseColors
                    }
                    emptyLabel="В любом статусе"
                    aria-label="Статусы для таймера"
                    className="h-8 bg-background"
                    disabled={readOnly}
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
                  htmlFor={`time-tracking-limit-${entity.id}`}
                  title="Лимит в день, ч"
                  description="Для ручного ввода; 0 — без лимита"
                />
                <Input
                  id={`time-tracking-limit-${entity.id}`}
                  inputMode="decimal"
                  value={limitText}
                  disabled={readOnly}
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
                      id={`time-tracking-context-source-${entity.id}-${index}`}
                      value={pair.sourceFieldId}
                      options={getEntityFieldOptions(copyableFields(entity))}
                      disabled={readOnly}
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
                      id={`time-tracking-context-target-${entity.id}-${index}`}
                      value={pair.targetFieldId}
                      options={getEntityFieldOptions(
                        copyableFields(entryEntity),
                      )}
                      disabled={readOnly}
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
                      disabled={readOnly}
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
                    readOnly ||
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
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAdvanced(true)}
            >
              <ChevronsUpDown className="size-3.5" />
              Дополнительные настройки
            </button>
          )}
        </>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {!readOnly && (!enabled || journalReady || (draft && entryEntity)) ? (
        <div
          className={cn(
            "flex items-center gap-2",
            variant === "panel"
              ? "justify-end border-t border-border/60 pt-3"
              : "",
          )}
        >
          {savedFlash ? (
            <span className="text-xs text-muted-foreground">Сохранено</span>
          ) : null}
          <Button
            type="button"
            disabled={enabled ? error != null || needsJournal : false}
            onClick={() => save()}
          >
            Сохранить
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (variant === "panel") {
    return (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        {body}
      </div>
    );
  }

  return body;
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
          <>
            <DialogHeader>
              <DialogTitle>Учёт времени</DialogTitle>
              <DialogDescription>
                Таймер и ручной ввод часов в записях «{entityLabel(entity)}».
                Сессии хранятся в журнале времени.
              </DialogDescription>
            </DialogHeader>
            <EntityTimeTrackingSettings
              key={`${entity.id}:${entity.timeTracking?.entryEntityId ?? "off"}`}
              entity={entity}
              variant="dialog"
              onSaved={() => onOpenChange(false)}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
