import type { Entity, EntityValueContext } from "@/entities/entity";
import { readDdsOperationFromValues } from "../model/operation-draft";
import {
  parsePlanLinkAmount,
  validatePlanLinks,
  type PlanLinkItem,
} from "../model/plan-links";
import { savePaymentAllocations } from "./use-payment-allocations";

type FormOperation = {
  ctx: EntityValueContext;
  entities: readonly Entity[];
  entity: Entity;
  recordId: string;
  values: Record<string, string>;
};

/** Error text for the links of the ДДС form, or `null` when they can be saved. */
export function validatePaymentPlanLinks(
  form: FormOperation,
  items: readonly PlanLinkItem[],
): string | null {
  const operation = readDdsOperationFromValues(
    form.ctx,
    form.entities,
    form.entity,
    form.recordId,
    form.values,
  );
  if (!operation?.income) return null;
  return validatePlanLinks(items, operation.amount);
}

/**
 * Saves the links after the operation itself is stored (the DB ties them to the
 * record). A operation that is no longer an income keeps no links.
 */
export async function savePaymentPlanLinks(
  form: FormOperation,
  items: readonly PlanLinkItem[],
): Promise<void> {
  const operation = readDdsOperationFromValues(
    form.ctx,
    form.entities,
    form.entity,
    form.recordId,
    form.values,
  );
  if (!operation) return;
  const links = operation.income ? items : [];
  await savePaymentAllocations(
    form.recordId,
    operation.amount,
    links.map((item) => ({
      stageId: item.stageId,
      partKind: item.partKind,
      amount: parsePlanLinkAmount(item.amountText),
    })),
  );
}
