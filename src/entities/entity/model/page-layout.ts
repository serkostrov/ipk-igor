import { getEntityRelationTargetId } from "./field";
import { getRecordFieldIds, getRecordFieldNumber } from "./field-value";
import {
  getEntityListOption,
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityPageAggregateCashFlow,
  type EntityPageAggregatePanel,
  type EntityPageFiltersPanel,
  type EntityPageLayout,
  type EntityPagePanel,
  type EntityPageRecordsPanel,
  type EntityPageRow,
  type EntityRecord,
} from "./types";
import type { EntityValueContext } from "./field-value";

function newPageLayoutId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeColumns(value: unknown, panelCount: number): number[] {
  const raw = Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item) && item > 0,
      )
    : [];
  if (raw.length === panelCount && panelCount > 0) return raw;
  return Array.from({ length: Math.max(panelCount, 1) }, () => 1);
}

function normalizeRecordsPanel(
  value: Record<string, unknown>,
  id: string,
): EntityPageRecordsPanel {
  return {
    id,
    type: "records",
    title: typeof value.title === "string" ? value.title.trim() || null : null,
  };
}

function normalizeCashFlow(
  value: unknown,
): EntityPageAggregateCashFlow | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const dateFieldId =
    typeof raw.dateFieldId === "string" ? raw.dateFieldId.trim() : "";
  const directionFieldId =
    typeof raw.directionFieldId === "string" ? raw.directionFieldId.trim() : "";
  const amountFieldId =
    typeof raw.amountFieldId === "string" ? raw.amountFieldId.trim() : "";
  const incomeOptionIds = normalizeIdList(raw.incomeOptionIds);
  const expenseOptionIds = normalizeIdList(raw.expenseOptionIds);
  if (
    !dateFieldId ||
    !directionFieldId ||
    !amountFieldId ||
    incomeOptionIds.length === 0 ||
    expenseOptionIds.length === 0
  ) {
    return undefined;
  }
  return {
    dateFieldId,
    directionFieldId,
    amountFieldId,
    incomeOptionIds,
    expenseOptionIds,
  };
}

function normalizeAggregatePanel(
  value: Record<string, unknown>,
  id: string,
): EntityPageAggregatePanel {
  const cashFlow = normalizeCashFlow(value.cashFlow);
  return {
    id,
    type: "aggregate",
    title: typeof value.title === "string" ? value.title.trim() || null : null,
    groupFieldIds: normalizeIdList(value.groupFieldIds),
    valueFieldIds: normalizeIdList(value.valueFieldIds),
    showRecordCount: value.showRecordCount !== false,
    ...(cashFlow ? { cashFlow } : {}),
  };
}

function normalizeFiltersPanel(
  value: Record<string, unknown>,
  id: string,
): EntityPageFiltersPanel {
  const fieldIds = Array.isArray(value.fieldIds)
    ? normalizeIdList(value.fieldIds)
    : null;
  return {
    id,
    type: "filters",
    title: typeof value.title === "string" ? value.title.trim() || null : null,
    fieldIds: fieldIds && fieldIds.length > 0 ? fieldIds : null,
    placement: value.placement === "sidebar" ? "sidebar" : "inline",
  };
}

function normalizePanel(value: unknown): EntityPagePanel | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  if (!id) return null;
  if (record.type === "records") return normalizeRecordsPanel(record, id);
  if (record.type === "aggregate") return normalizeAggregatePanel(record, id);
  if (record.type === "filters") return normalizeFiltersPanel(record, id);
  return null;
}

function normalizeRow(
  value: unknown,
  panelIds: ReadonlySet<string>,
): EntityPageRow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  if (!id) return null;
  const ids = normalizeIdList(record.panelIds).filter((panelId) =>
    panelIds.has(panelId),
  );
  if (ids.length === 0) return null;
  return {
    id,
    columns: normalizeColumns(record.columns, ids.length),
    panelIds: ids,
  };
}

/** Parse stored / remote page layout (`null` when empty or invalid). */
export function normalizeEntityPageLayout(
  value: unknown,
): EntityPageLayout | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const panels = Array.isArray(record.panels)
    ? record.panels.flatMap((item) => {
        const panel = normalizePanel(item);
        return panel ? [panel] : [];
      })
    : [];
  if (panels.length === 0) return null;
  const panelIds = new Set(panels.map((panel) => panel.id));
  const rows = Array.isArray(record.rows)
    ? record.rows.flatMap((item) => {
        const row = normalizeRow(item, panelIds);
        return row ? [row] : [];
      })
    : [];
  if (rows.length === 0) return null;
  return { panels, rows };
}

/** Whether the table tab should render the board instead of a flat table. */
export function hasEntityPageLayout(
  entity: Pick<Entity, "pageLayout">,
): boolean {
  const layout = entity.pageLayout;
  return Boolean(layout && layout.panels.length > 0 && layout.rows.length > 0);
}

export function getEntityPagePanel(
  layout: EntityPageLayout,
  panelId: string,
): EntityPagePanel | null {
  return layout.panels.find((panel) => panel.id === panelId) ?? null;
}

/** True when every panel id appears exactly once across rows. */
function boardRowsCoverPanels(
  rows: readonly EntityPageRow[],
  panelIds: ReadonlySet<string>,
): boolean {
  if (rows.length === 0 || panelIds.size === 0) return false;
  const used = new Set<string>();
  for (const row of rows) {
    if (row.panelIds.length === 0) return false;
    for (const panelId of row.panelIds) {
      if (!panelIds.has(panelId) || used.has(panelId)) return false;
      used.add(panelId);
    }
  }
  return used.size === panelIds.size;
}

function defaultSummaryBoardRows(
  aggregateId: string,
  filtersId: string,
  recordsId: string,
  seed?: EntityPageLayout | null,
): EntityPageRow[] {
  return [
    {
      id: seed?.rows[0]?.id ?? newPageLayoutId("row"),
      columns: [2, 1],
      panelIds: [aggregateId, filtersId],
    },
    {
      id: seed?.rows[1]?.id ?? newPageLayoutId("row"),
      columns: [1],
      panelIds: [recordsId],
    },
  ];
}

/**
 * Default board: summary + filters on top, records full width below.
 * Preserves panel ids and custom row arrangement when the seed still
 * references the same three panels once each.
 */
export function createSummaryBoardLayout(
  seed?: EntityPageLayout | null,
): EntityPageLayout {
  const existingAggregate = seed?.panels.find(
    (panel): panel is EntityPageAggregatePanel => panel.type === "aggregate",
  );
  const existingFilters = seed?.panels.find(
    (panel): panel is EntityPageFiltersPanel => panel.type === "filters",
  );
  const existingRecords = seed?.panels.find(
    (panel): panel is EntityPageRecordsPanel => panel.type === "records",
  );

  const aggregateId = existingAggregate?.id ?? newPageLayoutId("panel");
  const filtersId = existingFilters?.id ?? newPageLayoutId("panel");
  const recordsId = existingRecords?.id ?? newPageLayoutId("panel");
  const panelIdSet = new Set([aggregateId, filtersId, recordsId]);

  const preservedRows =
    seed?.rows && boardRowsCoverPanels(seed.rows, panelIdSet)
      ? seed.rows.map((row) => ({
          id: row.id,
          panelIds: [...row.panelIds],
          columns: normalizeColumns(row.columns, row.panelIds.length),
        }))
      : null;

  return {
    panels: [
      {
        id: aggregateId,
        type: "aggregate",
        title: existingAggregate?.title ?? "Сводная таблица",
        groupFieldIds: existingAggregate?.groupFieldIds ?? [],
        valueFieldIds: existingAggregate?.valueFieldIds ?? [],
        showRecordCount: existingAggregate?.showRecordCount ?? true,
        ...(existingAggregate?.cashFlow
          ? { cashFlow: existingAggregate.cashFlow }
          : {}),
      },
      {
        id: filtersId,
        type: "filters",
        title: existingFilters?.title ?? "Фильтры",
        fieldIds: existingFilters?.fieldIds ?? null,
        placement: existingFilters?.placement ?? "sidebar",
      },
      {
        id: recordsId,
        type: "records",
        title: existingRecords?.title ?? null,
      },
    ],
    rows:
      preservedRows ??
      defaultSummaryBoardRows(aggregateId, filtersId, recordsId, seed),
  };
}

/** Swap two panels in the board row grid (by panel id). */
export function swapEntityPageLayoutPanels(
  rows: readonly EntityPageRow[],
  panelIdA: string,
  panelIdB: string,
): EntityPageRow[] {
  if (!panelIdA || !panelIdB || panelIdA === panelIdB) {
    return rows.map((row) => ({
      id: row.id,
      panelIds: [...row.panelIds],
      columns: [...row.columns],
    }));
  }
  return rows.map((row) => ({
    id: row.id,
    columns: [...row.columns],
    panelIds: row.panelIds.map((panelId) => {
      if (panelId === panelIdA) return panelIdB;
      if (panelId === panelIdB) return panelIdA;
      return panelId;
    }),
  }));
}

/**
 * Resize a panel's column fraction within its row (steals/gives from the
 * nearest neighbor). Fractions stay ≥ 1 and keep the same total.
 */
export function resizeEntityPageLayoutRowColumn(
  rows: readonly EntityPageRow[],
  rowId: string,
  panelIndex: number,
  nextFraction: number,
): EntityPageRow[] {
  return rows.map((row) => {
    if (row.id !== rowId || row.panelIds.length < 2) {
      return {
        id: row.id,
        panelIds: [...row.panelIds],
        columns: [...row.columns],
      };
    }
    const columns = normalizeColumns(row.columns, row.panelIds.length);
    if (panelIndex < 0 || panelIndex >= columns.length) {
      return { id: row.id, panelIds: [...row.panelIds], columns };
    }
    const neighborIndex =
      panelIndex < columns.length - 1 ? panelIndex + 1 : panelIndex - 1;
    const current = columns[panelIndex]!;
    const neighbor = columns[neighborIndex]!;
    const pairSum = current + neighbor;
    const clamped = Math.min(
      pairSum - 1,
      Math.max(1, Math.round(nextFraction)),
    );
    const next = [...columns];
    next[panelIndex] = clamped;
    next[neighborIndex] = pairSum - clamped;
    return {
      id: row.id,
      panelIds: [...row.panelIds],
      columns: next,
    };
  });
}

export type EntityAggregateGroupKey = {
  fieldId: string;
  valueId: string;
  label: string;
};

export type EntityAggregateRow = {
  key: string;
  groups: EntityAggregateGroupKey[];
  recordIds: string[];
  totals: Record<string, number>;
  count: number;
  /** Present when the panel has cashFlow mode. */
  cashFlow?: {
    opening: number | null;
    income: number;
    expense: number;
    closing: number;
  };
};

export type EntityCashFlowPeriod = {
  /** YYYY-MM-DD inclusive start; empty = no opening balance. */
  from: string;
  /** YYYY-MM-DD inclusive end; empty = open end. */
  to: string;
};

function extractRecordDatePart(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed.replace(" ", "T"));
  return match?.[1] ?? "";
}

function recordMatchesCashFlowDirection(
  directionIds: readonly string[],
  optionIds: readonly string[],
): boolean {
  if (optionIds.length === 0 || directionIds.length === 0) return false;
  const set = new Set(optionIds);
  return directionIds.some((id) => set.has(id));
}

/**
 * Period cash-flow rows: opening (before `from`), income / expense in range,
 * closing = opening + income − expense. `records` must already exclude the
 * date filter so opening can see history; other filters (wallet, etc.) apply.
 */
export function buildEntityCashFlowRows(
  ctx: EntityValueContext,
  entity: Entity,
  records: readonly EntityRecord[],
  panel: EntityPageAggregatePanel,
  period: EntityCashFlowPeriod,
): EntityAggregateRow[] {
  const cashFlow = panel.cashFlow;
  if (!cashFlow) return [];

  const groupFields = panel.groupFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is EntityField => field != null);
  if (groupFields.length === 0) return [];

  const dateField = entity.fields.find(
    (field) => field.id === cashFlow.dateFieldId,
  );
  const directionField = entity.fields.find(
    (field) => field.id === cashFlow.directionFieldId,
  );
  const amountField = entity.fields.find(
    (field) => field.id === cashFlow.amountFieldId,
  );
  if (!dateField || !directionField || !amountField) return [];

  const valueFields = panel.valueFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is EntityField => field != null);

  const from = period.from.trim();
  const to = period.to.trim();
  const hasOpening = from.length > 0;

  type Acc = {
    key: string;
    groups: EntityAggregateGroupKey[];
    recordIds: string[];
    openingSigned: number;
    income: number;
    expense: number;
    totals: Record<string, number>;
    count: number;
  };

  const byKey = new Map<string, Acc>();

  function ensureRow(groups: EntityAggregateGroupKey[]): Acc {
    const key = groups
      .map((item) => `${item.fieldId}:${item.valueId}`)
      .join("|");
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        groups,
        recordIds: [],
        openingSigned: 0,
        income: 0,
        expense: 0,
        totals: Object.fromEntries(valueFields.map((field) => [field.id, 0])),
        count: 0,
      };
      byKey.set(key, row);
    }
    return row;
  }

  function groupCombosForRecord(
    record: EntityRecord,
  ): EntityAggregateGroupKey[][] {
    const perFieldOptions = groupFields.map((field) => {
      const ids = getRecordFieldIds(ctx, entity, record, field);
      const buckets =
        ids.length === 0
          ? [""]
          : [...new Set(ids.map((id) => id.trim() || ""))];
      return buckets.map((valueId) => ({
        fieldId: field.id,
        valueId,
        label: groupKeyLabel(ctx, field, valueId),
      }));
    });
    let combos: EntityAggregateGroupKey[][] = [[]];
    for (const options of perFieldOptions) {
      const next: EntityAggregateGroupKey[][] = [];
      for (const prefix of combos) {
        for (const option of options) {
          next.push([...prefix, option]);
        }
      }
      combos = next;
    }
    return combos;
  }

  for (const record of records) {
    const date = extractRecordDatePart(record.values[dateField.id] ?? "");
    const directionIds = parseEntityListValueIds(
      record.values[directionField.id] ?? "",
    );
    const amount = getRecordFieldNumber(ctx, entity, record, amountField);
    const amountAbs =
      amount != null && Number.isFinite(amount) ? Math.abs(amount) : 0;
    const isIncome = recordMatchesCashFlowDirection(
      directionIds,
      cashFlow.incomeOptionIds,
    );
    const isExpense = recordMatchesCashFlowDirection(
      directionIds,
      cashFlow.expenseOptionIds,
    );

    const beforePeriod = hasOpening && date.length > 0 && date < from;
    const inPeriod =
      date.length > 0 && (!from || date >= from) && (!to || date <= to);

    if (!beforePeriod && !inPeriod) continue;

    for (const groups of groupCombosForRecord(record)) {
      const row = ensureRow(groups);
      if (beforePeriod) {
        if (isIncome) row.openingSigned += amountAbs;
        else if (isExpense) row.openingSigned -= amountAbs;
        continue;
      }
      // in period
      row.recordIds.push(record.id);
      row.count += 1;
      if (isIncome) row.income += amountAbs;
      else if (isExpense) row.expense += amountAbs;
      for (const field of valueFields) {
        const value = getRecordFieldNumber(ctx, entity, record, field);
        if (value != null)
          row.totals[field.id] = (row.totals[field.id] ?? 0) + value;
      }
    }
  }

  return [...byKey.values()]
    .map((row) => {
      const opening = hasOpening ? row.openingSigned : null;
      const closing = (opening ?? 0) + row.income - row.expense;
      return {
        key: row.key,
        groups: row.groups,
        recordIds: row.recordIds,
        totals: row.totals,
        count: row.count,
        cashFlow: {
          opening,
          income: row.income,
          expense: row.expense,
          closing,
        },
      } satisfies EntityAggregateRow;
    })
    .filter(
      (row) =>
        row.count > 0 ||
        (row.cashFlow?.opening != null && row.cashFlow.opening !== 0) ||
        (row.cashFlow?.income ?? 0) !== 0 ||
        (row.cashFlow?.expense ?? 0) !== 0,
    )
    .sort((a, b) =>
      a.groups
        .map((item) => item.label)
        .join(" / ")
        .localeCompare(b.groups.map((item) => item.label).join(" / "), "ru"),
    );
}

function groupKeyLabel(
  ctx: EntityValueContext,
  field: EntityField,
  valueId: string,
): string {
  if (!valueId) return "Без значения";
  if (field.type === "list") {
    const option = getEntityListOption(
      resolveEntityListFieldOptions(field, ctx.entities),
      valueId,
    );
    return option?.name ?? "Без названия";
  }
  if (field.type === "relation" || field.type === "belonging") {
    const targetId = getEntityRelationTargetId(field) ?? "";
    const target = ctx.entityById.get(targetId) ?? null;
    return resolveRelationRecordLabel(target, valueId) ?? "Без названия";
  }
  return valueId;
}

/**
 * Build aggregate rows: cartesian of multi-list values per record,
 * then merge by composite key and sum value fields.
 */
export function buildEntityAggregateRows(
  ctx: EntityValueContext,
  entity: Entity,
  records: readonly EntityRecord[],
  panel: EntityPageAggregatePanel,
): EntityAggregateRow[] {
  const groupFields = panel.groupFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is EntityField => field != null);
  const valueFields = panel.valueFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is EntityField => field != null);

  if (groupFields.length === 0) return [];

  const byKey = new Map<string, EntityAggregateRow>();

  for (const record of records) {
    const perFieldOptions = groupFields.map((field) => {
      const ids = getRecordFieldIds(ctx, entity, record, field);
      const buckets =
        ids.length === 0
          ? [""]
          : [...new Set(ids.map((id) => id.trim() || ""))];
      return buckets.map((valueId) => ({
        fieldId: field.id,
        valueId,
        label: groupKeyLabel(ctx, field, valueId),
      }));
    });

    // Cartesian product of group values (multi-select → duplicate into buckets).
    let combos: EntityAggregateGroupKey[][] = [[]];
    for (const options of perFieldOptions) {
      const next: EntityAggregateGroupKey[][] = [];
      for (const prefix of combos) {
        for (const option of options) {
          next.push([...prefix, option]);
        }
      }
      combos = next;
    }

    for (const groups of combos) {
      const key = groups
        .map((item) => `${item.fieldId}:${item.valueId}`)
        .join("|");
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          groups,
          recordIds: [],
          totals: Object.fromEntries(valueFields.map((field) => [field.id, 0])),
          count: 0,
        };
        byKey.set(key, row);
      }
      row.recordIds.push(record.id);
      row.count += 1;
      for (const field of valueFields) {
        const value = getRecordFieldNumber(ctx, entity, record, field);
        if (value != null)
          row.totals[field.id] = (row.totals[field.id] ?? 0) + value;
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.groups
      .map((item) => item.label)
      .join(" / ")
      .localeCompare(b.groups.map((item) => item.label).join(" / "), "ru"),
  );
}
