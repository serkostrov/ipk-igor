import {
  fromDayNumber,
  toDayNumber,
  todayIsoDate,
} from "@/shared/lib/business-days";
import { formatDateDisplay } from "@/shared/lib/format-date";
import type {
  CalendarReceipt,
  PaymentRow,
  PaymentStatus,
  RecordRef,
  UnallocatedReceipt,
} from "./types";

export type GraphScale = "day" | "week" | "month" | "year";

export const GRAPH_SCALES: ReadonlyArray<{ value: GraphScale; label: string }> =
  [
    { value: "day", label: "День" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "year", label: "Год" },
  ];

export function parseGraphScale(value: unknown): GraphScale | null {
  return GRAPH_SCALES.some((item) => item.value === value)
    ? (value as GraphScale)
    : null;
}

export type GraphColumn = {
  key: string;
  label: string;
  /** Подпись месяца над колонками дней / недель (пусто для месяцев и лет). */
  band: string;
  start: number;
  days: number;
};

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

/** Запас дней до / после данных, чтобы было куда прокручивать. */
const RANGE_PAD: Record<GraphScale, number> = {
  day: 28,
  week: 84,
  month: 183,
  year: 730,
};

/** Предел ширины графика (в днях). */
const RANGE_MAX_SPAN: Record<GraphScale, number> = {
  day: 450,
  week: 900,
  month: 1500,
  year: 365 * 20,
};

function parseYearMonth(day: number) {
  const [year, month] = fromDayNumber(day).split("-").map(Number);
  return { year: year!, month: month! };
}

function monthStart(year: number, month: number) {
  return toDayNumber(`${year}-${String(month).padStart(2, "0")}-01`)!;
}

function alignStart(day: number, scale: GraphScale) {
  if (scale === "year") return monthStart(parseYearMonth(day).year, 1);
  if (scale === "month") {
    const { year, month } = parseYearMonth(day);
    return monthStart(year, month);
  }
  let start = day;
  // 1970-01-01 — четверг: (day + 3) % 7 === 0 по понедельникам.
  while ((start + 3) % 7 !== 0) start -= 1;
  return start;
}

function bandLabel(day: number) {
  const { year, month } = parseYearMonth(day);
  return `${MONTHS[month - 1]} ${year}`;
}

/** Колонки графика под выбранный масштаб, охватывающие все даты и сегодня. */
export function buildGraphColumns(
  scale: GraphScale,
  dates: readonly string[],
): GraphColumn[] {
  const today = toDayNumber(todayIsoDate())!;
  let min = today;
  let max = today;
  for (const iso of dates) {
    const day = toDayNumber(iso);
    if (day == null) continue;
    min = Math.min(min, day);
    max = Math.max(max, day);
  }

  let start = alignStart(min - RANGE_PAD[scale], scale);
  let end = max + RANGE_PAD[scale];
  const maxSpan = RANGE_MAX_SPAN[scale];
  if (end - start > maxSpan) {
    const room = Math.max(maxSpan - Math.max(max - min, 0), 0);
    start = alignStart(min - Math.floor(room / 2), scale);
    end = start + maxSpan;
  }

  const columns: GraphColumn[] = [];
  let day = start;
  while (day <= end) {
    let next: number;
    let label: string;
    let key: string;
    let band = "";
    if (scale === "day") {
      next = day + 1;
      key = String(day);
      label = fromDayNumber(day).slice(8, 10);
      band = bandLabel(day);
    } else if (scale === "week") {
      next = day + 7;
      key = String(day);
      label = formatDateDisplay(fromDayNumber(day));
      band = bandLabel(day);
    } else if (scale === "month") {
      const { year, month } = parseYearMonth(day);
      next =
        month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1);
      key = `${year}-${month}`;
      label = bandLabel(day);
    } else {
      const { year } = parseYearMonth(day);
      next = monthStart(year + 1, 1);
      key = String(year);
      label = String(year);
    }
    columns.push({ key, label, band, start: day, days: next - day });
    day = next;
  }
  return columns;
}

export function findGraphColumn(
  columns: readonly GraphColumn[],
  iso: string | null,
): GraphColumn | null {
  const day = iso ? toDayNumber(iso) : null;
  if (day == null) return null;
  return (
    columns.find(
      (column) => day >= column.start && day < column.start + column.days,
    ) ?? null
  );
}

export type GraphCell = {
  amount: number;
  paid: number;
  remaining: number;
  status: PaymentStatus;
  count: number;
};

export type GraphNodeKind = "counterparty" | "contract" | "stage";

export type GraphNode = {
  key: string;
  label: string;
  kind: GraphNodeKind;
  /** Запись, которую открывает клик по подписи (если есть). */
  ref: RecordRef | null;
  children: GraphNode[];
  /** Плановые платежи по колонкам (ключ колонки → ячейка). */
  cells: Record<string, GraphCell>;
};

export type PaymentGraph = {
  columns: GraphColumn[];
  tree: GraphNode[];
  plan: Record<string, number>;
  fact: Record<string, number>;
  unallocated: Record<string, number>;
};

/** Чем выше, тем «хуже» статус — им красится сводная ячейка. */
const STATUS_SEVERITY: Record<PaymentStatus, number> = {
  overdue: 4,
  partial: 3,
  planned: 2,
  overpaid: 1,
  paid: 0,
};

function addToCell(
  cells: Record<string, GraphCell>,
  columnKey: string,
  row: PaymentRow,
) {
  const cell = cells[columnKey];
  if (!cell) {
    cells[columnKey] = {
      amount: row.amount,
      paid: row.paid,
      remaining: row.remaining,
      status: row.status,
      count: 1,
    };
    return;
  }
  cell.amount += row.amount;
  cell.paid += row.paid;
  cell.remaining += row.remaining;
  cell.count += 1;
  if (STATUS_SEVERITY[row.status] > STATUS_SEVERITY[cell.status]) {
    cell.status = row.status;
  }
}

function addAmount(
  target: Record<string, number>,
  key: string,
  amount: number,
) {
  target[key] = (target[key] ?? 0) + amount;
}

function nodeFor(
  level: GraphNode[],
  index: Map<string, GraphNode>,
  node: Omit<GraphNode, "children" | "cells">,
) {
  const existing = index.get(node.key);
  if (existing) return existing;
  const created: GraphNode = { ...node, children: [], cells: {} };
  index.set(node.key, created);
  level.push(created);
  return created;
}

/** График: контрагент → договор → этап, платежи по колонкам дат. */
export function buildPaymentGraph(input: {
  rows: readonly PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  unallocated: readonly UnallocatedReceipt[];
  scale: GraphScale;
}): PaymentGraph {
  const { rows, receiptsById, unallocated, scale } = input;

  const dates: string[] = [];
  for (const row of rows) {
    if (row.dueDate) dates.push(row.dueDate);
    for (const share of row.receipts) {
      const date = receiptsById.get(share.receiptId)?.date;
      if (date) dates.push(date);
    }
  }
  for (const item of unallocated) dates.push(item.receipt.date);
  const columns = buildGraphColumns(scale, dates);

  const tree: GraphNode[] = [];
  const index = new Map<string, GraphNode>();
  const plan: Record<string, number> = {};
  const fact: Record<string, number> = {};
  const unallocatedByColumn: Record<string, number> = {};

  for (const row of rows) {
    const { stage } = row;
    const counterparty = stage.counterparty;
    const contract = stage.contract;
    const counterpartyNode = nodeFor(tree, index, {
      key: `cp:${counterparty?.id ?? "none"}`,
      label: counterparty?.name ?? "Без контрагента",
      kind: "counterparty",
      ref: null,
    });
    const contractNode = nodeFor(counterpartyNode.children, index, {
      key: `${counterpartyNode.key}/ct:${contract?.id ?? "none"}`,
      label: contract?.name ?? "Без договора",
      kind: "contract",
      ref: contract,
    });
    const stageNode = nodeFor(contractNode.children, index, {
      key: `${contractNode.key}/st:${stage.id}`,
      label: stage.name,
      kind: "stage",
      ref: { id: stage.id, name: stage.name, entityId: null },
    });

    const column = findGraphColumn(columns, row.dueDate);
    if (column) {
      for (const node of [counterpartyNode, contractNode, stageNode]) {
        addToCell(node.cells, column.key, row);
      }
      addAmount(plan, column.key, row.amount);
    }
    for (const share of row.receipts) {
      const factColumn = findGraphColumn(
        columns,
        receiptsById.get(share.receiptId)?.date ?? null,
      );
      if (factColumn) addAmount(fact, factColumn.key, share.amount);
    }
  }
  for (const item of unallocated) {
    const column = findGraphColumn(columns, item.receipt.date);
    if (column) addAmount(unallocatedByColumn, column.key, item.amount);
  }

  return { columns, tree, plan, fact, unallocated: unallocatedByColumn };
}
