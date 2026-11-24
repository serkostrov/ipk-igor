import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import type { DealCardData } from "../model/deal-data";
import type { DealCardView } from "../model/deal-card-view";
import { dateOrDash, moneyOrDash } from "../model/format";
import type {
  DealSchedulePartKind,
  DealSchedulePartStatus,
} from "../model/payment-schedule";
import type { DealCardSources } from "../match";
import {
  DealEmptyState,
  DealPanel,
  DealRecordLink,
  DealStatusBadge,
} from "./shared";

const KIND_LABELS: Record<DealSchedulePartKind, string> = {
  advance: "Аванс",
  main: "Основной платёж",
};

const STATUS_VIEW: Record<
  DealSchedulePartStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  paid: { label: "Оплачено", tone: "success" },
  partial: { label: "Частично", tone: "warning" },
  overdue: { label: "Просрочено", tone: "danger" },
  planned: { label: "Ожидается", tone: "neutral" },
};

/** Planned receipts from contract stages, matched with the deal's ДДС. */
export function DealPaymentPlanPanel({
  sources,
  data,
  view,
  onOpenRelation,
}: {
  sources: DealCardSources;
  data: DealCardData;
  view: DealCardView;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const { schedule } = view;
  const receiptsById = new Map(
    data.receipts.map((receipt) => [receipt.id, receipt]),
  );

  return (
    <DealPanel
      title="План поступлений"
      description="По этапам договора: «Порядок оплаты», аванс, дата окончания и отсрочка. Поступления ниже закрывают платежи по порядку сроков."
    >
      {schedule.parts.length === 0 ? (
        <DealEmptyState>
          Нет этапов договора с суммой — план строится по этапам на вкладке
          «Договор».
        </DealEmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Этап</TableHead>
              <TableHead>Платёж</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead className="text-right">План (с НДС)</TableHead>
              <TableHead>Оплата</TableHead>
              <TableHead className="text-right">Остаток</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.parts.map((part) => (
              <TableRow key={part.key}>
                <TableCell>
                  <DealRecordLink
                    entityId={sources.stage?.id}
                    recordId={part.stageId}
                    title={part.stageName}
                    onOpenRelation={onOpenRelation}
                  />
                </TableCell>
                <TableCell>{KIND_LABELS[part.kind]}</TableCell>
                <TableCell>{dateOrDash(part.dueDate)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(part.amountWithVat)}
                </TableCell>
                <TableCell>
                  {part.payments.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {part.payments.map((payment) => (
                        <DealRecordLink
                          key={payment.receiptId}
                          entityId={sources.dds?.id}
                          recordId={payment.receiptId}
                          title={`${dateOrDash(receiptsById.get(payment.receiptId)?.date)} · ${moneyOrDash(payment.amount)}`}
                          onOpenRelation={onOpenRelation}
                        />
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(part.remaining)}
                </TableCell>
                <TableCell>
                  <DealStatusBadge tone={STATUS_VIEW[part.status].tone}>
                    {STATUS_VIEW[part.status].label}
                  </DealStatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                Итого
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {moneyOrDash(schedule.plannedTotal)}
              </TableCell>
              <TableCell className="font-medium tabular-nums">
                {moneyOrDash(schedule.receivedTotal)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {moneyOrDash(schedule.remainingTotal)}
              </TableCell>
              <TableCell />
            </TableRow>
            {schedule.unallocated > 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Поступило сверх плана
                </TableCell>
                <TableCell className="tabular-nums">
                  {moneyOrDash(schedule.unallocated)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            ) : null}
          </TableFooter>
        </Table>
      )}
    </DealPanel>
  );
}
