import type { GraphColumn } from "./graph";
import { findGraphColumn } from "./graph";
import type {
  CalendarReceipt,
  PaymentRow,
  PaymentStatus,
  RecordRef,
  UnallocatedReceipt,
} from "./types";

export type PlanCell = {
  amount: number;
  /** Самый «тяжёлый» статус среди платежей ячейки — им красится ячейка. */
  status: PaymentStatus;
  count: number;
};

export type PlanNodeKind =
  "root" | "legal" | "counterparty" | "contract" | "stage" | "unallocated";

export type PlanNode = {
  key: string;
  label: string;
  kind: PlanNodeKind;
  /** Запись, которую открывает клик по подписи (если есть). */
  ref: RecordRef | null;
  children: PlanNode[];
  /** Плановые суммы по колонкам (ключ колонки → ячейка). */
  plan: Record<string, PlanCell>;
  /** Фактические суммы (привязанные поступления) по колонкам. */
  fact: Record<string, number>;
  /** Платёжные строки узла — для расшифровки по клику на ячейку. */
  rows: PaymentRow[];
};

const STATUS_SEVERITY: Record<PaymentStatus, number> = {
  overdue: 4,
  partial: 3,
  planned: 2,
  overpaid: 1,
  paid: 0,
};

function createNode(
  key: string,
  label: string,
  kind: PlanNodeKind,
  ref: RecordRef | null,
): PlanNode {
  return { key, label, kind, ref, children: [], plan: {}, fact: {}, rows: [] };
}

function child(
  parent: PlanNode,
  index: Map<string, PlanNode>,
  key: string,
  label: string,
  kind: PlanNodeKind,
  ref: RecordRef | null,
) {
  const existing = index.get(key);
  if (existing) return existing;
  const created = createNode(key, label, kind, ref);
  index.set(key, created);
  parent.children.push(created);
  return created;
}

function addPlan(node: PlanNode, columnKey: string, row: PaymentRow) {
  node.rows.push(row);
  const cell = node.plan[columnKey];
  if (!cell) {
    node.plan[columnKey] = {
      amount: row.amount,
      status: row.status,
      count: 1,
    };
    return;
  }
  cell.amount += row.amount;
  cell.count += 1;
  if (STATUS_SEVERITY[row.status] > STATUS_SEVERITY[cell.status]) {
    cell.status = row.status;
  }
}

function addFact(node: PlanNode, columnKey: string, amount: number) {
  node.fact[columnKey] = (node.fact[columnKey] ?? 0) + amount;
}

/**
 * Plan vs fact tree of the calendar graph: юрлицо → контрагент → договор → этап.
 * The plan sits in the column of the due date, the fact — in the column of the
 * date of the linked ДДС operation.
 */
export function buildPlanGraph(input: {
  rows: readonly PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  unallocated: readonly UnallocatedReceipt[];
  columns: readonly GraphColumn[];
}): PlanNode {
  const { rows, receiptsById, unallocated, columns } = input;
  const root = createNode("plan:root", "Плановые поступления", "root", null);
  const index = new Map<string, PlanNode>();

  for (const row of rows) {
    const { stage } = row;
    const legalNode = child(
      root,
      index,
      `plan:lg:${stage.legal?.id ?? "none"}`,
      stage.legal?.name ?? "Без юрлица",
      "legal",
      null,
    );
    const counterpartyNode = child(
      legalNode,
      index,
      `${legalNode.key}/cp:${stage.counterparty?.id ?? "none"}`,
      stage.counterparty?.name ?? "Без контрагента",
      "counterparty",
      null,
    );
    const contractNode = child(
      counterpartyNode,
      index,
      `${counterpartyNode.key}/ct:${stage.contract?.id ?? "none"}`,
      stage.contract?.name ?? "Без договора",
      "contract",
      stage.contract,
    );
    const stageNode = child(
      contractNode,
      index,
      `${contractNode.key}/st:${stage.id}`,
      stage.name,
      "stage",
      { id: stage.id, name: stage.name, entityId: null },
    );
    const path = [root, legalNode, counterpartyNode, contractNode, stageNode];

    const dueColumn = findGraphColumn(columns, row.dueDate);
    if (dueColumn) for (const node of path) addPlan(node, dueColumn.key, row);
    for (const share of row.receipts) {
      const factColumn = findGraphColumn(
        columns,
        receiptsById.get(share.receiptId)?.date ?? null,
      );
      if (factColumn) {
        for (const node of path) addFact(node, factColumn.key, share.amount);
      }
    }
  }

  if (unallocated.length > 0) {
    const node = createNode(
      "plan:unallocated",
      "Нераспределённые поступления",
      "unallocated",
      null,
    );
    for (const item of unallocated) {
      const column = findGraphColumn(columns, item.receipt.date);
      if (column) addFact(node, column.key, item.amount);
    }
    root.children.push(node);
  }
  return root;
}
