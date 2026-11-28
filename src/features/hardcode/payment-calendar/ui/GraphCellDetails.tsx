import { useMemo } from "react";
import {
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  TimelineGroupRecordsDialog,
  type TimelineCellRow,
} from "@/pages/entity/ui/TimelineGroupRecordsDialog";
import { dateOrDash, moneyOrDash } from "../../deal-card/model/format";
import { KIND_LABELS, STATUS_VIEW } from "../model/labels";
import type { CalendarReceipt, PaymentRow } from "../model/types";
import type { OpenRecord } from "./types";

export type GraphCellSelection = { label: string; period: string } & (
  | { kind: "plan"; rows: PaymentRow[] }
  | { kind: "fact"; receipts: ReadonlyMap<string, number> }
);

export function GraphCellDetails({
  selection,
  onClose,
  receiptsById,
  entity,
  stageEntityId,
  planRecordOf,
  onOpenRecord,
  onReceive,
}: {
  selection: GraphCellSelection;
  onClose: () => void;
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  entity: Entity;
  stageEntityId?: string;
  planRecordOf: (row: PaymentRow) => EntityRecord;
  onOpenRecord?: OpenRecord;
  onReceive?: (row: PaymentRow) => void;
}) {
  const ctx = useEntityValueContext();
  const rows = useMemo((): TimelineCellRow[] => {
    if (selection.kind === "plan") {
      return selection.rows.map((row) => ({
        record: planRecordOf(row),
        title: [row.stage.contract?.name, row.stage.name, KIND_LABELS[row.kind]]
          .filter(Boolean)
          .join(" · "),
        period: [
          dateOrDash(row.dueDate),
          STATUS_VIEW[row.status].label,
          "Остаток " + moneyOrDash(row.remaining),
        ].join(" · "),
        amount: moneyOrDash(row.amount),
        onOpen:
          stageEntityId && onOpenRecord
            ? () => onOpenRecord(stageEntityId, row.stage.id)
            : null,
        action:
          onReceive && row.remaining > 0
            ? {
                label: "Перевести в факт",
                run: () => {
                  onClose();
                  onReceive(row);
                },
              }
            : undefined,
      }));
    }
    const result: TimelineCellRow[] = [];
    for (const [id, amount] of selection.receipts) {
      const record = ctx.getRecord(entity.id, id);
      const receipt = receiptsById.get(id);
      if (record && receipt)
        result.push({
          record,
          title: receipt.title,
          period: dateOrDash(receipt.date),
          amount: moneyOrDash(amount),
        });
    }
    return result;
  }, [
    ctx,
    entity.id,
    selection,
    receiptsById,
    stageEntityId,
    planRecordOf,
    onOpenRecord,
    onReceive,
    onClose,
  ]);
  return (
    <TimelineGroupRecordsDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      entity={entity}
      cellRows={rows}
      groupLabel={
        selection.kind === "plan"
          ? "Плановые поступления"
          : "Фактические поступления"
      }
      cellLabel={[selection.label, selection.period].join(" · ")}
    />
  );
}
