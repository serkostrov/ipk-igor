import {
  addBusinessDays,
  addCalendarDays,
  extractIsoDate,
} from "@/shared/lib/business-days";
import {
  allocateReceipts,
  roundMoney,
  sumPresent,
  type ReceiptAllocation,
} from "./calculations";

export type DealScheduleStageInput = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  paymentOrder: string;
  amountWithoutVat: number | null;
  vatRate: number | null;
  advanceWithoutVat: number | null;
  advanceDate: string | null;
  deferralDays: number | null;
  deferralBusinessDays: boolean;
};

export type DealSchedulePartKind = "advance" | "main";

export type DealSchedulePartStatus = "paid" | "partial" | "overdue" | "planned";

export type DealSchedulePart = {
  key: string;
  stageId: string;
  stageName: string;
  kind: DealSchedulePartKind;
  dueDate: string | null;
  amountWithVat: number;
  paid: number;
  /** ДДС operations that cover this part (FIFO by date). */
  payments: ReceiptAllocation[];
  remaining: number;
  status: DealSchedulePartStatus;
};

export type DealPaymentSchedule = {
  parts: DealSchedulePart[];
  plannedTotal: number | null;
  receivedTotal: number | null;
  remainingTotal: number | null;
  unallocated: number;
};

function withVat(amountWithoutVat: number, vatRate: number | null): number {
  return roundMoney(amountWithoutVat * (1 + (vatRate ?? 0) / 100));
}

function resolveMainDueDate(stage: DealScheduleStageInput): string | null {
  const end = extractIsoDate(stage.endDate);
  if (!end) return null;
  const days = Math.max(0, Math.round(stage.deferralDays ?? 0));
  return stage.deferralBusinessDays
    ? addBusinessDays(end, days)
    : addCalendarDays(end, days);
}

type PlannedPart = Omit<
  DealSchedulePart,
  "paid" | "payments" | "remaining" | "status"
>;

/**
 * Planned payment parts derived from contract stages («Порядок оплаты»):
 * «Аванс» — whole stage at start; «Постоплата» — whole stage after the end
 * plus deferral; «Частичный аванс+постоплата» — advance + the rest.
 */
function buildStageParts(stage: DealScheduleStageInput): PlannedPart[] {
  const total = stage.amountWithoutVat;
  if (total == null || total <= 0) return [];
  const order = stage.paymentOrder.toLocaleLowerCase("ru");
  const hasAdvance = order.includes("аванс");
  const hasPostpay = order.includes("постоплат") || !hasAdvance;
  const advanceWithoutVat = !hasAdvance
    ? 0
    : hasPostpay
      ? Math.min(total, Math.max(0, stage.advanceWithoutVat ?? 0))
      : total;
  const mainWithoutVat = roundMoney(total - advanceWithoutVat);
  const advanceDue =
    extractIsoDate(stage.advanceDate) ?? extractIsoDate(stage.startDate);

  const parts: PlannedPart[] = [];
  if (advanceWithoutVat > 0) {
    parts.push({
      key: `${stage.id}:advance`,
      stageId: stage.id,
      stageName: stage.name,
      kind: "advance",
      dueDate: advanceDue,
      amountWithVat: withVat(advanceWithoutVat, stage.vatRate),
    });
  }
  if (mainWithoutVat > 0) {
    parts.push({
      key: `${stage.id}:main`,
      stageId: stage.id,
      stageName: stage.name,
      kind: "main",
      dueDate: resolveMainDueDate(stage),
      amountWithVat: withVat(mainWithoutVat, stage.vatRate),
    });
  }
  return parts;
}

function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

/**
 * Plan from stages vs fact from incoming ДДС of the deal. Receipts are
 * spread over parts by date (FIFO) — the CRM has no explicit allocation.
 */
export function buildDealPaymentSchedule(input: {
  stages: readonly DealScheduleStageInput[];
  receipts: ReadonlyArray<{
    id: string;
    date: string | null;
    amountWithVat: number | null;
  }>;
  today: string;
}): DealPaymentSchedule {
  const planned = input.stages
    .flatMap(buildStageParts)
    .sort((a, b) => compareDue(a.dueDate, b.dueDate));
  const receipts = [...input.receipts]
    .map((receipt) => ({ ...receipt, date: extractIsoDate(receipt.date) }))
    .sort((a, b) => compareDue(a.date, b.date));
  const { allocations, unallocated } = allocateReceipts(
    planned.map((part) => part.amountWithVat),
    receipts.map((receipt) => ({
      id: receipt.id,
      amount: receipt.amountWithVat,
    })),
  );

  const parts = planned.map((part, index): DealSchedulePart => {
    const payments = allocations[index] ?? [];
    const partPaid = roundMoney(
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    );
    const remaining = roundMoney(Math.max(0, part.amountWithVat - partPaid));
    const status: DealSchedulePartStatus =
      remaining === 0
        ? "paid"
        : part.dueDate != null && part.dueDate < input.today
          ? "overdue"
          : partPaid > 0
            ? "partial"
            : "planned";
    return { ...part, paid: partPaid, payments, remaining, status };
  });

  return {
    parts,
    plannedTotal: sumPresent(parts.map((part) => part.amountWithVat)),
    receivedTotal: sumPresent(receipts.map((receipt) => receipt.amountWithVat)),
    remainingTotal: sumPresent(parts.map((part) => part.remaining)),
    unallocated,
  };
}
