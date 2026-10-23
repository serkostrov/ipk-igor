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
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  updateEntity,
  updateEntityTab,
  type Entity,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
} from "@/entities/entity";
import { EntityRecordsDisplayFields } from "./EntityRecordsDisplayFields";

type EntitySubEntitySettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentEntityId: string;
  tabId: string;
  tabName: string;
  entity: Entity;
};

function EntitySubEntitySettingsForm({
  parentEntityId,
  tabId,
  tabName,
  entity,
  onCancel,
}: {
  parentEntityId: string;
  tabId: string;
  tabName: string;
  entity: Entity;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tabName);
  const [recordsDisplay, setRecordsDisplay] = useState<EntityRecordsDisplay>(
    normalizeEntityRecordsDisplay(entity.recordsDisplay),
  );
  const [recordColumns, setRecordColumns] = useState<EntityRecordColumns>(
    normalizeEntityRecordColumns(entity.recordColumns),
  );
  const [tableParentFieldId, setTableParentFieldId] = useState<string | null>(
    entity.tableParentFieldId,
  );
  const [tableNestedEntityId, setTableNestedEntityId] = useState<string | null>(
    entity.tableNestedEntityId,
  );
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function persist() {
    updateEntityTab(parentEntityId, tabId, { name: trimmedName });
    updateEntity(entity.id, {
      recordsDisplay,
      recordColumns,
      tableParentFieldId,
      tableNestedEntityId,
    });
    onCancel();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Настройки вкладки</DialogTitle>
        <DialogDescription>
          Название вкладки и отображение записей на странице родителя.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sub-entity-tab-name">Название вкладки</Label>
          <Input
            id="sub-entity-tab-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Задачи"
            autoFocus
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !canSubmit) return;
              event.preventDefault();
              persist();
            }}
          />
        </div>

        <EntityRecordsDisplayFields
          recordsDisplay={recordsDisplay}
          recordColumns={recordColumns}
          onRecordsDisplayChange={setRecordsDisplay}
          onRecordColumnsChange={setRecordColumns}
          entity={entity}
          tableParentFieldId={tableParentFieldId}
          tableNestedEntityId={tableNestedEntityId}
          onTableHierarchyChange={({
            tableParentFieldId: nextParent,
            tableNestedEntityId: nextNested,
          }) => {
            setTableParentFieldId(nextParent);
            setTableNestedEntityId(nextNested);
          }}
          columnsSelectId="sub-entity-columns"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={persist}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntitySubEntitySettingsDialog({
  open,
  onOpenChange,
  parentEntityId,
  tabId,
  tabName,
  entity,
}: EntitySubEntitySettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <EntitySubEntitySettingsForm
            key={`${tabId}-${tabName}-${entity.id}-${entity.recordColumns}-${entity.recordsDisplay}-${entity.tableParentFieldId ?? ""}-${entity.tableNestedEntityId ?? ""}`}
            parentEntityId={parentEntityId}
            tabId={tabId}
            tabName={tabName}
            entity={entity}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
