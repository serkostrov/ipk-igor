import {
  parseEntityDecimal,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { findNamedField } from "../match";
import type { DealManualInputs } from "./calculations";

export type DealManualKey = keyof DealManualInputs;

/**
 * Optional deal number fields feeding the calculation (matched by name).
 * Missing fields keep the automatic value.
 */
export const DEAL_MANUAL_FIELD_NAMES: Record<DealManualKey, readonly string[]> =
  {
    plannedLabor: ["Плановая себестоимость"],
    actualLabor: ["Фактическая себестоимость"],
    supportManager: ["Менеджер сопровождения"],
    retro: ["Ретро"],
    employeeBonus: ["Бонус сотрудникам"],
    tkpContractors: ["Подрядчики по ТКП (план)"],
    tkpExpenses: ["Расходы отделов по ТКП (план)"],
    tkpTrips: ["Командировки по ТКП (план)"],
  };

const DEAL_MANUAL_KEYS = Object.keys(
  DEAL_MANUAL_FIELD_NAMES,
) as DealManualKey[];

type DealManualFields = Record<DealManualKey, EntityField | null>;

/** Resolve on the live entity: new fields may be missing from a record's pinned schema. */
function resolveDealManualFields(liveDeal: Entity): DealManualFields {
  return Object.fromEntries(
    DEAL_MANUAL_KEYS.map((key) => [
      key,
      findNamedField(liveDeal, DEAL_MANUAL_FIELD_NAMES[key]),
    ]),
  ) as DealManualFields;
}

export function readDealManualInputs(
  liveDeal: Entity,
  values: Readonly<Record<string, string>>,
): DealManualInputs {
  const fields = resolveDealManualFields(liveDeal);
  return Object.fromEntries(
    DEAL_MANUAL_KEYS.map((key) => {
      const field = fields[key];
      const parsed = field ? parseEntityDecimal(values[field.id] ?? "") : NaN;
      return [key, Number.isFinite(parsed) ? parsed : null];
    }),
  ) as DealManualInputs;
}
