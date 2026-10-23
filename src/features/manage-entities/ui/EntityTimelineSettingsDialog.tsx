import { useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  getEntityFieldOptions,
  getEntityFieldValueKind,
  getTimelineRowOptionFields,
  setEntityTimeline,
  useEntityConfig,
  type Entity,
  type EntityTimelineConfig,
} from "@/entities/entity";
import { SettingSelect, SettingSwitch } from "@/shared/ui/setting-controls";

type EntityTimelineSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
};

/** Prefill by field types: two dates, first list as color, dependencies. */
function suggestTimeline(entity: Entity): EntityTimelineConfig {
  const dates = entity.fields.filter((field) => field.type === "datetime");
  return {
    startFieldId: dates[0]?.id ?? "",
    endFieldId: dates[1]?.id ?? dates[0]?.id ?? "",
    groupFieldId: null,
    clusterFieldId: null,
    splitFieldId: null,
    showAllGroupOptions: false,
    colorFieldId:
      entity.fields.find((field) => field.type === "list")?.id ?? null,
    labelFieldId: null,
    progressFieldId: null,
    dependenciesFieldId:
      entity.fields.find((field) => field.type === "dependencies")?.id ?? null,
  };
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-medium tracking-tight text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/15 p-3">
        {children}
      </div>
    </section>
  );
}

function TimelineSettingsForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { entities } = useEntityConfig();
  const [draft, setDraft] = useState<EntityTimelineConfig>(() => ({
    ...suggestTimeline(entity),
    ...entity.timeline,
  }));
  const dateOptions = getEntityFieldOptions(
    entity.fields.filter((field) => field.type === "datetime"),
  );
  const rowFieldOptions = getEntityFieldOptions(
    entity.fields.filter((field) => {
      const kind = getEntityFieldValueKind(entity, field, entities);
      return kind === "list" || kind === "relation";
    }),
  );
  const labelFieldOptions = getEntityFieldOptions(
    entity.fields.filter((field) => {
      if (
        field.type === "file" ||
        field.type === "dependencies" ||
        field.type === "relationGroups" ||
        field.type === "period"
      ) {
        return false;
      }
      const kind = getEntityFieldValueKind(entity, field, entities);
      return (
        kind === "number" ||
        kind === "text" ||
        kind === "list" ||
        kind === "boolean" ||
        kind === "date" ||
        kind === "relation"
      );
    }),
  );
  const numberFieldOptions = getEntityFieldOptions(
    entity.fields.filter(
      (field) => getEntityFieldValueKind(entity, field, entities) === "number",
    ),
  );
  const canSave = Boolean(draft.startFieldId && draft.endFieldId);
  const hasRows = Boolean(draft.groupFieldId);
  const rowField =
    entity.fields.find((field) => field.id === draft.groupFieldId) ?? null;
  const rowOptionFields = getTimelineRowOptionFields(
    entity,
    rowField,
    entities,
  );
  const rowOptionSelects = getEntityFieldOptions(rowOptionFields);
  const canUseRowMeta = rowOptionFields.length > 0;

  function patch(next: Partial<EntityTimelineConfig>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Настройки графика</DialogTitle>
        <DialogDescription>
          Полосы строятся от начала до окончания; зависимости сдвигают
          последователей по рабочим дням.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        <SettingsSection
          title="Структура"
          description="Шкала времени и строки группировки"
        >
          <div className="grid grid-cols-2 gap-3">
            <SettingSelect
              id="timeline-start"
              title="Начало"
              value={draft.startFieldId || null}
              options={dateOptions}
              noOptionsLabel="Нет полей «Дата»"
              onChange={(next) => patch({ startFieldId: next ?? "" })}
            />
            <SettingSelect
              id="timeline-end"
              title="Окончание"
              value={draft.endFieldId || null}
              options={dateOptions}
              noOptionsLabel="Нет полей «Дата»"
              onChange={(next) => patch({ endFieldId: next ?? "" })}
            />
          </div>
          <SettingSelect
            id="timeline-group"
            title="Строки"
            description="Поле списка или связи — сами записи в таблице"
            value={draft.groupFieldId}
            options={rowFieldOptions}
            emptyLabel="Без группировки"
            onChange={(next) =>
              patch({
                groupFieldId: next,
                clusterFieldId: null,
                splitFieldId: null,
                showAllGroupOptions: next ? draft.showAllGroupOptions : false,
              })
            }
          />
          {hasRows ? (
            <>
              <SettingSelect
                id="timeline-cluster"
                title="Группировать по"
                description={
                  canUseRowMeta
                    ? "Внешний уровень: вид деятельности и т.п. у связанной записи"
                    : "Доступно, когда «Строки» — связь с сущностью"
                }
                value={canUseRowMeta ? draft.clusterFieldId : null}
                options={rowOptionSelects}
                emptyLabel="Без группировки"
                noOptionsLabel="Нет полей со вариантами у связанной сущности"
                onChange={(next) => patch({ clusterFieldId: next })}
              />
              <SettingSelect
                id="timeline-split"
                title="Разделять на"
                description={
                  canUseRowMeta
                    ? "Внутри группы: приход / расход и т.п. у связанной записи"
                    : "Доступно, когда «Строки» — связь с сущностью"
                }
                value={canUseRowMeta ? draft.splitFieldId : null}
                options={rowOptionSelects}
                emptyLabel="Без разделения"
                noOptionsLabel="Нет полей со вариантами у связанной сущности"
                onChange={(next) => patch({ splitFieldId: next })}
              />
              <div className="rounded-md border border-border/60 bg-background/80 px-3 py-2.5">
                <SettingSwitch
                  id="timeline-show-all-rows"
                  title="Все варианты поля"
                  description="Показывать пустые стадии и записи, даже без значений"
                  checked={draft.showAllGroupOptions}
                  onCheckedChange={(checked) =>
                    patch({ showAllGroupOptions: checked })
                  }
                />
              </div>
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title="Значения"
          description="Что видно на полосе: подпись, цвет и прогресс"
        >
          <SettingSelect
            id="timeline-label"
            title="Содержимое"
            description="Число, текст или список на полосе"
            value={draft.labelFieldId}
            options={labelFieldOptions}
            emptyLabel="Название записи"
            onChange={(next) => patch({ labelFieldId: next })}
          />
          <SettingSelect
            id="timeline-color"
            title="Цвет полос"
            description="По вариантам списка"
            value={draft.colorFieldId}
            options={getEntityFieldOptions(
              entity.fields.filter((field) => field.type === "list"),
            )}
            emptyLabel="Один цвет"
            onChange={(next) => patch({ colorFieldId: next })}
          />
          <SettingSelect
            id="timeline-progress"
            title="Прогресс"
            description="Число от 0 до 100"
            value={draft.progressFieldId}
            options={numberFieldOptions}
            emptyLabel="Не показывать"
            onChange={(next) => patch({ progressFieldId: next })}
          />
        </SettingsSection>

        <SettingsSection title="Прочее">
          <SettingSelect
            id="timeline-dependencies"
            title="Зависимости"
            description="Поле «Предшественники»"
            value={draft.dependenciesFieldId}
            options={getEntityFieldOptions(
              entity.fields.filter((field) => field.type === "dependencies"),
            )}
            emptyLabel="Без зависимостей"
            onChange={(next) => patch({ dependenciesFieldId: next })}
          />
        </SettingsSection>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => {
            setEntityTimeline(entity.id, {
              ...draft,
              clusterFieldId: canUseRowMeta ? draft.clusterFieldId : null,
              splitFieldId: canUseRowMeta ? draft.splitFieldId : null,
              showAllGroupOptions: Boolean(
                draft.groupFieldId && draft.showAllGroupOptions,
              ),
            });
            onClose();
          }}
        >
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityTimelineSettingsDialog({
  open,
  onOpenChange,
  entity,
}: EntityTimelineSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent forceOverlay className="sm:max-w-lg">
        {open ? (
          <TimelineSettingsForm
            key={entity.id}
            entity={entity}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
