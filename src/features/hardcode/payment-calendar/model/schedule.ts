import { parseIsoDate } from "@/shared/lib/business-days";
import { roundMoney } from "../../deal-card/model/calculations";
import { buildStageParts } from "./plan";
import type {
  CalendarReceipt,
  CalendarStage,
  PaymentAllocation,
  PaymentCalendar,
  PaymentRow,
  PaymentStatus,
  PlannedPart,
  ReceiptShare,
  UnallocatedReceipt,
} from "./types";

const DAY_MS = 86_400_000;

function compareDue(a: PlannedPart, b: PlannedPart): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate == null) return 1;
  if (b.dueDate == null) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function daysBetween(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/**
 * Плановые платежи, к которым может относиться поступление: сначала по этапу,
 * затем по договору, затем по сделке (самая узкая непустая связь). Без этих
 * связей — по контрагенту и юрлицу (`weak`): такое совпадение принимается
 * только при однозначном совпадении суммы.
 */
function candidateParts(
  receipt: CalendarReceipt,
  parts: readonly PlannedPart[],
): { parts: PlannedPart[]; weak: boolean } {
  const scopes: Array<(part: PlannedPart) => boolean> = [];
  if (receipt.stageId) {
    scopes.push((part) => part.stage.id === receipt.stageId);
  }
  if (receipt.contractId) {
    scopes.push((part) => part.stage.contract?.id === receipt.contractId);
  }
  if (receipt.dealId) {
    scopes.push((part) => part.stage.dealId === receipt.dealId);
  }
  for (const inScope of scopes) {
    const found = parts.filter(inScope);
    if (found.length > 0) return { parts: found, weak: false };
  }
  if (!receipt.counterpartyId) return { parts: [], weak: false };
  return {
    parts: parts.filter(
      (part) =>
        part.stage.counterparty?.id === receipt.counterpartyId &&
        (!receipt.legalId ||
          !part.stage.legal ||
          part.stage.legal.id === receipt.legalId),
    ),
    weak: true,
  };
}

export function lastReceiptDate(
  row: PaymentRow,
  receiptsById: ReadonlyMap<string, CalendarReceipt>,
): string | null {
  const dates = row.receipts
    .map((share) => receiptsById.get(share.receiptId)?.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  return dates[dates.length - 1] ?? null;
}

function resolveStatus(
  part: PlannedPart,
  paid: number,
  today: string,
): PaymentStatus {
  if (paid === part.amount) return "paid";
  if (paid > part.amount) return "overpaid";
  if (part.dueDate != null && part.dueDate < today) return "overdue";
  return paid > 0 ? "partial" : "planned";
}

/**
 * Плановые платежи по этапам + сопоставление с фактическими поступлениями ДДС.
 *
 * Поступление гасит платежи своей области (этап → договор → сделка): если ровно
 * один платёж совпадает по сумме — он, иначе по порядку сроков. Остаток при
 * привязке к этапу — переплата последнего платежа, при более широкой связи —
 * «нераспределённый остаток».
 */
export function buildPaymentCalendar(input: {
  stages: readonly CalendarStage[];
  receipts: readonly CalendarReceipt[];
  allocations?: readonly PaymentAllocation[];
  today: string;
}): PaymentCalendar {
  const parts = input.stages.flatMap(buildStageParts).sort(compareDue);
  const partByKey = new Map(parts.map((part) => [part.key, part]));
  const open = new Map(parts.map((part) => [part.key, part.amount]));
  const shares = new Map<string, ReceiptShare[]>();
  const unallocated: UnallocatedReceipt[] = [];

  const assign = (
    part: PlannedPart,
    receipt: CalendarReceipt,
    amount: number,
    manual = false,
  ) => {
    const list = shares.get(part.key) ?? [];
    list.push({ receiptId: receipt.id, amount, manual });
    shares.set(part.key, list);
    open.set(part.key, roundMoney((open.get(part.key) ?? 0) - amount));
  };

  // Manual links come first and are taken as is (any date): the user decided.
  // Such operations are not matched automatically; what is left of them is
  // shown as unallocated.
  const receiptById = new Map(input.receipts.map((item) => [item.id, item]));
  const manualRest = new Map<string, number>();
  for (const allocation of input.allocations ?? []) {
    const receipt = receiptById.get(allocation.ddsRecordId);
    if (!receipt) continue;
    const rest = manualRest.get(receipt.id) ?? receipt.amount;
    const part = partByKey.get(`${allocation.stageId}:${allocation.partKind}`);
    if (!part) {
      manualRest.set(receipt.id, rest);
      continue;
    }
    assign(part, receipt, allocation.amount, true);
    manualRest.set(receipt.id, roundMoney(rest - allocation.amount));
  }
  for (const [receiptId, rest] of manualRest) {
    const receipt = receiptById.get(receiptId);
    if (receipt && rest > 0) unallocated.push({ receipt, amount: rest });
  }

  const facts = input.receipts
    .filter(
      (receipt) =>
        receipt.date <= input.today &&
        receipt.amount > 0 &&
        !manualRest.has(receipt.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const receipt of facts) {
    const scope = candidateParts(receipt, parts);
    let rest = receipt.amount;
    const exact = scope.parts.filter((part) => open.get(part.key) === rest);
    if (scope.weak && exact.length !== 1) {
      unallocated.push({ receipt, amount: rest });
      continue;
    }
    const candidates = scope.weak ? exact : scope.parts;
    for (const part of exact.length === 1 ? exact : candidates) {
      const need = open.get(part.key) ?? 0;
      if (rest <= 0) break;
      if (need <= 0) continue;
      const amount = Math.min(need, rest);
      assign(part, receipt, amount);
      rest = roundMoney(rest - amount);
    }
    if (rest <= 0) continue;
    const overpaid = candidates[candidates.length - 1];
    if (overpaid && overpaid.stage.id === receipt.stageId) {
      assign(overpaid, receipt, rest);
    } else {
      unallocated.push({ receipt, amount: rest });
    }
  }

  const rows = parts.map((part): PaymentRow => {
    const receipts = shares.get(part.key) ?? [];
    const paid = roundMoney(
      receipts.reduce((sum, share) => sum + share.amount, 0),
    );
    const status = resolveStatus(part, paid, input.today);
    return {
      ...part,
      paid,
      remaining: roundMoney(Math.max(0, part.amount - paid)),
      overdueDays:
        status === "overdue" && part.dueDate
          ? daysBetween(part.dueDate, input.today)
          : 0,
      status,
      receipts,
    };
  });

  return {
    rows,
    receiptsById: new Map(
      input.receipts.map((receipt) => [receipt.id, receipt]),
    ),
    unallocated,
  };
}
