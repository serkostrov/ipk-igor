import { useMemo, useState } from "react";
import { Settings } from "lucide-react";
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
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";
import {
  getEntityTableParentFieldOptions,
  resolveEntityTableParentField,
  setEntityTableSettings,
  type Entity,
} from "@/entities/entity";
import { EntityPageLayoutSettingsDialog } from "./EntityPageLayoutSettingsDialog";

type EntityTableSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
};

function TableSettingsForm({
  entity,
  onClose,
  onOpenPageLayout,
}: {
  entity: Entity;
  onClose: () => void;
  onOpenPageLayout: () => void;
}) {
  const [massSelection, setMassSelection] = useState(
    entity.tableMassSelection === true,
  );
  const parentOptions = useMemo(
    () => getEntityTableParentFieldOptions(entity),
    [entity],
  );
  const [parentFieldId, setParentFieldId] = useState<string | null>(
    () => resolveEntityTableParentField(entity)?.id ?? null,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Настройки таблицы</DialogTitle>
        <DialogDescription>
          Таблица «
          {entity.namePlural.trim() || entity.name.trim() || "сущность"}»
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <SettingSelect
          id="entity-table-parent-field"
          title="Сгруппировать по"
          description="Строки станут деревом: группа и записи внутри"
          value={parentFieldId}
          options={parentOptions}
          emptyLabel="Плоский список"
          noOptionsLabel="Нужен список, связь или принадлежность"
          onChange={setParentFieldId}
        />
        <SettingSwitch
          id="entity-table-mass-selection"
          title="Массовый выбор"
          description="Чекбоксы в строках для массовых действий"
          checked={massSelection}
          onCheckedChange={setMassSelection}
        />
        <div className="flex items-center justify-between gap-3">
          <SettingLabel
            title="Макет страницы"
            description="Сводка и фильтры над таблицей"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            aria-label="Настроить макет страницы"
            title="Настроить"
            onClick={onOpenPageLayout}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          onClick={() => {
            setEntityTableSettings(entity.id, {
              massSelection,
              parentFieldId,
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

export function EntityTableSettingsDialog({
  open,
  onOpenChange,
  entity,
}: EntityTableSettingsDialogProps) {
  const [pageLayoutOpen, setPageLayoutOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          forceOverlay
          className="w-fit min-w-[min(100%,22rem)] max-w-[min(92vw,28rem)] gap-4 overflow-x-hidden sm:max-w-[min(92vw,28rem)]"
        >
          {open ? (
            <TableSettingsForm
              key={entity.id}
              entity={entity}
              onClose={() => onOpenChange(false)}
              onOpenPageLayout={() => {
                onOpenChange(false);
                setPageLayoutOpen(true);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <EntityPageLayoutSettingsDialog
        open={pageLayoutOpen}
        onOpenChange={setPageLayoutOpen}
        entity={entity}
      />
    </>
  );
}
