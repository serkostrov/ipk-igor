import { useState } from "react";
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
  getEntityFieldValueKind,
  setEntityTimeline,
  useEntityConfig,
  type Entity,
  type EntityTimelineConfig,
  getEntityFieldOptions,
} from "@/entities/entity";
import { SettingSelect } from "@/shared/ui/setting-controls";

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
    colorFieldId:
      entity.fields.find((field) => field.type === "list")?.id ?? null,
    progressFieldId: null,
    dependenciesFieldId:
      entity.fields.find((field) => field.type === "dependencies")?.id ?? null,
  };
}

function TimelineSettingsForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { entities } = useEntityConfig();
  const [draft, setDraft] = useState<EntityTimelineConfig>(
    () => entity.timeline ?? suggestTimeline(entity),
  );
  const dateOptions = getEntityFieldOptions(
    entity.fields.filter((field) => field.type === "datetime"),
  );
  const canSave = Boolean(draft.startFieldId && draft.endFieldId);

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

      <div className="flex flex-col gap-3">
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
          title="Группировка"
          value={draft.groupFieldId}
          options={getEntityFieldOptions(
            entity.fields.filter((field) => {
              const kind = getEntityFieldValueKind(entity, field, entities);
              return kind === "list" || kind === "relation";
            }),
          )}
          emptyLabel="Без группировки"
          onChange={(next) => patch({ groupFieldId: next })}
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
          options={getEntityFieldOptions(
            entity.fields.filter(
              (field) =>
                getEntityFieldValueKind(entity, field, entities) === "number",
            ),
          )}
          emptyLabel="Не показывать"
          onChange={(next) => patch({ progressFieldId: next })}
        />
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
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => {
            setEntityTimeline(entity.id, draft);
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
      <DialogContent className="sm:max-w-md">
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
