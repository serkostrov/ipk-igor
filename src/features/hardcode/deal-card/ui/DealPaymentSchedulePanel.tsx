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

export function DealPaymentSchedulePanel({
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

  return (
    <div className="flex flex-col gap-4">
      <DealPanel
        title="Плановые поступления"
        description="Строятся из этапов договора: «Порядок оплаты», аванс, дата окончания и отсрочка. Поступления ДДС распределяются по срокам по порядку."
      >
        {schedule.parts.length === 0 ? (
          <DealEmptyState>
            Нет этапов договора с суммой — график строится по этапам на вкладке
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
                <TableHead className="text-right">Оплачено</TableHead>
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
                  <TableCell className="text-right tabular-nums">
                    {moneyOrDash(part.paid)}
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
                <TableCell className="text-right font-medium tabular-nums">
                  {moneyOrDash(schedule.receivedTotal)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {moneyOrDash(schedule.remainingTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
              {schedule.unallocated > 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Поступило сверх графика
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyOrDash(schedule.unallocated)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              ) : null}
            </TableFooter>
          </Table>
        )}
      </DealPanel>

      <DealPanel
        title="Фактические поступления (ДДС)"
        description="Операции ДДС, привязанные к сделке, с типом движения «Поступление»."
      >
        {data.receipts.length === 0 ? (
          <DealEmptyState>Поступлений по сделке пока нет.</DealEmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Операция</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead className="text-right">Сумма (с НДС)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>
                    <DealRecordLink
                      entityId={sources.dds?.id}
                      recordId={receipt.id}
                      title={receipt.title}
                      onOpenRelation={onOpenRelation}
                    />
                  </TableCell>
                  <TableCell>{dateOrDash(receipt.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyOrDash(receipt.amountWithVat)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DealPanel>
    </div>
  );
}
