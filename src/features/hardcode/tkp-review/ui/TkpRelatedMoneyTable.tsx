/**
 * Simple CRUD table for командировки / подряд on «Разбор ТКП».
 */

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  addEntityRecord,
  getEntityRecordTitle,
  getRecordFieldNumber,
  isEntityNameField,
  removeEntityRecord,
  updateEntityRecord,
  useEntityValueContext,
  waitForEntityRecordInsert,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { formatDeptMoney } from "../../dept-calculations/model/aggregation";
import {
  resolveTkpRelatedMoneyFields,
  type TkpRelatedMoneyFields,
} from "../model/match-related";

type TkpRelatedMoneyTableProps = {
  title: string;
  emptyText: string;
  entity: Entity | null;
  records: EntityRecord[];
  parentRecordId: string;
  parentLinkFieldId: string | null;
  readOnly?: boolean;
};

export function TkpRelatedMoneyTable({
  title,
  emptyText,
  entity,
  records,
  parentRecordId,
  parentLinkFieldId,
  readOnly = false,
}: TkpRelatedMoneyTableProps) {
  const fields = useMemo(
    () => (entity ? resolveTkpRelatedMoneyFields(entity) : null),
    [entity],
  );
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!entity || !fields) {
    return (
      <section className="space-y-2 rounded-md border bg-card p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Связанная сущность не найдена — расчёт работает без этих строк.
        </p>
      </section>
    );
  }

  async function handleAdd() {
    if (!entity || !fields || readOnly) return;
    const amount = Number(draftAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return;
    setBusy(true);
    try {
      const values: Record<string, string> = {};
      if (parentLinkFieldId) {
        values[parentLinkFieldId] = parentRecordId;
      }
      if (fields.title) values[fields.title.id] = draftTitle.trim() || title;
      if (fields.amount) values[fields.amount.id] = String(amount);
      const nameField = entity.fields.find((f) => isEntityNameField(f));
      if (nameField && !values[nameField.id]) {
        values[nameField.id] = draftTitle.trim() || title;
      }
      const created = addEntityRecord(entity.id, values);
      await waitForEntityRecordInsert(created.id);
      setDraftTitle("");
      setDraftAmount("");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(target: EntityRecord) {
    if (readOnly || !entity) return;
    removeEntityRecord(entity.id, target.id);
  }

  function handleAmountBlur(target: EntityRecord, raw: string) {
    if (readOnly || !entity || !fields?.amount) return;
    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return;
    updateEntityRecord(entity.id, target.id, {
      ...target.values,
      [fields.amount.id]: String(amount),
    });
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {records.length} поз.
        </span>
      </div>

      {records.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead className="w-36 text-right">Сумма</TableHead>
                {!readOnly ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <RelatedRow
                  key={record.id}
                  entity={entity}
                  record={record}
                  fields={fields}
                  readOnly={readOnly}
                  onAmountBlur={handleAmountBlur}
                  onDelete={() => void handleDelete(record)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label className="text-[11px] text-muted-foreground">
              Название
            </label>
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Название"
            />
          </div>
          <div className="w-36 space-y-1">
            <label className="text-[11px] text-muted-foreground">Сумма</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || !draftAmount.trim()}
            onClick={() => void handleAdd()}
          >
            <Plus className="size-3.5" />
            Добавить
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function RelatedRow({
  entity,
  record,
  fields,
  readOnly,
  onAmountBlur,
  onDelete,
}: {
  entity: Entity;
  record: EntityRecord;
  fields: TkpRelatedMoneyFields;
  readOnly: boolean;
  onAmountBlur: (record: EntityRecord, raw: string) => void;
  onDelete: () => void;
}) {
  const ctx = useEntityValueContext();
  const title = getEntityRecordTitle(ctx, entity, record);
  const amount = fields.amount
    ? (getRecordFieldNumber(ctx, entity, record, fields.amount) ?? 0)
    : 0;
  const [localAmount, setLocalAmount] = useState(String(amount));

  return (
    <TableRow>
      <TableCell className="font-medium">{title || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {readOnly || !fields.amount ? (
          formatDeptMoney(amount)
        ) : (
          <Input
            className="h-8 text-right"
            type="number"
            min="0"
            step="0.01"
            value={localAmount}
            onChange={(e) => setLocalAmount(e.target.value)}
            onBlur={() => onAmountBlur(record, localAmount)}
          />
        )}
      </TableCell>
      {!readOnly ? (
        <TableCell className="text-right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
