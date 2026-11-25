import { roundMoney } from "../../deal-card/model/calculations";
import type {
  PaymentCalendarFilters,
  PaymentCalendarSummary,
  PaymentRow,
  PaymentStatus,
  UnallocatedReceipt,
} from "./types";

export const EMPTY_PAYMENT_FILTERS: PaymentCalendarFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  legalId: null,
  counterpartyId: null,
  section: null,
};

function inPeriod(date: string | null, filters: PaymentCalendarFilters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (!date) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

function matchesSearch(
  texts: ReadonlyArray<string | undefined>,
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase("ru");
  if (!needle) return true;
  return texts.some((text) => text?.toLocaleLowerCase("ru").includes(needle));
}

/** Фильтры, кроме раздела (счётчики разделов не зависят от выбранного). */
function matchesBase(row: PaymentRow, filters: PaymentCalendarFilters) {
  const { stage } = row;
  if (!inPeriod(row.dueDate, filters)) return false;
  if (filters.legalId && stage.legal?.id !== filters.legalId) return false;
  if (
    filters.counterpartyId &&
    stage.counterparty?.id !== filters.counterpartyId
  ) {
    return false;
  }
  return matchesSearch(
    [
      stage.contract?.name,
      stage.name,
      stage.legal?.name,
      stage.counterparty?.name,
    ],
    filters.search,
  );
}

function matchesUnallocated(
  item: UnallocatedReceipt,
  filters: PaymentCalendarFilters,
) {
  const { receipt } = item;
  if (!inPeriod(receipt.date, filters)) return false;
  if (filters.legalId && receipt.legalId !== filters.legalId) return false;
  if (
    filters.counterpartyId &&
    receipt.counterpartyId !== filters.counterpartyId
  ) {
    return false;
  }
  return matchesSearch([receipt.title], filters.search);
}

export function filterPaymentRows(
  rows: readonly PaymentRow[],
  filters: PaymentCalendarFilters,
): PaymentRow[] {
  const status =
    filters.section && filters.section !== "unallocated"
      ? filters.section
      : null;
  return rows.filter(
    (row) => matchesBase(row, filters) && (!status || row.status === status),
  );
}

export function filterUnallocated(
  items: readonly UnallocatedReceipt[],
  filters: PaymentCalendarFilters,
): UnallocatedReceipt[] {
  return items.filter((item) => matchesUnallocated(item, filters));
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
