import { useMemo } from "react";
import { Loader } from "@/shared/ui/loader";
import type { EntityRecord } from "@/entities/entity";
import { usePaymentCalendar } from "../../payment-calendar/lib/use-payment-calendar";
import { summarizePayments } from "../../payment-calendar/model/filters";
import { PaymentTable } from "../../payment-calendar/ui/PaymentTable";
import { UnallocatedTable } from "../../payment-calendar/ui/UnallocatedTable";
import { DealEmptyState, DealPanel } from "./shared";

/** Payment calendar rows of this deal (plan from stages vs. fact from ДДС). */
export function DealPaymentCalendarPanel({
  record,
  onOpenRelation,
}: {
  record: EntityRecord;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const { sources, ready, calendar } = usePaymentCalendar();

  const rows = useMemo(
    () => calendar?.rows.filter((row) => row.stage.dealId === record.id) ?? [],
    [calendar, record.id],
  );
  const unallocated = useMemo(
    () =>
      calendar?.unallocated.filter(
        (item) => item.receipt.dealId === record.id,
      ) ?? [],
    [calendar, record.id],
  );
  const totals = useMemo(() => {
    const sums = summarizePayments(rows, []);
    return {
      planned: sums.planned,
      received: sums.received,
      remaining: sums.expected + sums.overdue,
    };
  }, [rows]);

  return (
    <DealPanel
      title="План поступлений"
      description="Из платёжного календаря: аванс и постоплата по этапам договоров сделки и фактические поступления из ДДС."
    >
      {!ready || !calendar || !sources ? (
        <Loader block label="Загрузка…" />
      ) : rows.length === 0 && unallocated.length === 0 ? (
        <DealEmptyState>
          Нет плановых платежей: план строится по этапам договора с суммой.
        </DealEmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <PaymentTable
                rows={rows}
                receiptsById={calendar.receiptsById}
                stageEntityId={sources.stage?.id}
                ddsEntityId={sources.dds?.id}
                totals={totals}
                onOpenRecord={onOpenRelation}
              />
            </div>
          ) : null}
          {unallocated.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Нераспределённые поступления
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <UnallocatedTable
                  items={unallocated}
                  ddsEntityId={sources.dds?.id}
                  onOpenRecord={onOpenRelation}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </DealPanel>
  );
}
