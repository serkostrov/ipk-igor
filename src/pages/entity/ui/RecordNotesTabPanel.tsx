import { useMemo } from "react";
import {
  getEntityTabRecordsValueKey,
  parseEntityTabRecordEntries,
  RecordNotesEditor,
  type Entity,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";

type RecordNotesTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

export function RecordNotesTabPanel({
  entity,
  record,
  tab,
}: RecordNotesTabPanelProps) {
  const valueKey = getEntityTabRecordsValueKey(tab.id);
  const count = useMemo(
    () => parseEntityTabRecordEntries(record.values[valueKey]).length,
    [record.values, valueKey],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {tab.name}
        </h2>
        <span className="text-sm text-muted-foreground">
          {count > 0
            ? `${count} ${count === 1 ? "запись" : count < 5 ? "записи" : "записей"}`
            : null}
        </span>
      </header>
      <div className="p-4">
        <RecordNotesEditor entity={entity} record={record} tab={tab} />
      </div>
    </section>
  );
}
