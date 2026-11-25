import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { cn } from "@/shared/lib/cn";
import { dateOrDash, moneyOrDash } from "../../deal-card/model/format";
import { DealRecordLink, DealStatusBadge } from "../../deal-card/ui/shared";
import { KIND_LABELS, STATUS_VIEW } from "../model/labels";
import { lastReceiptDate } from "../model/schedule";
import {
  tableCellClass,
  tableFootCellClass,
  tableFootLabelClass,
  tableFooterClass,
  tableHeadClass,
} from "./table-styles";
import type { PaymentTableProps } from "./types";

const COLUMNS = [
  { label: "План. дата", width: 112 },
  { label: "Договор", width: 224 },
  { label: "Этап", width: 224 },
  { label: "Юрлицо", width: 176 },
  { label: "Контрагент", width: 192 },
  { label: "Тип", width: 112 },
  { label: "Приёмка", width: 128 },
  { label: "Отсрочка", width: 128 },
  { label: "План", width: 144 },
  { label: "Факт. дата", width: 112 },
  { label: "Факт", width: 144 },
  { label: "Остаток", width: 144 },
  { label: "Просрочка, дн.", width: 128 },
  { label: "Статус", width: 160 },
  { label: "Операции ДДС", width: 224 },
] as const;

const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);
const PLAN_COLUMN = 8;
const FACT_COLUMN = 10;
const REMAINING_COLUMN = 11;

/** «5 раб. дн.» / «10 кал. дн.»; «—», когда срок не задан. */
function formatPeriod(days: number, kind: "calendar" | "business") {
  if (days <= 0) return "—";
  return `${days} ${kind === "business" ? "раб." : "кал."} дн.`;
}

export type PaymentTableTotals = {
  planned: number;
  received: number;
  remaining: number;
};

/** One flat row per payment — the same table look as the DDS section. */
export function PaymentTable({
  rows,
  receiptsById,
  stageEntityId,
  ddsEntityId,
  totals,
  onOpenRecord,
}: PaymentTableProps & { totals: PaymentTableTotals }) {
  const footTotals: Record<number, number> = {
    [PLAN_COLUMN]: totals.planned,
    [FACT_COLUMN]: totals.received,
    [REMAINING_COLUMN]: totals.remaining,
  };

  return (
    <Table
      className="table-fixed text-[13px]"
      containerClassName="overflow-visible"
      style={{ width: TABLE_WIDTH, minWidth: "100%" }}
    >
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          {COLUMNS.map((column) => (
            <TableHead
              key={column.label}
              className={tableHeadClass}
              style={{ width: column.width }}
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child]:border-b">
        {rows.map((row) => {
          const { stage } = row;
          const status = STATUS_VIEW[row.status];
          const firstReceipt = row.receipts[0];
          const receipt = firstReceipt
            ? receiptsById.get(firstReceipt.receiptId)
            : undefined;
          const extra = row.receipts.length - 1;
          return (
            <TableRow key={row.key} className="border-border/70">
              <TableCell
                className={cn(tableCellClass, "font-medium text-foreground")}
              >
                {dateOrDash(row.dueDate)}
              </TableCell>
              <TableCell className={cn(tableCellClass, "truncate")}>
                {stage.contract ? (
                  <DealRecordLink
                    entityId={stage.contract.entityId ?? undefined}
                    recordId={stage.contract.id}
                    title={stage.contract.name}
                    onOpenRelation={onOpenRecord}
                  />
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell className={cn(tableCellClass, "truncate")}>
                <DealRecordLink
                  entityId={stageEntityId}
                  recordId={stage.id}
                  title={stage.name}
                  onOpenRelation={onOpenRecord}
                />
              </TableCell>
              <TableCell
                className={cn(tableCellClass, "truncate")}
                title={stage.legal?.name}
              >
                {stage.legal?.name ?? "—"}
              </TableCell>
              <TableCell
                className={cn(tableCellClass, "truncate")}
                title={stage.counterparty?.name}
              >
                {stage.counterparty?.name ?? "—"}
              </TableCell>
              <TableCell className={tableCellClass}>
                {KIND_LABELS[row.kind]}
              </TableCell>
              <TableCell className={tableCellClass}>
                {row.kind === "postpay"
                  ? formatPeriod(stage.acceptanceDays, stage.acceptanceKind)
                  : "—"}
              </TableCell>
              <TableCell className={tableCellClass}>
                {row.kind === "postpay"
                  ? formatPeriod(stage.deferralDays, stage.deferralKind)
                  : "—"}
              </TableCell>
              <TableCell className={cn(tableCellClass, "tabular-nums")}>
                {moneyOrDash(row.amount)}
              </TableCell>
              <TableCell className={tableCellClass}>
                {dateOrDash(lastReceiptDate(row, receiptsById))}
              </TableCell>
              <TableCell className={cn(tableCellClass, "tabular-nums")}>
                {moneyOrDash(row.paid)}
              </TableCell>
              <TableCell className={cn(tableCellClass, "tabular-nums")}>
                {moneyOrDash(row.remaining)}
              </TableCell>
              <TableCell className={cn(tableCellClass, "tabular-nums")}>
                {row.overdueDays > 0 ? row.overdueDays : "—"}
              </TableCell>
              <TableCell className={tableCellClass}>
                <DealStatusBadge tone={status.tone}>
                  {status.label}
                </DealStatusBadge>
              </TableCell>
              <TableCell className={tableCellClass}>
                {firstReceipt ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate">
                      <DealRecordLink
                        entityId={ddsEntityId}
                        recordId={firstReceipt.receiptId}
                        title={receipt?.title ?? firstReceipt.receiptId}
                        onOpenRelation={onOpenRecord}
                      />
                    </span>
                    {extra > 0 ? (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] leading-none font-semibold text-muted-foreground tabular-nums">
                        +{extra}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter className={tableFooterClass}>
        <TableRow className="h-9 hover:bg-transparent">
          {COLUMNS.map((column, index) => (
            <TableCell key={column.label} className={tableFootCellClass}>
              {index === 0 ? (
                <span className={tableFootLabelClass}>Итог</span>
              ) : index in footTotals ? (
                <span className="block truncate tabular-nums">
                  {moneyOrDash(footTotals[index])}
                </span>
              ) : null}
            </TableCell>
          ))}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
