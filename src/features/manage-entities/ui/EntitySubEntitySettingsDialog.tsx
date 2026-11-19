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
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  persistEntityDisplaySettingsNow,
  resolveEntityTableSubgroupField,
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
  /** Current «единичная запись» flag from the parent tab. */
  singleRecord?: boolean;
  /** Current «плоский список на вкладке» flag from the parent tab. */
  tableFlat?: boolean;
  entity: Entity;
};

function EntitySubEntitySettingsForm({
  parentEntityId,
  tabId,
  tabName,
  singleRecord: initialSingleRecord = false,
  tableFlat: initialTableFlat = false,
  entity,
  onCancel,
}: {
  parentEntityId: string;
  tabId: string;
  tabName: string;
  singleRecord?: boolean;
  tableFlat?: boolean;
  entity: Entity;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tabName);
  const [singleRecord, setSingleRecord] = useState(initialSingleRecord);
  const [tableFlat, setTableFlat] = useState(initialTableFlat);
  const [recordsDisplay, setRecordsDisplay] = useState<EntityRecordsDisplay>(
    normalizeEntityRecordsDisplay(entity.recordsDisplay),
  );
  const [recordColumns, setRecordColumns] = useState<EntityRecordColumns>(
    normalizeEntityRecordColumns(entity.recordColumns),
  );
  const [tableParentFieldId, setTableParentFieldId] = useState<string | null>(
    entity.tableParentFieldId,
  );
  const [tableSubgroupFieldId, setTableSubgroupFieldId] = useState<
    string | null
  >(() => resolveEntityTableSubgroupField(entity)?.id ?? null);
  const [tableNestedEntityId, setTableNestedEntityId] = useState<string | null>(
    entity.tableNestedEntityId,
  );
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;
  const showFlatToggle = recordsDisplay === "table" && !singleRecord;

  function persist() {
    updateEntityTab(parentEntityId, tabId, {
      name: trimmedName,
      singleRecord,
      tableFlat: showFlatToggle ? tableFlat : false,
    });
    updateEntity(entity.id, {
      recordsDisplay,
      recordColumns,
      tableParentFieldId,
      tableSubgroupFieldId,
      tableNestedEntityId,
    });
    // Linked-entity display/hierarchy must hit remote even while the parent
    // schema edit is open — and survive «Отменить» on that session.
    persistEntityDisplaySettingsNow(entity.id);
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

        <SettingSwitch
          id="sub-entity-single-record"
          title="Единичная запись"
          description="На вкладке можно добавить или привязать только одну запись"
          checked={singleRecord}
          onCheckedChange={(next) => {
            setSingleRecord(next);
            if (next) setTableFlat(false);
          }}
        />

        {showFlatToggle ? (
          <SettingSwitch
            id="sub-entity-table-flat"
            title="Плоский список на вкладке"
            description="Без группировки и дерева на этой вкладке. На странице сущности группировка не меняется."
            checked={tableFlat}
            onCheckedChange={setTableFlat}
          />
        ) : null}

        <EntityRecordsDisplayFields
          recordsDisplay={recordsDisplay}
          recordColumns={recordColumns}
          onRecordsDisplayChange={setRecordsDisplay}
          onRecordColumnsChange={setRecordColumns}
          entity={entity}
          tableParentFieldId={tableParentFieldId}
          tableSubgroupFieldId={tableSubgroupFieldId}
          tableNestedEntityId={tableNestedEntityId}
          onTableHierarchyChange={({
            tableParentFieldId: nextParent,
            tableSubgroupFieldId: nextSubgroup,
            tableNestedEntityId: nextNested,
          }) => {
            setTableParentFieldId(nextParent);
            setTableSubgroupFieldId(nextSubgroup);
            setTableNestedEntityId(nextNested);
          }}
          columnsSelectId="sub-entity-columns"
          tableHierarchyHint={
            tableFlat
              ? "Группировка сущности на её собственной странице (на этой вкладке сейчас плоский список)"
              : undefined
          }
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
  singleRecord = false,
  tableFlat = false,
  entity,
}: EntitySubEntitySettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <EntitySubEntitySettingsForm
            key={`${tabId}-${entity.id}`}
            parentEntityId={parentEntityId}
            tabId={tabId}
            tabName={tabName}
            singleRecord={singleRecord}
            tableFlat={tableFlat}
            entity={entity}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
