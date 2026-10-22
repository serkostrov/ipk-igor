import { getEntityRelationTargetId } from "./field";
import { getRecordFieldIds, getRecordFieldNumber } from "./field-value";
import {
  getEntityListOption,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
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

function normalizeAggregatePanel(
  value: Record<string, unknown>,
  id: string,
): EntityPageAggregatePanel {
  return {
    id,
    type: "aggregate",
    title: typeof value.title === "string" ? value.title.trim() || null : null,
    groupFieldIds: normalizeIdList(value.groupFieldIds),
    valueFieldIds: normalizeIdList(value.valueFieldIds),
    showRecordCount: value.showRecordCount !== false,
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

/**
 * Default board: summary + filters on top, records full width below.
 * Preserves panel ids when patching an existing layout of the same shape.
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

  return {
    panels: [
      {
        id: aggregateId,
        type: "aggregate",
        title: existingAggregate?.title ?? "Сводная таблица",
        groupFieldIds: existingAggregate?.groupFieldIds ?? [],
        valueFieldIds: existingAggregate?.valueFieldIds ?? [],
        showRecordCount: existingAggregate?.showRecordCount ?? true,
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
    rows: [
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
    ],
  };
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
};

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
