import {
  isEntityNameField,
  type Entity,
  type EntityRecord,
  type EntityTimelineSetup,
} from "@/entities/entity";
import { findNamedField, findRelationTo } from "../match";
import type { PaymentCalendarSources } from "../match";
import type { PaymentRow } from "./types";

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
    setup?.labelField ?? findNamedField(entity, ["Сумма с НДС", "Сумма"]);
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const links = [
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
    const ids = {
      legal: stage.legal?.id,
      counterparty: stage.counterparty?.id,
      contract: stage.contract?.id,
      stage: stage.id,
    };
    for (const [key, field] of links) {
      if (field && ids[key]) values[field.id] = ids[key];
    }
    return {
      id: `plan:${row.key}`,
      values,
      authUserId: null,
      createdBy: null,
      schemaVersion: 1,
    };
  };
}
