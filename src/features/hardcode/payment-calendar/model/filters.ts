import { roundMoney } from "../../deal-card/model/calculations";
import type {
  PaymentCalendarFilters,
  PaymentCalendarSummary,
  PaymentRow,
  PaymentStatus,
  UnallocatedReceipt,
} from "./types";

export const EMPTY_PAYMENT_FILTERS: PaymentCalendarFilters = {
  period: null,
  legalId: null,
  counterpartyId: null,
  status: null,
};

/** Фильтры, кроме статуса (счётчики статусов не зависят от выбранного статуса). */
function matchesBase(row: PaymentRow, filters: PaymentCalendarFilters) {
  const { period, legalId, counterpartyId } = filters;
  if (period) {
    if (!row.dueDate) return false;
    if (row.dueDate < period.start || row.dueDate > period.end) return false;
  }
  if (legalId && row.stage.legal?.id !== legalId) return false;
  if (counterpartyId && row.stage.counterparty?.id !== counterpartyId) {
    return false;
  }
  return true;
}

export function filterPaymentRows(
  rows: readonly PaymentRow[],
  filters: PaymentCalendarFilters,
): PaymentRow[] {
  return rows.filter(
    (row) =>
      matchesBase(row, filters) &&
      (!filters.status || row.status === filters.status),
  );
}

export function countByStatus(
  rows: readonly PaymentRow[],
  filters: PaymentCalendarFilters,
): Record<PaymentStatus, number> {
  const counts: Record<PaymentStatus, number> = {
    planned: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
    overpaid: 0,
  };
  for (const row of rows) {
    if (matchesBase(row, filters)) counts[row.status] += 1;
  }
  return counts;
}

function sum(rows: readonly PaymentRow[], pick: (row: PaymentRow) => number) {
  return roundMoney(rows.reduce((total, row) => total + pick(row), 0));
}

export function summarizePayments(
  rows: readonly PaymentRow[],
  unallocated: readonly UnallocatedReceipt[],
): PaymentCalendarSummary {
  const unpaid = rows.filter((row) => row.remaining > 0);
  return {
    planned: sum(rows, (row) => row.amount),
    received: sum(rows, (row) => row.paid),
    expected: sum(
      unpaid.filter((row) => row.status !== "overdue"),
      (row) => row.remaining,
    ),
    overdue: sum(
      unpaid.filter((row) => row.status === "overdue"),
      (row) => row.remaining,
    ),
    partial: sum(
      unpaid.filter((row) => row.paid > 0),
      (row) => row.paid,
    ),
    unpaidCount: unpaid.length,
    unallocated: roundMoney(
      unallocated.reduce((total, item) => total + item.amount, 0),
    ),
  };
}
