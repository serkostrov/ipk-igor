import {
  isEntityNameField,
  resolveEntityListFieldOptions,
  type Entity,
  type EntityRecord,
  type EntityTimelineSetup,
} from "@/entities/entity";
import { findNamedField, findRelationTo } from "../match";
import type { PaymentCalendarSources } from "../match";
import type { PaymentRow } from "./types";

function planRelationFactory(entity: Entity, sources: PaymentCalendarSources) {
  const links = [
    [
      "article",
      findRelationTo(entity, sources.article, ["Статья", "Статья ДДС"]),
    ],
    ["deal", findRelationTo(entity, sources.deal, ["Сделка"])],
    ["legal", findRelationTo(entity, sources.legal, ["Юрлицо"])],
    [
      "counterparty",
      findRelationTo(entity, sources.counterparty, ["Контрагент"]),
    ],
    ["contract", findRelationTo(entity, sources.contract, ["Договор"])],
    [
      "stage",
      findRelationTo(entity, sources.stage, ["Этап по договору", "Этап"]),
    ],
  ] as const;

  return ({ stage }: PaymentRow) => {
    const values: Record<string, string> = {};
    const ids = {
      article: stage.articleId,
      deal: stage.dealId,
      legal: stage.legal?.id,
      counterparty: stage.counterparty?.id,
      contract: stage.contract?.id,
      stage: stage.id,
    };
    for (const [key, field] of links) {
      if (field && ids[key]) values[field.id] = ids[key];
    }
    return values;
  };
}

/**
 * Planned payments as virtual ДДС records, so the DDS browse filters (search,
 * period, legal entity, counterparty…) apply to plan and fact the same way.
 */
export function createPlanRecordFactory(
  entity: Entity,
  sources: PaymentCalendarSources,
  setup: EntityTimelineSetup | null,
): (row: PaymentRow) => EntityRecord {
  const startField =
    setup?.startField ?? findNamedField(entity, ["Дата"], ["datetime"]);
  const endField = setup?.endField ?? startField;
  const amountField =
    setup?.labelField ??
    findNamedField(entity, ["Сумма с НДС", "Сумма", "С НДС"]);
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const relations = planRelationFactory(entity, sources);
  return (row) => {
    const { stage } = row;
    const values: Record<string, string> = {};
    const date = row.dueDate ? `${row.dueDate}T00:00` : "";
    if (startField) values[startField.id] = date;
    if (endField) values[endField.id] = date;
    if (amountField) values[amountField.id] = String(row.amount);
    if (nameField) {
      values[nameField.id] = [stage.contract?.name, stage.name]
        .filter(Boolean)
        .join(" · ");
    }
    Object.assign(values, relations(row));
    return {
      id: `plan:${row.key}`,
      values,
      authUserId: null,
      createdBy: null,
      schemaVersion: 1,
    };
  };
}

export function paymentReceiptPreset(
  entity: Entity,
  sources: PaymentCalendarSources,
  row: PaymentRow,
  entities: readonly Entity[],
  date: string,
) {
  const values = planRelationFactory(entity, sources)(row);
  const amount = findNamedField(entity, ["Сумма с НДС", "Сумма", "С НДС"]);
  const dateField = findNamedField(entity, ["Дата"], ["datetime"]);
  const movement = findNamedField(entity, [
    "Тип движения",
    "Движение",
    "Вид движения",
  ]);
  const name = entity.fields.find(isEntityNameField);
  if (name)
    values[name.id] = [row.stage.contract?.name, row.stage.name]
      .filter(Boolean)
      .join(" · ");
  if (amount) values[amount.id] = String(row.remaining);
  if (dateField) values[dateField.id] = date + "T00:00";
  if (movement?.type === "list") {
    const option = resolveEntityListFieldOptions(movement, entities).find(
      (item) =>
        ["поступление", "приход", "доход"].includes(
          item.name.trim().toLocaleLowerCase("ru"),
        ),
    );
    if (option) values[movement.id] = option.id;
  } else if (movement?.type === "text") {
    values[movement.id] = "Поступление";
  }
  return values;
}

/** Keep only fields shared by the selected plans, preserving manual input. */
export function reconcileReceiptPreset(
  entity: Entity,
  values: Record<string, string>,
  previous: Record<string, string>,
  presets: Record<string, string>[],
  firstSelection: boolean,
) {
  const patch: Record<string, string> = {};
  const automatic: Record<string, string> = {};
  for (const field of entity.fields) {
    // Keep the operation amount/date when changing the allocation split.
    const describesPlan =
      field.type === "relation" ||
      field.type === "belonging" ||
      isEntityNameField(field);
    if (!describesPlan && !firstSelection) continue;
    const id = field.id;
    if (values[id]?.trim() && values[id] !== previous[id]) continue;
    const value = presets[0]?.[id] ?? "";
    if (value && presets.every((preset) => preset[id] === value)) {
      patch[id] = value;
      automatic[id] = value;
    } else if (previous[id] && describesPlan) {
      patch[id] = "";
    }
  }
  return { patch, automatic };
}
